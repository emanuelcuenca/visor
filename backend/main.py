import asyncio
from concurrent.futures import ThreadPoolExecutor
import io
import zipfile
import math
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List
import ee

PROJECT_ID = 'project-113b6d7e-674b-4a18-81e'
try:
    ee.Initialize(project=PROJECT_ID)
except Exception:
    ee.Authenticate()
    ee.Initialize(project=PROJECT_ID)

app = FastAPI(title="GeoSat Pro API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

executor = ThreadPoolExecutor(max_workers=10)

PALETA_NDVI_ESPECTRAL = [
    'a50026', 'd73027', 'f46d43', 'fdae61', 'fee08b',
    'ffffbf', 'd9ef8b', 'a6d96a', '66bd63', '1a9850'
]

PALETAS_RDYLGN = {
    2: ['#d73027', '#1a9850'],
    3: ['#d73027', '#ffffbf', '#1a9850'],
    4: ['#d73027', '#fdae61', '#a6d96a', '#1a9850'],
    5: ['#d73027', '#fc8d59', '#fee08b', '#d9ef8b', '#91cf60', '#1a9850']
}

class BuscarEscenasRequest(BaseModel):
    geojson: dict
    fecha_inicio: str
    fecha_fin: str
    nubosidad_max: float
    sensores: List[str]

class ObtenerCapaRequest(BaseModel):
    escena_id: str
    modo_viz: str
    geojson: dict

class DescargarGeoTIFFRequest(BaseModel):
    escena_id: str
    modo_viz: str
    geojson: dict
    solo_lote: bool = True

class DescargarVectorRequest(BaseModel):
    escena_id: str
    indice: str
    num_clusters: int
    superficie_min_m2: float = 2000.0
    geojson: dict
    formato: str

class IdentificarPixelRequest(BaseModel):
    escena_id: str
    lat: float
    lng: float
    indice: str

class SerieTemporalRequest(BaseModel):
    lat: float
    lng: float
    indice: str
    fecha_inicio: str
    fecha_fin: str
    sensores: List[str]

class ClusterizarLoteRequest(BaseModel):
    escena_id: str
    indice: str
    num_clusters: int
    superficie_min_m2: float = 2000.0
    geojson: dict

def _obtener_imagen_procesada(escena_id: str, modo_viz: str):
    img = ee.Image(escena_id)
    if modo_viz == "NDVI":
        return img.normalizedDifference(['B8', 'B4']).rename('NDVI')
    elif modo_viz == "Infrarrojo Color":
        return img.select(['B8', 'B4', 'B3'])
    elif modo_viz == "Agricultura":
        return img.select(['B11', 'B8', 'B2'])
    elif modo_viz == "Tierra/Agua":
        return img.select(['B8', 'B11', 'B4'])
    elif modo_viz == "NDWI":
        return img.normalizedDifference(['B3', 'B8']).rename('NDWI')
    elif modo_viz == "SAVI":
        b8 = img.select('B8')
        b4 = img.select('B4')
        return img.expression('((NIR - RED) / (NIR + RED + 0.5)) * 1.5', {'NIR': b8, 'RED': b4}).rename('SAVI')
    elif modo_viz == "NBR":
        return img.normalizedDifference(['B8', 'B12']).rename('NBR')
    else:
        return img.select(['B4', 'B3', 'B2'])

def _buscar_escenas_sync(req: BuscarEscenasRequest):
    geom_raw = req.geojson['features'][0]['geometry']
    geom = ee.Geometry(geom_raw)
    
    coleccion = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
                 .filterBounds(geom)
                 .filterDate(req.fecha_inicio, req.fecha_fin)
                 .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', req.nubosidad_max))
                 .sort('system:time_start', False))

    lista_imagenes = coleccion.limit(15).getInfo()['features']
    if not lista_imagenes:
        return {"escenas": []}

    escenas = []
    for img in lista_imagenes:
        img_id = img['id']
        props = img['properties']
        fecha = props['system:index'][:8]
        fecha_fmt = f"{fecha[:4]}-{fecha[4:6]}-{fecha[6:]}" if len(fecha) == 8 else "N/A"
        
        ee_img = ee.Image(img_id)
        thumb_url = ee_img.select(['B4', 'B3', 'B2']).getThumbURL({
            'region': geom,
            'dimensions': 120,
            'min': 0,
            'max': 3000
        })

        escenas.append({
            "id": img_id,
            "fecha": fecha_fmt,
            "nubosidad": round(props.get('CLOUDY_PIXEL_PERCENTAGE', 0), 1),
            "satelite": props.get('SPACECRAFT_NAME', 'Sentinel-2'),
            "thumb": thumb_url
        })

    return {"escenas": escenas}

@app.post("/api/buscar-escenas")
async def buscar_escenas(req: BuscarEscenasRequest):
    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(executor, _buscar_escenas_sync, req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def _obtener_capa_sync(req: ObtenerCapaRequest):
    img_procesada = _obtener_imagen_procesada(req.escena_id, req.modo_viz)
    
    if req.modo_viz == "NDVI":
        vis_params = {'min': -0.1, 'max': 1.0, 'palette': PALETA_NDVI_ESPECTRAL}
    elif req.modo_viz in ["NDWI", "SAVI", "NBR"]:
        vis_params = {'min': -1.0, 'max': 1.0, 'palette': ['081d58', '225ea8', '41b6c4', 'a1dab4', 'ffffcc']}
    else:
        vis_params = {'min': 0, 'max': 3000}

    map_id = img_procesada.getMapId(vis_params)
    return {"tile_url": map_id['tile_fetcher'].url_format}

@app.post("/api/obtener-capa")
async def obtener_capa(req: ObtenerCapaRequest):
    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(executor, _obtener_capa_sync, req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def _generar_clasificacion_suavizada(escena_id: str, indice: str, num_clusters: int, sup_min_m2: float, geojson: dict):
    geom = ee.Geometry(geojson['features'][0]['geometry'])
    img_idx = _obtener_imagen_procesada(escena_id, indice).clip(geom)

    num_clases = max(2, min(5, num_clusters))
    p_step = 100.0 / num_clases
    percentiles = [i * p_step for i in range(1, num_clases)]

    stats = img_idx.reduceRegion(
        reducer=ee.Reducer.percentile(percentiles),
        geometry=geom,
        scale=10,
        maxPixels=1e9
    ).getInfo()

    keys_sorted = sorted(stats.keys())
    cortes = [stats[k] for k in keys_sorted if stats[k] is not None]

    if not cortes:
        cortes = [-0.1 + i * (1.1 / num_clases) for i in range(1, num_clases)]

    img_classified = ee.Image(1)
    for idx, c in enumerate(cortes):
        img_classified = img_classified.where(img_idx.gt(c), idx + 2)

    radio_pixeles = max(1, int(round(math.sqrt(sup_min_m2 / math.pi) / 10.0)))
    img_smoothed = img_classified.focalMode(radius=radio_pixeles, kernelType='circle', units='pixels')
    img_final = img_smoothed.clip(geom).updateMask(img_idx.mask())

    return img_final, geom, num_clases

def _clusterizar_lote_sync(req: ClusterizarLoteRequest):
    img_final, geom, num_clases = _generar_clasificacion_suavizada(
        req.escena_id, req.indice, req.num_clusters, req.superficie_min_m2, req.geojson
    )

    paleta_usada = PALETAS_RDYLGN.get(num_clases, PALETAS_RDYLGN[3])
    paleta_ee = [c.replace('#', '') for c in paleta_usada]

    map_id = img_final.getMapId({'min': 1, 'max': num_clases, 'palette': paleta_ee})

    # DIBUJO DE BORDES ENTRE ZONAS
    borders = ee.Image().toByte().paint(
        featureCollection=img_final.reduceToVectors(
            geometry=geom, crs='EPSG:4326', scale=10, geometryType='polygon', labelProperty='zona'
        ),
        color=1,
        width=2
    )
    map_id_borders = borders.getMapId({'palette': ['000000']})

    area_total_m2 = geom.area().getInfo()
    area_total_ha = round(area_total_m2 / 10000.0, 2)
    area_total_km2 = round(area_total_m2 / 1000000.0, 3)

    zonas = []
    pct_base = round(100.0 / num_clases, 1)
    for i in range(num_clases):
        m2_z = round((area_total_m2 * pct_base) / 100.0, 0)
        ha_z = round((area_total_ha * pct_base) / 100.0, 2)
        km2_z = round((area_total_km2 * pct_base) / 100.0, 3)
        zonas.append({
            "zona": i + 1,
            "etiqueta": f"Zona {i + 1}",
            "color": paleta_usada[i],
            "porcentaje": pct_base,
            "m2": m2_z,
            "ha": ha_z,
            "km2": km2_z
        })

    return {
        "tile_url": map_id['tile_fetcher'].url_format,
        "border_tile_url": map_id_borders['tile_fetcher'].url_format,
        "zonas": zonas,
        "area_total_m2": area_total_m2,
        "area_total_ha": area_total_ha,
        "area_total_km2": area_total_km2
    }

@app.post("/api/clusterizar-lote")
async def clusterizar_lote(req: ClusterizarLoteRequest):
    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(executor, _clusterizar_lote_sync, req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def _descargar_vector_sync(req: DescargarVectorRequest):
    img_final, geom, num_clases = _generar_clasificacion_suavizada(
        req.escena_id, req.indice, req.num_clusters, req.superficie_min_m2, req.geojson
    )

    vectors = img_final.reduceToVectors(
        geometry=geom,
        crs='EPSG:4326',
        scale=10,
        geometryType='polygon',
        eightConnected=False,
        labelProperty='zona'
    )

    geojson_data = vectors.getInfo()

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        nombre_base = f"zonas_manejo_{req.indice.lower()}"
        
        if req.formato == 'gpkg':
            zf.writestr(f"{nombre_base}.gpkg", json.dumps(geojson_data))
            zf.writestr(f"{nombre_base}.geojson", json.dumps(geojson_data))
        else:
            zf.writestr(f"{nombre_base}.geojson", json.dumps(geojson_data))
            zf.writestr(f"{nombre_base}.prj", 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]')
            zf.writestr(f"{nombre_base}_readme.txt", "Capas vectoriales exportadas desde el modulo de Zonas de Manejo.")

    zip_buffer.seek(0)
    return zip_buffer

@app.post("/api/descargar-vector-ambientacion")
async def descargar_vector_ambientacion(req: DescargarVectorRequest):
    loop = asyncio.get_event_loop()
    try:
        zip_stream = await loop.run_in_executor(executor, _descargar_vector_sync, req)
        return StreamingResponse(
            zip_stream,
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename=zonas_manejo_{req.formato}.zip"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def _descargar_geotiff_sync(req: DescargarGeoTIFFRequest):
    img = _obtener_imagen_procesada(req.escena_id, req.modo_viz)
    geom = ee.Geometry(req.geojson['features'][0]['geometry'])
    
    if req.solo_lote:
        img_export = img.clip(geom)
        region = geom
    else:
        img_export = img
        region = img.geometry()

    download_url = img_export.getDownloadURL({
        'name': f"ambientacion_{req.modo_viz}",
        'scale': 10,
        'crs': 'EPSG:4326',
        'region': region,
        'filePerBand': False
    })
    return {"download_url": download_url}

@app.post("/api/descargar-geotiff")
async def descargar_geotiff(req: DescargarGeoTIFFRequest):
    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(executor, _descargar_geotiff_sync, req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def _identificar_pixel_sync(req: IdentificarPixelRequest):
    point = ee.Geometry.Point([req.lng, req.lat])
    img_proc = _obtener_imagen_procesada(req.escena_id, req.indice)
    val = img_proc.reduceRegion(reducer=ee.Reducer.first(), geometry=point, scale=10).getInfo()
    
    key = list(val.keys())[0] if val else None
    valor_num = round(val[key], 4) if key and val[key] is not None else "N/A"
    return {"lat": req.lat, "lng": req.lng, "valor": valor_num}

@app.post("/api/identificar-pixel")
async def identificar_pixel(req: IdentificarPixelRequest):
    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(executor, _identificar_pixel_sync, req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def _serie_temporal_pixel_sync(req: SerieTemporalRequest):
    point = ee.Geometry.Point([req.lng, req.lat])
    col = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
           .filterBounds(point)
           .filterDate(req.fecha_inicio, req.fecha_fin)
           .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
           .sort('system:time_start', True))

    def extraer_val(img):
        ndvi = img.normalizedDifference(['B8', 'B4']).rename('val')
        m = ndvi.reduceRegion(reducer=ee.Reducer.first(), geometry=point, scale=10)
        return ee.Feature(None, {'fecha': img.date().format('YYYY-MM-dd'), 'valor': m.get('val')})

    feats = col.map(extraer_val).getInfo()['features']
    puntos = []
    for f in feats:
        p = f['properties']
        if p.get('valor') is not None:
            puntos.append({'fecha': p['fecha'], 'valor': round(p['valor'], 4)})
    return {"puntos": puntos}

@app.post("/api/serie-temporal-pixel")
async def serie_temporal_pixel(req: SerieTemporalRequest):
    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(executor, _serie_temporal_pixel_sync, req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))