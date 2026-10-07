"""GeoSat Pro API - Sentinel-2 y Landsat 8/9 sobre Google Earth Engine."""
import asyncio
import io
import json
import math
import os
import re
import tempfile
import time
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Dict, List, Literal, Optional

import ee
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

# --------------------------------------------------------------------------
# Configuración (todo se puede sobreescribir con variables de entorno)
# --------------------------------------------------------------------------
PROJECT_ID = os.getenv("EE_PROJECT", "project-113b6d7e-674b-4a18-81e")
CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000",
).split(",")

try:
    ee.Initialize(project=PROJECT_ID)
except Exception:
    ee.Authenticate()
    ee.Initialize(project=PROJECT_ID)

app = FastAPI(title="GeoSat Pro API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Escala-Usada"],
)

executor = ThreadPoolExecutor(max_workers=10)
executor_thumbs = ThreadPoolExecutor(max_workers=8)  # separado para no bloquear al principal

# --------------------------------------------------------------------------
# Constantes
# --------------------------------------------------------------------------
S2_COL = "COPERNICUS/S2_SR_HARMONIZED"
S2_SPACECRAFT = {"S2A_L2A": "Sentinel-2A", "S2B_L2A": "Sentinel-2B"}
LANDSAT_COLS = {"L8_T1": "LANDSAT/LC08/C02/T1_L2", "L9_T1": "LANDSAT/LC09/C02/T1_L2"}

# Todo se normaliza a nombres de bandas Sentinel-2 y reflectancia x 10000,
# así los índices y visualizaciones funcionan igual para ambas familias.
S2_NOMBRES = ["B2", "B3", "B4", "B8", "B11", "B12"]
LANDSAT_SR = ["SR_B2", "SR_B3", "SR_B4", "SR_B5", "SR_B6", "SR_B7"]

S2_BANDAS_VALIDAS = {"B2", "B3", "B4", "B5", "B6", "B7", "B8", "B8A", "B11", "B12"}
LANDSAT_BANDAS = {
    "B1": "SR_B1", "B2": "SR_B2", "B3": "SR_B3", "B4": "SR_B4",
    "B5": "SR_B5", "B6": "SR_B6", "B7": "SR_B7", "B10": "ST_B10",
}

INDICES = ("NDVI", "NDWI", "SAVI", "NBR")
IndiceZonas = Literal["NDVI", "NDWI", "SAVI", "NBR"]

PALETA_NDVI = ["a50026", "d73027", "f46d43", "fdae61", "fee08b",
               "ffffbf", "d9ef8b", "a6d96a", "66bd63", "1a9850"]
PALETA_AGUA = ["081d58", "225ea8", "41b6c4", "a1dab4", "ffffcc"]

PALETAS_ZONAS = {
    2: ["#d73027", "#1a9850"],
    3: ["#d73027", "#ffffbf", "#1a9850"],
    4: ["#d73027", "#fdae61", "#a6d96a", "#1a9850"],
    5: ["#d73027", "#fc8d59", "#fee08b", "#d9ef8b", "#91cf60", "#1a9850"],
}

# --------------------------------------------------------------------------
# Modelos de request
# --------------------------------------------------------------------------
class BuscarEscenasRequest(BaseModel):
    geojson: dict
    fecha_inicio: str
    fecha_fin: str
    nubosidad_max: float = Field(20, ge=0, le=100)
    sensores: List[str] = ["S2A_L2A", "S2B_L2A"]
    limite: int = Field(20, ge=1, le=60)


class ObtenerCapaRequest(BaseModel):
    escena_id: str
    modo_viz: str
    geojson: Optional[dict] = None
    enmascarar_nubes: bool = True


class DescargarRasterRequest(BaseModel):
    escena_id: str
    modo_viz: str = "NDVI"
    geojson: dict
    formato: Literal["geotiff", "png"] = "geotiff"
    enmascarar_nubes: bool = True


class DescargarBandasRequest(BaseModel):
    escena_id: str
    bandas: List[str] = Field(..., min_length=1)
    geojson: dict


class ZonasRequest(BaseModel):
    escena_id: str
    indice: IndiceZonas = "NDVI"
    num_clusters: int = Field(3, ge=2, le=5)
    superficie_min_m2: float = Field(2000.0, ge=0)
    metodo: Literal["cuantiles", "intervalos"] = "cuantiles"
    enmascarar_nubes: bool = True
    geojson: dict


class DescargarVectorRequest(ZonasRequest):
    formato: Literal["geojson", "shp", "gpkg"] = "geojson"


class IdentificarPixelRequest(BaseModel):
    escena_id: str
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    indice: str
    enmascarar_nubes: bool = True


class SerieTemporalRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    indice: IndiceZonas = "NDVI"
    fecha_inicio: str
    fecha_fin: str
    sensores: List[str] = ["S2A_L2A", "S2B_L2A"]
    nubosidad_max: float = Field(30, ge=0, le=100)
    enmascarar_nubes: bool = True


# --------------------------------------------------------------------------
# Utilidades
# --------------------------------------------------------------------------
_CACHE: Dict[str, tuple] = {}


def _cache_get(clave: str, ttl: int):
    item = _CACHE.get(clave)
    if item and time.time() - item[0] < ttl:
        return item[1]
    return None


def _cache_set(clave: str, valor):
    if len(_CACHE) > 200:
        _CACHE.clear()
    _CACHE[clave] = (time.time(), valor)


def _clave(nombre: str, req: BaseModel) -> str:
    return nombre + json.dumps(req.__dict__, sort_keys=True, default=str)


async def _ejecutar(fn, *args):
    loop = asyncio.get_running_loop()
    try:
        return await loop.run_in_executor(executor, fn, *args)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ee.EEException as e:
        raise HTTPException(status_code=502, detail=f"Earth Engine: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _geometria(geojson: dict) -> ee.Geometry:
    """Acepta FeatureCollection, Feature o Geometry; usa todas las geometrías."""
    tipo = geojson.get("type")
    if tipo == "FeatureCollection":
        geoms = [f["geometry"] for f in geojson.get("features", []) if f.get("geometry")]
    elif tipo == "Feature":
        geoms = [geojson["geometry"]]
    else:
        geoms = [geojson]
    if not geoms:
        raise ValueError("El GeoJSON no contiene geometrías.")
    if len(geoms) == 1:
        return ee.Geometry(geoms[0])
    return ee.Geometry({"type": "GeometryCollection", "geometries": geoms})


def _es_landsat(escena_id: str) -> bool:
    return escena_id.startswith("LANDSAT/")


def _escala(escena_id: str) -> int:
    return 30 if _es_landsat(escena_id) else 10


def _mascara_s2(img):
    scl = img.select("SCL")  # 3 sombra, 8/9 nube, 10 cirro, 11 nieve
    malo = scl.eq(3).Or(scl.eq(8)).Or(scl.eq(9)).Or(scl.eq(10)).Or(scl.eq(11))
    return img.updateMask(malo.Not())


def _mascara_landsat(img):
    qa = img.select("QA_PIXEL")  # bit1 nube dilatada, 2 cirro, 3 nube, 4 sombra
    malo = qa.bitwiseAnd(0b11110).neq(0)
    return img.updateMask(malo.Not())


def _base(img, landsat: bool, enmascarar: bool):
    if landsat:
        if enmascarar:
            img = _mascara_landsat(img)
        return img.select(LANDSAT_SR, S2_NOMBRES).multiply(0.0000275).add(-0.2).multiply(10000)
    if enmascarar:
        img = _mascara_s2(img)
    return img.select(S2_NOMBRES)


def _indice(base, modo: str):
    if modo == "NDVI":
        return base.normalizedDifference(["B8", "B4"]).rename("NDVI")
    if modo == "NDWI":
        return base.normalizedDifference(["B3", "B8"]).rename("NDWI")
    if modo == "NBR":
        return base.normalizedDifference(["B8", "B12"]).rename("NBR")
    if modo == "SAVI":
        # SAVI se define sobre reflectancia 0-1 (antes se calculaba sobre valores x10000)
        return base.expression(
            "((N - R) / (N + R + 0.5)) * 1.5",
            {"N": base.select("B8").divide(10000), "R": base.select("B4").divide(10000)},
        ).rename("SAVI")
    combinaciones = {
        "Infrarrojo Color": ["B8", "B4", "B3"],
        "Agricultura": ["B11", "B8", "B2"],
        "Tierra/Agua": ["B8", "B11", "B4"],
    }
    return base.select(combinaciones.get(modo, ["B4", "B3", "B2"]))


def _procesar(escena_id: str, modo: str, enmascarar: bool = True):
    """Máscara de nubes solo en índices; en composiciones se quieren ver las nubes."""
    usar_mascara = enmascarar and modo in INDICES
    return _indice(_base(ee.Image(escena_id), _es_landsat(escena_id), usar_mascara), modo)


def _vis_params(modo: str) -> dict:
    if modo in ("NDVI", "SAVI", "NBR"):
        return {"min": -0.1, "max": 1.0, "palette": PALETA_NDVI}
    if modo == "NDWI":
        return {"min": -1.0, "max": 1.0, "palette": PALETA_AGUA}
    return {"min": 0, "max": 3000}


def _imagen_bandas(escena_id: str, bandas: List[str]):
    if _es_landsat(escena_id):
        img = ee.Image(escena_id)
        salida = []
        for b in bandas:
            nombre = LANDSAT_BANDAS.get(b)
            if not nombre:
                raise ValueError(f"Banda no válida para Landsat: {b}")
            if nombre.startswith("SR_"):
                banda = img.select(nombre).multiply(0.0000275).add(-0.2).multiply(10000)
            else:  # térmica en Kelvin
                banda = img.select(nombre).multiply(0.00341802).add(149.0)
            salida.append(banda.rename(b))
        return ee.Image.cat(salida).toFloat()
    nombres = [re.sub(r"^B0(\d)$", r"B\1", b) for b in bandas]
    for n in nombres:
        if n not in S2_BANDAS_VALIDAS:
            raise ValueError(f"Banda no válida para Sentinel-2: {n}")
    return ee.Image(escena_id).select(nombres).rename(bandas).toFloat()


def _escala_segura(geom, escala_base: float, n_bandas: int, limite_bytes: float = 30e6) -> int:
    """Earth Engine limita las descargas directas (~32 MB): se agranda el píxel si hace falta."""
    area = geom.area(1).getInfo()
    escala = float(escala_base)
    while area / (escala * escala) * n_bandas * 4 > limite_bytes:
        escala *= 1.5
    return int(math.ceil(escala))


def _bajar(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=300) as r:
        return r.read()


# --------------------------------------------------------------------------
# Búsqueda de escenas
# --------------------------------------------------------------------------
def _feature_a_escena(f: dict, landsat: bool) -> dict:
    p = f["properties"]
    ms = p.get("system:time_start") or 0
    fecha = datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d") if ms else "N/A"
    if landsat:
        satelite = "Landsat " + str(p.get("SPACECRAFT_ID", "")).replace("LANDSAT_", "")
        nubosidad = p.get("CLOUD_COVER", 0)
        tile = f"{p.get('WRS_PATH')}/{p.get('WRS_ROW')}"
    else:
        satelite = p.get("SPACECRAFT_NAME", "Sentinel-2")
        nubosidad = p.get("CLOUDY_PIXEL_PERCENTAGE", 0)
        tile = p.get("MGRS_TILE")
    return {
        "id": f["id"], "fecha": fecha, "nubosidad": round(nubosidad or 0, 1),
        "satelite": satelite, "tile": tile, "_ms": ms,
    }


def _buscar_escenas_sync(req: BuscarEscenasRequest):
    clave = _clave("buscar", req)
    cacheado = _cache_get(clave, ttl=600)
    if cacheado:
        return cacheado

    geom = _geometria(req.geojson)
    activos = set(req.sensores)
    encontradas = []

    nombres_s2 = [S2_SPACECRAFT[s] for s in activos if s in S2_SPACECRAFT]
    if nombres_s2:
        col = (ee.ImageCollection(S2_COL).filterBounds(geom)
               .filterDate(req.fecha_inicio, req.fecha_fin)
               .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", req.nubosidad_max))
               .filter(ee.Filter.inList("SPACECRAFT_NAME", nombres_s2))
               .sort("system:time_start", False).limit(req.limite))
        encontradas += [_feature_a_escena(f, False) for f in col.getInfo()["features"]]

    for clave_sensor, col_id in LANDSAT_COLS.items():
        if clave_sensor in activos:
            col = (ee.ImageCollection(col_id).filterBounds(geom)
                   .filterDate(req.fecha_inicio, req.fecha_fin)
                   .filter(ee.Filter.lt("CLOUD_COVER", req.nubosidad_max))
                   .sort("system:time_start", False).limit(req.limite))
            encontradas += [_feature_a_escena(f, True) for f in col.getInfo()["features"]]

    encontradas.sort(key=lambda e: e["_ms"], reverse=True)
    encontradas = encontradas[: req.limite]

    def miniatura(escena):
        try:
            img = _procesar(escena["id"], "RGB Clásico", enmascarar=False)
            return img.getThumbURL({"region": geom, "dimensions": 128, "min": 0, "max": 3000, "format": "jpg"})
        except Exception:
            return None

    for escena, thumb in zip(encontradas, executor_thumbs.map(miniatura, encontradas)):
        escena["thumb"] = thumb
        escena.pop("_ms", None)

    resultado = {"escenas": encontradas}
    _cache_set(clave, resultado)
    return resultado


@app.post("/api/buscar-escenas")
async def buscar_escenas(req: BuscarEscenasRequest):
    return await _ejecutar(_buscar_escenas_sync, req)


# --------------------------------------------------------------------------
# Capa de mapa
# --------------------------------------------------------------------------
def _obtener_capa_sync(req: ObtenerCapaRequest):
    clave = _clave("capa", req)
    cacheado = _cache_get(clave, ttl=7200)
    if cacheado:
        return cacheado
    vis = _vis_params(req.modo_viz)
    img = _procesar(req.escena_id, req.modo_viz, req.enmascarar_nubes)
    map_id = img.getMapId(vis)
    resultado = {"tile_url": map_id["tile_fetcher"].url_format, "vis": vis}
    _cache_set(clave, resultado)
    return resultado


@app.post("/api/obtener-capa")
async def obtener_capa(req: ObtenerCapaRequest):
    return await _ejecutar(_obtener_capa_sync, req)


# --------------------------------------------------------------------------
# Zonas de manejo
# --------------------------------------------------------------------------
def _clasificar(req: ZonasRequest):
    geom = _geometria(req.geojson)
    escala = _escala(req.escena_id)
    n = req.num_clusters
    img_idx = _procesar(req.escena_id, req.indice, req.enmascarar_nubes).clip(geom)
    opciones = dict(geometry=geom, scale=escala, maxPixels=1e9, bestEffort=True)

    if req.metodo == "intervalos":
        st = img_idx.reduceRegion(ee.Reducer.percentile([2, 98]), **opciones).getInfo()
        lo, hi = st.get(f"{req.indice}_p2"), st.get(f"{req.indice}_p98")
        if lo is None or hi is None:
            raise ValueError("No hay píxeles válidos en el lote (¿todo nubes o sombra?).")
        cortes = [lo + (hi - lo) * i / n for i in range(1, n)]
    else:
        pcts = [round(i * 100 / n) for i in range(1, n)]
        st = img_idx.reduceRegion(ee.Reducer.percentile(pcts), **opciones).getInfo()
        cortes = [st.get(f"{req.indice}_p{p}") for p in pcts]
        if any(c is None for c in cortes):
            raise ValueError("No hay píxeles válidos en el lote (¿todo nubes o sombra?).")

    clasif = ee.Image(1)
    for i, c in enumerate(cortes):
        clasif = clasif.where(img_idx.gt(c), i + 2)

    radio = max(1, int(round(math.sqrt(req.superficie_min_m2 / math.pi) / escala)))
    suave = clasif.focalMode(radius=radio, kernelType="circle", units="pixels")
    final = suave.clip(geom).updateMask(img_idx.mask()).rename("zona")
    return final, geom, escala, cortes


def _vectorizar(final, geom, escala):
    return final.reduceToVectors(
        geometry=geom, crs="EPSG:4326", scale=escala, geometryType="polygon",
        eightConnected=False, labelProperty="zona", maxPixels=1e9, bestEffort=True,
    )


def _rango(i: int, n: int, cortes: List[float]) -> str:
    if i == 0:
        return f"≤ {cortes[0]:.2f}"
    if i == n - 1:
        return f"> {cortes[-1]:.2f}"
    return f"{cortes[i - 1]:.2f} – {cortes[i]:.2f}"


def _clusterizar_sync(req: ZonasRequest):
    final, geom, escala, cortes = _clasificar(req)
    n = req.num_clusters
    paleta = PALETAS_ZONAS[n]

    tiles = final.getMapId({"min": 1, "max": n, "palette": [c.lstrip("#") for c in paleta]})
    bordes = ee.Image().toByte().paint(featureCollection=_vectorizar(final, geom, escala), color=1, width=2)
    tiles_bordes = bordes.getMapId({"palette": ["000000"]})

    # Áreas reales por zona (antes se repartían en partes iguales)
    grupos = (ee.Image.pixelArea().addBands(final)
              .reduceRegion(ee.Reducer.sum().group(groupField=1, groupName="zona"),
                            geometry=geom, scale=escala, maxPixels=1e9, bestEffort=True)
              .getInfo().get("groups", []))
    m2_por_zona = {int(g["zona"]): g["sum"] for g in grupos}
    clasificado = sum(m2_por_zona.values()) or 1.0

    area_total_m2 = geom.area(1).getInfo()
    zonas = []
    for i in range(n):
        m2 = m2_por_zona.get(i + 1, 0.0)
        zonas.append({
            "zona": i + 1, "etiqueta": f"Zona {i + 1}", "color": paleta[i],
            "rango": _rango(i, n, cortes),
            "porcentaje": round(m2 / clasificado * 100, 1),
            "m2": round(m2), "ha": round(m2 / 1e4, 2), "km2": round(m2 / 1e6, 3),
        })

    return {
        "tile_url": tiles["tile_fetcher"].url_format,
        "border_tile_url": tiles_bordes["tile_fetcher"].url_format,
        "zonas": zonas,
        "cortes": [round(c, 4) for c in cortes],
        "area_total_m2": round(area_total_m2),
        "area_total_ha": round(area_total_m2 / 1e4, 2),
        "area_total_km2": round(area_total_m2 / 1e6, 3),
        "area_sin_dato_ha": round(max(area_total_m2 - clasificado, 0) / 1e4, 2),
    }


@app.post("/api/clusterizar-lote")
async def clusterizar_lote(req: ZonasRequest):
    return await _ejecutar(_clusterizar_sync, req)


def _empaquetar_vectores(datos: dict, nombre: str, formato: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{nombre}.geojson", json.dumps(datos))
        if formato in ("shp", "gpkg"):
            try:
                import geopandas as gpd
            except ImportError:
                zf.writestr("LEEME.txt", "Para exportar Shapefile/GeoPackage instala geopandas "
                                         "(pip install geopandas). Se incluye el GeoJSON.")
            else:
                gdf = gpd.GeoDataFrame.from_features(datos["features"], crs="EPSG:4326")
                with tempfile.TemporaryDirectory() as tmp:
                    if formato == "gpkg":
                        gdf.to_file(os.path.join(tmp, f"{nombre}.gpkg"), driver="GPKG")
                    else:
                        gdf.to_file(os.path.join(tmp, f"{nombre}.shp"))
                    for archivo in os.listdir(tmp):
                        zf.write(os.path.join(tmp, archivo), archivo)
    return buf.getvalue()


def _descargar_vector_sync(req: DescargarVectorRequest):
    final, geom, escala, _ = _clasificar(req)
    datos = _vectorizar(final, geom, escala).getInfo()
    nombre = f"zonas_manejo_{req.indice.lower()}"
    return _empaquetar_vectores(datos, nombre, req.formato), nombre


@app.post("/api/descargar-vector-ambientacion")
async def descargar_vector_ambientacion(req: DescargarVectorRequest):
    contenido, nombre = await _ejecutar(_descargar_vector_sync, req)
    return Response(contenido, media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{nombre}_{req.formato}.zip"'})


# --------------------------------------------------------------------------
# Descargas raster
# --------------------------------------------------------------------------
def _descargar_raster_sync(req: DescargarRasterRequest):
    geom = _geometria(req.geojson)
    img = _procesar(req.escena_id, req.modo_viz, req.enmascarar_nubes).clip(geom)
    nombre = f"{req.modo_viz}".replace("/", "-").replace(" ", "_")

    if req.formato == "png":
        vis = _vis_params(req.modo_viz)
        url = img.getThumbURL({**vis, "region": geom, "dimensions": 2048, "format": "png"})
        return _bajar(url), "image/png", "png", None

    n_bandas = 1 if req.modo_viz in INDICES else 3
    escala = _escala_segura(geom, _escala(req.escena_id), n_bandas)
    url = img.toFloat().getDownloadURL({
        "name": nombre, "scale": escala, "crs": "EPSG:4326", "region": geom, "format": "GEO_TIFF",
    })
    return _bajar(url), "image/tiff", "tif", escala


@app.post("/api/descargar-raster")
async def descargar_raster(req: DescargarRasterRequest):
    contenido, mime, ext, escala = await _ejecutar(_descargar_raster_sync, req)
    headers = {"Content-Disposition": f'attachment; filename="{req.modo_viz.replace("/", "-")}.{ext}"'}
    if escala:
        headers["X-Escala-Usada"] = str(escala)
    return Response(contenido, media_type=mime, headers=headers)


def _descargar_bandas_sync(req: DescargarBandasRequest):
    geom = _geometria(req.geojson)
    img = _imagen_bandas(req.escena_id, req.bandas).clip(geom)
    escala = _escala_segura(geom, _escala(req.escena_id), len(req.bandas))
    url = img.getDownloadURL({
        "name": "bandas", "scale": escala, "crs": "EPSG:4326", "region": geom,
        "format": "ZIPPED_GEO_TIFF", "filePerBand": True,
    })
    return _bajar(url), escala


@app.post("/api/descargar-escena-bandas")
async def descargar_escena_bandas(req: DescargarBandasRequest):
    contenido, escala = await _ejecutar(_descargar_bandas_sync, req)
    return Response(contenido, media_type="application/zip",
                    headers={"Content-Disposition": 'attachment; filename="bandas.zip"',
                             "X-Escala-Usada": str(escala)})


# --------------------------------------------------------------------------
# Píxel y series temporales
# --------------------------------------------------------------------------
def _identificar_pixel_sync(req: IdentificarPixelRequest):
    punto = ee.Geometry.Point([req.lng, req.lat])
    img = _procesar(req.escena_id, req.indice, req.enmascarar_nubes)
    val = img.reduceRegion(ee.Reducer.first(), punto, _escala(req.escena_id)).getInfo() or {}
    valores = {k: round(v, 4) for k, v in val.items() if v is not None}
    valor = next(iter(valores.values())) if len(valores) == 1 else "N/A" if not valores else None
    return {"lat": req.lat, "lng": req.lng, "valor": valor, "valores": valores}


@app.post("/api/identificar-pixel")
async def identificar_pixel(req: IdentificarPixelRequest):
    return await _ejecutar(_identificar_pixel_sync, req)


def _serie_coleccion(col, landsat: bool, punto, req: SerieTemporalRequest, escala: int, etiqueta: str):
    def extraer(img):
        idx = _indice(_base(img, landsat, req.enmascarar_nubes), req.indice)
        m = idx.reduceRegion(ee.Reducer.first(), punto, escala)
        return ee.Feature(None, {"fecha": img.date().format("YYYY-MM-dd"),
                                 "valor": m.get(req.indice), "sat": etiqueta})
    return col.map(extraer).getInfo()["features"]


def _serie_temporal_sync(req: SerieTemporalRequest):
    punto = ee.Geometry.Point([req.lng, req.lat])
    activos = set(req.sensores)
    feats = []

    if activos & set(S2_SPACECRAFT):
        col = (ee.ImageCollection(S2_COL).filterBounds(punto)
               .filterDate(req.fecha_inicio, req.fecha_fin)
               .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", req.nubosidad_max)))
        feats += _serie_coleccion(col, False, punto, req, 10, "Sentinel-2")

    for clave, col_id in LANDSAT_COLS.items():
        if clave in activos:
            col = (ee.ImageCollection(col_id).filterBounds(punto)
                   .filterDate(req.fecha_inicio, req.fecha_fin)
                   .filter(ee.Filter.lt("CLOUD_COVER", req.nubosidad_max)))
            feats += _serie_coleccion(col, True, punto, req, 30, "Landsat")

    vistos, puntos = set(), []
    for f in sorted(feats, key=lambda x: x["properties"]["fecha"]):
        p = f["properties"]
        clave = (p["fecha"], p["sat"])
        if p.get("valor") is None or clave in vistos:  # sin dato (nube) o mosaico duplicado
            continue
        vistos.add(clave)
        puntos.append({"fecha": p["fecha"], "valor": round(p["valor"], 4), "sat": p["sat"]})
    return {"puntos": puntos}


@app.post("/api/serie-temporal-pixel")
async def serie_temporal_pixel(req: SerieTemporalRequest):
    return await _ejecutar(_serie_temporal_sync, req)


@app.get("/api/salud")
def salud():
    return {"ok": True, "proyecto": PROJECT_ID}
