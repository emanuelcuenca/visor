"""Descarga de escenas Sentinel-2 desde Copernicus Data Space (CDSE), en segundo plano.

  POST /api/descargas                  -> crea un trabajo (producto completo o solo bandas)
  GET  /api/descargas?ids=a,b,c        -> estado/historial de esos trabajos
  GET  /api/descargas/{job_id}         -> estado de un trabajo
  GET  /api/descargas/{job_id}/archivo -> entrega el ZIP cuando está listo

Credenciales (NUNCA en el código): variables de entorno CDSE_USER y CDSE_PASS
(pueden ir en un archivo .env junto a main.py).

Los trabajos se guardan en SQLite (descargas/descargas.db): el historial sobrevive
a reinicios del servidor. Los archivos se borran a las DESCARGAS_TTL_HORAS horas.
"""
import os
import re
import sqlite3
import threading
import time
import uuid
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import List, Literal

import requests
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

try:  # opcional: carga el archivo .env si python-dotenv está instalado
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

CDSE_USER = os.getenv("CDSE_USER")
CDSE_PASS = os.getenv("CDSE_PASS")
DIRECTORIO = Path(os.getenv("DESCARGAS_DIR", "descargas"))
TTL_HORAS = float(os.getenv("DESCARGAS_TTL_HORAS", "24"))
DIRECTORIO.mkdir(parents=True, exist_ok=True)
DB_PATH = DIRECTORIO / "descargas.db"

TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
CATALOGO_URL = "https://catalogue.dataspace.copernicus.eu/odata/v1/Products"
DESCARGA_URL = "https://download.dataspace.copernicus.eu/odata/v1/Products"

# Resolución nativa de cada banda en el producto Sentinel-2 L2A.
BANDA_RES = {
    "B01": "R60m", "B02": "R10m", "B03": "R10m", "B04": "R10m", "B05": "R20m",
    "B06": "R20m", "B07": "R20m", "B08": "R10m", "B8A": "R20m", "B09": "R60m",
    "B11": "R20m", "B12": "R20m",
}

# CDSE permite 4 conexiones simultáneas por usuario: usamos 2 para dejar margen.
_pool = ThreadPoolExecutor(max_workers=2)
_LOCK = threading.Lock()
ESTADOS_ACTIVOS = ("en_cola", "buscando", "descargando")

router = APIRouter(prefix="/api/descargas")


# --------------------------------------------------------------------------
# Base de datos
# --------------------------------------------------------------------------
def _sql(sql: str, params=(), uno=False, todos=False):
    with _LOCK:
        con = sqlite3.connect(DB_PATH, timeout=30)
        try:
            con.row_factory = sqlite3.Row
            cur = con.execute(sql, params)
            res = cur.fetchone() if uno else cur.fetchall() if todos else None
            con.commit()
            return res
        finally:
            con.close()


def _init_db():
    _sql("""CREATE TABLE IF NOT EXISTS trabajos (
        id TEXT PRIMARY KEY, producto TEXT, satelite TEXT, fecha TEXT, lote TEXT,
        tipo TEXT, bandas TEXT, estado TEXT, bytes_desc INTEGER DEFAULT 0,
        bytes_total INTEGER DEFAULT 0, error TEXT, archivo TEXT, creado REAL)""")
    _sql("UPDATE trabajos SET estado='error', error=? WHERE estado IN ('en_cola','buscando','descargando')",
         ("Se interrumpió porque el servidor se reinició. Vuelve a pedir la descarga.",))


def _actualizar(job_id: str, **cambios):
    columnas = ", ".join(f"{k}=?" for k in cambios)
    _sql(f"UPDATE trabajos SET {columnas} WHERE id=?", (*cambios.values(), job_id))


def _publico(fila) -> dict:
    estado = fila["estado"]
    total = fila["bytes_total"] or 0
    desc = fila["bytes_desc"] or 0
    if estado == "listo":
        progreso = 100
        if not fila["archivo"] or not Path(fila["archivo"]).exists():
            estado = "expirada"
    else:
        progreso = int(desc * 100 / total) if total else 0
    return {
        "job_id": fila["id"], "estado": estado, "progreso": min(progreso, 100),
        "mb": round(desc / 1e6, 1), "mb_total": round(total / 1e6, 1),
        "error": fila["error"], "tipo": fila["tipo"],
        "bandas": fila["bandas"].split(",") if fila["bandas"] else [],
        "satelite": fila["satelite"], "fecha": fila["fecha"], "lote": fila["lote"],
        "creado": fila["creado"],
    }


_init_db()


# --------------------------------------------------------------------------
# Copernicus
# --------------------------------------------------------------------------
def _token() -> str:
    if not CDSE_USER or not CDSE_PASS:
        raise ValueError("Faltan las variables CDSE_USER y CDSE_PASS en el servidor.")
    r = requests.post(
        TOKEN_URL,
        data={"client_id": "cdse-public", "grant_type": "password",
              "username": CDSE_USER, "password": CDSE_PASS},
        timeout=30,
    )
    if r.status_code in (400, 401):
        raise ValueError("Copernicus rechazó el usuario o la contraseña (revisa CDSE_USER y CDSE_PASS).")
    r.raise_for_status()
    return r.json()["access_token"]


def _consultar(filtro: str) -> list:
    r = requests.get(CATALOGO_URL, params={"$filter": filtro, "$top": 10}, timeout=60)
    r.raise_for_status()
    return r.json().get("value", [])


def _buscar_producto(nombre: str) -> dict:
    """Busca el producto en el catálogo de CDSE a partir del PRODUCT_ID de Earth Engine."""
    if not re.fullmatch(r"[A-Za-z0-9_.\-]+", nombre):
        raise ValueError("Identificador de producto no válido.")
    base = nombre[:-5] if nombre.endswith(".SAFE") else nombre

    encontrados = _consultar(f"Name eq '{base}.SAFE'")
    if not encontrados:
        # Si el producto fue reprocesado cambia la fecha/línea base: buscamos por fecha de sensado y tesela.
        m = re.match(r"^(S2[AB]_MSIL2A_\d{8}T\d{6})_N\d+_R\d+_(T\w{5})_", base)
        if m:
            encontrados = _consultar(
                f"startswith(Name,'{m.group(1)}') and contains(Name,'{m.group(2)}')"
            )
    if not encontrados:
        raise ValueError("No se encontró esa escena en Copernicus Data Space.")
    return sorted(encontrados, key=lambda p: p["Name"], reverse=True)[0]


def _abrir(url: str, token: str) -> requests.Response:
    """CDSE redirige a otro servidor: se siguen las redirecciones a mano para conservar el token."""
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {token}"
    r = s.get(url, allow_redirects=False, stream=True, timeout=60)
    for _ in range(5):
        if r.status_code in (301, 302, 303, 307):
            destino = r.headers["Location"]
            r.close()
            r = s.get(destino, allow_redirects=False, stream=True, timeout=60)
        else:
            break
    if r.status_code in (401, 403):
        raise ValueError("Copernicus rechazó la descarga (token o cuota). Intenta de nuevo en unos minutos.")
    r.raise_for_status()
    return r


def _url_nodo(producto_id: str, ruta: List[str]) -> str:
    return f"{DESCARGA_URL}({producto_id})" + "".join(f"/Nodes({n})" for n in ruta)


def _listar_nodos(producto_id: str, ruta: List[str], token: str) -> list:
    datos = _abrir(_url_nodo(producto_id, ruta) + "/Nodes", token).json()
    return datos.get("result") or datos.get("value") or []


def _seleccionar_archivos(bandas: List[str], carpetas: dict) -> list:
    """Devuelve [(banda, resolución, nodo)] eligiendo, para cada banda, su archivo JP2 nativo."""
    elegidos = []
    for b in bandas:
        res = BANDA_RES[b]
        sufijo = f"_{b}_{res[1:]}.jp2"
        nodo = next((n for n in carpetas[res] if n["Name"].endswith(sufijo)), None)
        if not nodo:
            raise ValueError(f"La banda {b} no existe en este producto.")
        elegidos.append((b, res, nodo))
    return elegidos


# --------------------------------------------------------------------------
# Trabajos
# --------------------------------------------------------------------------
class _Progreso:
    """Cuenta bytes descargados y actualiza la base como máximo una vez por segundo."""

    def __init__(self, job_id: str, base: int = 0):
        self.job_id, self.n, self._t = job_id, base, 0.0

    def copiar(self, resp: requests.Response, destino):
        for trozo in resp.iter_content(chunk_size=1024 * 1024):
            if not trozo:
                continue
            destino.write(trozo)
            self.n += len(trozo)
            if time.time() - self._t > 1:
                _actualizar(self.job_id, bytes_desc=self.n)
                self._t = time.time()
        _actualizar(self.job_id, bytes_desc=self.n)


def _limpiar_viejos():
    limite = time.time() - TTL_HORAS * 3600
    for f in DIRECTORIO.glob("*.zip"):
        try:
            if f.stat().st_mtime < limite:
                f.unlink()
        except OSError:
            pass
    for f in DIRECTORIO.glob("*.part"):
        try:
            if f.stat().st_mtime < time.time() - 24 * 3600:
                f.unlink()
        except OSError:
            pass


def _ejecutar_trabajo(job_id: str):
    try:
        fila = _sql("SELECT * FROM trabajos WHERE id=?", (job_id,), uno=True)
        bandas = fila["bandas"].split(",") if fila["bandas"] else []
        _actualizar(job_id, estado="buscando")
        prod = _buscar_producto(fila["producto"])
        raiz = prod["Name"]
        base = raiz[:-5] if raiz.endswith(".SAFE") else raiz
        nombre_zip = f"{base}.zip" if fila["tipo"] == "completa" else f"{base}_{'-'.join(bandas)}.zip"
        destino = DIRECTORIO / nombre_zip
        _actualizar(job_id, archivo=str(destino), bytes_total=int(prod.get("ContentLength") or 0))

        if destino.exists():  # ya preparada antes: se reutiliza
            destino.touch()
            tam = destino.stat().st_size
            _actualizar(job_id, estado="listo", bytes_desc=tam, bytes_total=tam)
            return
        if prod.get("Online") is False:
            raise ValueError("Esta escena está archivada (offline) en Copernicus y no se puede bajar por API.")

        token = _token()
        parcial = Path(str(destino) + ".part")

        if fila["tipo"] == "completa":
            _actualizar(job_id, estado="descargando")
            resp = _abrir(f"{DESCARGA_URL}({prod['Id']})/$value", token)
            if not prod.get("ContentLength"):
                _actualizar(job_id, bytes_total=int(resp.headers.get("Content-Length") or 0))
            with open(parcial, "wb") as f:
                _Progreso(job_id).copiar(resp, f)
        else:
            granulos = _listar_nodos(prod["Id"], [raiz, "GRANULE"], token)
            if not granulos:
                raise ValueError("No se pudo leer la estructura del producto en Copernicus.")
            granulo = granulos[0]["Name"]
            carpetas = {res: _listar_nodos(prod["Id"], [raiz, "GRANULE", granulo, "IMG_DATA", res], token)
                        for res in sorted({BANDA_RES[b] for b in bandas})}
            archivos = _seleccionar_archivos(bandas, carpetas)
            _actualizar(job_id, estado="descargando",
                        bytes_total=sum(int(n.get("ContentLength") or 0) for _, _, n in archivos))
            progreso = _Progreso(job_id)
            with zipfile.ZipFile(parcial, "w", zipfile.ZIP_STORED, allowZip64=True) as zf:
                for _, res, nodo in archivos:
                    token = _token()  # el token dura ~10 min: se renueva por archivo
                    ruta = [raiz, "GRANULE", granulo, "IMG_DATA", res, nodo["Name"]]
                    resp = _abrir(_url_nodo(prod["Id"], ruta) + "/$value", token)
                    with zf.open(nodo["Name"], "w", force_zip64=True) as z:
                        progreso.copiar(resp, z)

        os.replace(parcial, destino)
        _actualizar(job_id, estado="listo", bytes_desc=destino.stat().st_size)
    except ValueError as e:
        _actualizar(job_id, estado="error", error=str(e))
    except requests.RequestException as e:
        _actualizar(job_id, estado="error", error=f"Error de red con Copernicus: {e}")
    except Exception as e:  # noqa: BLE001
        _actualizar(job_id, estado="error", error=f"Error inesperado: {e}")


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------
class IniciarDescargaRequest(BaseModel):
    producto: str = Field(..., min_length=10, max_length=200)
    satelite: str = "Sentinel-2"
    fecha: str = Field("", max_length=20)
    lote: str = Field("", max_length=120)
    tipo: Literal["completa", "bandas"] = "completa"
    bandas: List[str] = []


@router.post("")
def iniciar_descarga(req: IniciarDescargaRequest):
    if "landsat" in req.satelite.lower():
        raise HTTPException(400, "La descarga de escenas Landsat todavía no está disponible.")
    if not CDSE_USER or not CDSE_PASS:
        raise HTTPException(500, "El servidor no tiene configuradas las credenciales de Copernicus (CDSE_USER / CDSE_PASS).")

    bandas: List[str] = []
    if req.tipo == "bandas":
        normalizadas = {re.sub(r"^B(\d)$", r"B0\1", b.upper()) for b in req.bandas}
        invalidas = normalizadas - set(BANDA_RES)
        if invalidas:
            raise HTTPException(400, f"Banda no válida: {', '.join(sorted(invalidas))}")
        bandas = [b for b in BANDA_RES if b in normalizadas]  # orden estable
        if not bandas:
            raise HTTPException(400, "Selecciona al menos una banda.")
    bandas_txt = ",".join(bandas)

    _limpiar_viejos()
    activo = _sql(
        f"SELECT * FROM trabajos WHERE producto=? AND tipo=? AND bandas=? "
        f"AND estado IN ({','.join('?' * len(ESTADOS_ACTIVOS))}) ORDER BY creado DESC",
        (req.producto, req.tipo, bandas_txt, *ESTADOS_ACTIVOS), uno=True,
    )
    if activo:  # mismo pedido ya en curso: se comparte el trabajo
        return _publico(activo)

    job_id = uuid.uuid4().hex
    _sql("INSERT INTO trabajos (id, producto, satelite, fecha, lote, tipo, bandas, estado, creado) "
         "VALUES (?,?,?,?,?,?,?,?,?)",
         (job_id, req.producto, req.satelite, req.fecha, req.lote, req.tipo, bandas_txt, "en_cola", time.time()))
    _pool.submit(_ejecutar_trabajo, job_id)
    return _publico(_sql("SELECT * FROM trabajos WHERE id=?", (job_id,), uno=True))


@router.get("")
def listar_descargas(ids: str = Query("")):
    lista = [i for i in ids.split(",") if re.fullmatch(r"[0-9a-f]{32}", i)][:100]
    if not lista:
        return []
    filas = _sql(f"SELECT * FROM trabajos WHERE id IN ({','.join('?' * len(lista))}) ORDER BY creado DESC",
                 lista, todos=True)
    return [_publico(f) for f in filas]


@router.get("/{job_id}")
def estado_descarga(job_id: str):
    fila = _sql("SELECT * FROM trabajos WHERE id=?", (job_id,), uno=True)
    if not fila:
        raise HTTPException(404, "Descarga no encontrada.")
    return _publico(fila)


@router.get("/{job_id}/archivo")
def archivo_descarga(job_id: str):
    fila = _sql("SELECT * FROM trabajos WHERE id=?", (job_id,), uno=True)
    if not fila or fila["estado"] != "listo":
        raise HTTPException(404, "La descarga todavía no está lista.")
    ruta = Path(fila["archivo"] or "")
    if not ruta.is_file():
        raise HTTPException(410, "El archivo ya expiró. Vuelve a pedir la descarga.")
    return FileResponse(ruta, media_type="application/zip", filename=ruta.name)
