import io
import json
import math
import zipfile
from typing import Any

import numpy as np
import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from scipy.ndimage import gaussian_filter, zoom
from skimage import measure

router = APIRouter(tags=["curvas"])

MAX_NIVELES = 400
MAX_PIXELES = 4_000_000


class CurvasIn(BaseModel):
    geojson: dict[str, Any]
    equidistancia: float = Field(gt=0, le=1000)
    suavizado: float = Field(default=0.6, ge=0, le=1)


def _chaikin(puntos, iteraciones=2):
    p = np.asarray(puntos, dtype=float)
    if len(p) < 3:
        return p
    cerrada = np.allclose(p[0], p[-1])
    for _ in range(iteraciones):
        a, b = p[:-1], p[1:]
        nuevo = np.empty((2 * len(a), 2))
        nuevo[0::2], nuevo[1::2] = 0.75 * a + 0.25 * b, 0.25 * a + 0.75 * b
        p = np.vstack([nuevo, nuevo[:1]]) if cerrada else np.vstack([p[:1], nuevo, p[-1:]])
    return p


def curvas_desde_dem(dem, x0, y0, dx, dy, equidistancia, suavizado):
    """dem: matriz (filas, columnas), NaN = sin dato. (x0, y0): esquina superior izquierda; dx, dy: tamaño de píxel (>0)."""
    dem = np.asarray(dem, dtype="float64")
    if np.isnan(dem).all():
        raise ValueError("El DEM no tiene datos en esta zona.")
    dem = np.where(np.isnan(dem), np.nanmean(dem), dem)

    f = int(max(2, min(8, math.sqrt(MAX_PIXELES / dem.size))))
    z = zoom(dem, f, order=3, mode="nearest", grid_mode=True)
    if suavizado > 0:
        z = gaussian_filter(z, sigma=(0.4 + 2.2 * suavizado) * f, mode="nearest")

    zmin, zmax = float(z.min()), float(z.max())
    niveles = np.arange(math.ceil(zmin / equidistancia) * equidistancia, zmax, equidistancia)
    if len(niveles) == 0:
        raise ValueError("No hay curvas para esa equidistancia: el desnivel del lote es menor.")
    if len(niveles) > MAX_NIVELES:
        raise ValueError(f"La equidistancia es demasiado chica ({len(niveles)} niveles). Probá con un valor mayor.")

    paso = max(1, f // 2)
    salida = []
    for nivel in niveles:
        for c in measure.find_contours(z, float(nivel)):
            if len(c) < 8:
                continue
            c = c[::paso] if len(c) > 3 * paso else c
            c = _chaikin(c, 2)
            xs = x0 + (c[:, 1] + 0.5) * dx / f
            ys = y0 - (c[:, 0] + 0.5) * dy / f
            salida.append({"nivel": float(nivel), "indice": round(nivel / equidistancia) % 5 == 0,
                           "coords": np.column_stack([xs, ys]).tolist()})
    return salida


def _poligono(geojson):
    from shapely.geometry import shape
    from shapely.ops import unary_union
    t = geojson.get("type")
    if t == "FeatureCollection":
        geoms = [shape(f["geometry"]) for f in geojson.get("features", []) if f.get("geometry")]
    elif t == "Feature":
        geoms = [shape(geojson["geometry"])]
    else:
        geoms = [shape(geojson)]
    if not geoms:
        raise ValueError("El lote no tiene geometría.")
    return unary_union(geoms)


def _dem_srtm(poligono, margen_m=200):
    """DEM SRTM de 30 m alrededor del lote (con margen, para evitar efectos de borde)."""
    import ee
    from rasterio.io import MemoryFile
    from shapely.geometry import mapping
    region = ee.Geometry(json.loads(json.dumps(mapping(poligono)))).buffer(margen_m).bounds()
    imagen = ee.Image("USGS/SRTMGL1_003").select("elevation")
    url = imagen.getDownloadURL({"region": region, "scale": 30, "crs": "EPSG:4326", "format": "GEO_TIFF"})
    r = requests.get(url, timeout=120)
    r.raise_for_status()
    datos = r.content
    if datos[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(datos)) as z:
            datos = z.read(next(n for n in z.namelist() if n.lower().endswith(".tif")))
    with MemoryFile(datos) as mf, mf.open() as ds:
        arr = ds.read(1).astype("float64")
        if ds.nodata is not None:
            arr[arr == ds.nodata] = np.nan
        t = ds.transform
        return arr, t.c, t.f, t.a, -t.e


def _lineas(geom):
    if geom.is_empty:
        return
    if geom.geom_type == "LineString":
        yield geom
    elif hasattr(geom, "geoms"):
        for g in geom.geoms:
            yield from _lineas(g)


@router.post("/curvas-nivel")
def curvas_nivel(body: CurvasIn):
    from shapely.geometry import LineString, mapping
    try:
        poligono = _poligono(body.geojson)
        dem, x0, y0, dx, dy = _dem_srtm(poligono)
        lineas = curvas_desde_dem(dem, x0, y0, dx, dy, body.equidistancia, body.suavizado)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"No se pudo obtener el DEM: {e}")

    features = []
    for l in lineas:
        for parte in _lineas(LineString(l["coords"]).intersection(poligono)):  # recorte al límite del lote
            parte = parte.simplify(2e-6, preserve_topology=False)
            if parte.length == 0:
                continue
            features.append({"type": "Feature", "geometry": mapping(parte),
                             "properties": {"elevacion": round(l["nivel"], 2), "indice": l["indice"]}})
    return {"type": "FeatureCollection", "features": features,
            "resumen": {"cantidad": len(features), "equidistancia": body.equidistancia}}