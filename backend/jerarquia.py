import os
import sqlite3
from contextlib import contextmanager
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

DB_PATH = os.getenv("GEOSAT_DB", "geosat.db")
router = APIRouter(tags=["jerarquia"])


@contextmanager
def db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


def init_db():
    with db() as con:
        con.executescript("""
        CREATE TABLE IF NOT EXISTS organizaciones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL UNIQUE COLLATE NOCASE);
        CREATE TABLE IF NOT EXISTS establecimientos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
            nombre TEXT NOT NULL COLLATE NOCASE,
            UNIQUE (organizacion_id, nombre));
        CREATE TABLE IF NOT EXISTS lotes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            establecimiento_id INTEGER NOT NULL REFERENCES establecimientos(id) ON DELETE CASCADE,
            nombre TEXT NOT NULL,
            origen TEXT,
            superficie_ha REAL,
            geojson TEXT NOT NULL,
            creado TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS campanias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lote_id INTEGER NOT NULL REFERENCES lotes(id) ON DELETE CASCADE,
            cultivo TEXT NOT NULL,
            ciclo TEXT NOT NULL,
            UNIQUE (lote_id, cultivo, ciclo));
        """)


init_db()


class NombreIn(BaseModel):
    nombre: str = Field(min_length=1, max_length=200)


class CampaniaIn(BaseModel):
    cultivo: str = Field(min_length=1, max_length=80)
    ciclo: str = Field(min_length=1, max_length=40)


class LoteIn(BaseModel):
    organizacion_id: int
    establecimiento_id: int
    nombre: str = Field(min_length=1, max_length=200)
    origen: Optional[str] = None
    superficie_ha: Optional[float] = None
    geojson: dict[str, Any]
    campania: CampaniaIn


def _insertar(con, sql, params, detalle_duplicado):
    try:
        return con.execute(sql, params).lastrowid
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail=detalle_duplicado)


# ---------- Organizaciones / Clientes ----------
@router.get("/organizaciones")
def listar_organizaciones():
    with db() as con:
        return [dict(r) for r in con.execute("SELECT id, nombre FROM organizaciones ORDER BY nombre")]


@router.post("/organizaciones", status_code=201)
def crear_organizacion(body: NombreIn):
    nombre = body.nombre.strip()
    if not nombre:
        raise HTTPException(status_code=422, detail="El nombre no puede estar vacío.")
    with db() as con:
        oid = _insertar(con, "INSERT INTO organizaciones (nombre) VALUES (?)", (nombre,),
                        "Ya existe una organización / cliente con ese nombre.")
    return {"id": oid, "nombre": nombre}


# ---------- Establecimientos ----------
@router.get("/organizaciones/{org_id}/establecimientos")
def listar_establecimientos(org_id: int):
    with db() as con:
        return [dict(r) for r in con.execute(
            "SELECT id, nombre FROM establecimientos WHERE organizacion_id = ? ORDER BY nombre", (org_id,))]


@router.post("/organizaciones/{org_id}/establecimientos", status_code=201)
def crear_establecimiento(org_id: int, body: NombreIn):
    nombre = body.nombre.strip()
    if not nombre:
        raise HTTPException(status_code=422, detail="El nombre no puede estar vacío.")
    with db() as con:
        if not con.execute("SELECT 1 FROM organizaciones WHERE id = ?", (org_id,)).fetchone():
            raise HTTPException(status_code=404, detail="La organización no existe.")
        eid = _insertar(con, "INSERT INTO establecimientos (organizacion_id, nombre) VALUES (?, ?)",
                        (org_id, nombre), "Ya existe un establecimiento con ese nombre en esta organización.")
    return {"id": eid, "nombre": nombre}


# ---------- Lotes y campañas ----------
@router.get("/establecimientos/{est_id}/lotes")
def listar_lotes_de_establecimiento(est_id: int):
    with db() as con:
        return [dict(r) for r in con.execute(
            "SELECT id, nombre, origen, superficie_ha FROM lotes WHERE establecimiento_id = ? ORDER BY nombre",
            (est_id,))]


@router.get("/lotes/{lote_id}/campanas")
def listar_campanias(lote_id: int):
    with db() as con:
        return [{"id": r["id"], "nombre": f'{r["cultivo"]} {r["ciclo"]}', "cultivo": r["cultivo"], "ciclo": r["ciclo"]}
                for r in con.execute("SELECT id, cultivo, ciclo FROM campanias WHERE lote_id = ? ORDER BY ciclo DESC",
                                     (lote_id,))]


@router.get("/lotes")
def listar_lotes():
    """Todos los lotes guardados, con su geometría. Se usa al abrir la aplicación."""
    import json
    with db() as con:
        filas = con.execute("""
            SELECT l.id, l.nombre, l.origen, l.superficie_ha, l.geojson,
                   e.id AS est_id, e.nombre AS est_nombre, o.id AS org_id, o.nombre AS org_nombre
            FROM lotes l JOIN establecimientos e ON e.id = l.establecimiento_id
            JOIN organizaciones o ON o.id = e.organizacion_id ORDER BY l.creado DESC""").fetchall()
    return [{"id": f["id"], "nombre": f["nombre"], "origen": f["origen"], "superficie_ha": f["superficie_ha"],
             "geojson": json.loads(f["geojson"]),
             "establecimiento": {"id": f["est_id"], "nombre": f["est_nombre"]},
             "organizacion": {"id": f["org_id"], "nombre": f["org_nombre"]}} for f in filas]


@router.post("/lotes", status_code=201)
def crear_lote(body: LoteIn):
    import json
    if body.geojson.get("type") not in {"FeatureCollection", "Feature", "Polygon", "MultiPolygon"}:
        raise HTTPException(status_code=422, detail="geojson: tipo de geometría no válido.")
    nombre = body.nombre.strip()
    with db() as con:  # una sola transacción: si falla algo, no queda nada a medias
        pertenece = con.execute("SELECT 1 FROM establecimientos WHERE id = ? AND organizacion_id = ?",
                                (body.establecimiento_id, body.organizacion_id)).fetchone()
        if not pertenece:
            raise HTTPException(status_code=422, detail="El establecimiento no pertenece a la organización indicada.")
        lid = _insertar(con, "INSERT INTO lotes (establecimiento_id, nombre, origen, superficie_ha, geojson) VALUES (?, ?, ?, ?, ?)",
                        (body.establecimiento_id, nombre, body.origen, body.superficie_ha, json.dumps(body.geojson)),
                        "No se pudo guardar el lote.")
        cultivo, ciclo = body.campania.cultivo.strip(), body.campania.ciclo.strip()
        cid = _insertar(con, "INSERT INTO campanias (lote_id, cultivo, ciclo) VALUES (?, ?, ?)",
                        (lid, cultivo, ciclo), "Esa campaña ya existe en el lote.")
    return {"id": lid, "nombre": nombre, "campania": {"id": cid, "nombre": f"{cultivo} {ciclo}"}}