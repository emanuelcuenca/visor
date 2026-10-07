"""Descarga de escenas completas (producto original) desde Copernicus Data Space (CDSE).

Flujo:
  POST /api/descargas              -> crea un trabajo en segundo plano y devuelve job_id
  GET  /api/descargas/{job_id}     -> estado y progreso
  GET  /api/descargas/{job_id}/archivo -> entrega el ZIP cuando está listo

Credenciales (NUNCA en el código): variables de entorno CDSE_USER y CDSE_PASS
(pueden ir en un archivo .env junto a main.py).
"""
import os
import re
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Dict

import requests
from fastapi import APIRouter, HTTPException
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

TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
CATALOGO_URL = "https://catalogue.dataspace.copernicus.eu/odata/v1/Products"
DESCARGA_URL = "https://download.dataspace.copernicus.eu/odata/v1/Products"

# CDSE permite 4 conexiones simultáneas por usuario: usamos 2 para dejar margen.
_pool = ThreadPoolExecutor(max_workers=2)
_LOCK = threading.Lock()
_TRABAJOS: Dict[str, dict] = {}
_ACTIVOS = ("en_cola", "buscando", "descargando")

router = APIRouter(prefix="/api/descargas")


class IniciarDescargaRequest(BaseModel):
    producto: str = Field(..., min_length=10, max_length=200)
    satelite: str = "Sentinel-2A"


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


def _abrir_descarga(url: str, token: str) -> requests.Response:
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


# --------------------------------------------------------------------------
# Trabajos
# --------------------------------------------------------------------------
def _actualizar(job: dict, **cambios):
    with _LOCK:
        job.update(cambios)


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


def _ejecutar_trabajo(job: dict):
    try:
        _actualizar(job, estado="buscando")
        prod = _buscar_producto(job["producto"])
        base = prod["Name"][:-5] if prod["Name"].endswith(".SAFE") else prod["Name"]
        destino = DIRECTORIO / f"{base}.zip"
        _actualizar(job, archivo=str(destino), bytes_total=int(prod.get("ContentLength") or 0))

        if destino.exists():  # ya descargada antes: se reutiliza
            destino.touch()
            tam = destino.stat().st_size
            _actualizar(job, estado="listo", bytes_desc=tam, bytes_total=tam)
            return

        if prod.get("Online") is False:
            raise ValueError("Esta escena está archivada (offline) en Copernicus y no se puede bajar por API.")

        token = _token()
        _actualizar(job, estado="descargando")
        resp = _abrir_descarga(f"{DESCARGA_URL}({prod['Id']})/$value", token)
        if not job["bytes_total"]:
            _actualizar(job, bytes_total=int(resp.headers.get("Content-Length") or 0))

        parcial = Path(str(destino) + ".part")
        descargado = 0
        with open(parcial, "wb") as f:
            for trozo in resp.iter_content(chunk_size=1024 * 1024):
                if trozo:
                    f.write(trozo)
                    descargado += len(trozo)
                    _actualizar(job, bytes_desc=descargado)
        os.replace(parcial, destino)
        _actualizar(job, estado="listo", bytes_desc=destino.stat().st_size)
    except ValueError as e:
        _actualizar(job, estado="error", error=str(e))
    except requests.RequestException as e:
        _actualizar(job, estado="error", error=f"Error de red con Copernicus: {e}")
    except Exception as e:  # noqa: BLE001
        _actualizar(job, estado="error", error=f"Error inesperado: {e}")


def _publico(job: dict) -> dict:
    total = job.get("bytes_total") or 0
    desc = job.get("bytes_desc") or 0
    if job["estado"] == "listo":
        progreso = 100
    else:
        progreso = int(desc * 100 / total) if total else 0
    return {
        "job_id": job["id"],
        "estado": job["estado"],
        "progreso": progreso,
        "mb": round(desc / 1e6, 1),
        "mb_total": round(total / 1e6, 1),
        "error": job.get("error"),
    }


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------
@router.post("")
def iniciar_descarga(req: IniciarDescargaRequest):
    if "landsat" in req.satelite.lower():
        raise HTTPException(400, "La descarga de escenas Landsat todavía no está implementada.")
    if not CDSE_USER or not CDSE_PASS:
        raise HTTPException(500, "El servidor no tiene configuradas las credenciales de Copernicus (CDSE_USER / CDSE_PASS).")

    _limpiar_viejos()
    with _LOCK:
        for j in _TRABAJOS.values():  # mismo producto ya en curso: se comparte el trabajo
            if j["producto"] == req.producto and j["estado"] in _ACTIVOS:
                return _publico(j)
        job = {"id": uuid.uuid4().hex, "producto": req.producto, "estado": "en_cola",
               "bytes_desc": 0, "bytes_total": 0, "error": None, "archivo": None, "creado": time.time()}
        _TRABAJOS[job["id"]] = job
    _pool.submit(_ejecutar_trabajo, job)
    return _publico(job)


@router.get("/{job_id}")
def estado_descarga(job_id: str):
    job = _TRABAJOS.get(job_id)
    if not job:
        raise HTTPException(404, "Trabajo no encontrado (¿se reinició el servidor?). Vuelve a pedir la descarga.")
    return _publico(job)


@router.get("/{job_id}/archivo")
def archivo_descarga(job_id: str):
    job = _TRABAJOS.get(job_id)
    if not job or job["estado"] != "listo":
        raise HTTPException(404, "La descarga todavía no está lista.")
    ruta = Path(job["archivo"])
    if not ruta.exists():
        raise HTTPException(410, "El archivo ya expiró. Vuelve a pedir la descarga.")
    return FileResponse(ruta, media_type="application/zip", filename=ruta.name)
