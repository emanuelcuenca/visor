import React, { useState, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, useMapEvents, useMap, Polygon, Polyline, CircleMarker, Popup } from 'react-leaflet';
import axios from 'axios';
import shp from 'shpjs';
import JSZip from 'jszip';
import { kml } from '@tmcw/togeojson';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const API_BASE_URL = import.meta.env?.VITE_API_URL ?? 'http://127.0.0.1:8000/api';

const MAPAS_BASE = {
  'Google Satélite': 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
  'Google Híbrido': 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
  'Google Calles': 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
  'Google Relieve': 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}'
};

const CAPAS = [
  { id: 'RGB Clásico', nombre: 'RGB clásico' },
  { id: 'Infrarrojo Color', nombre: 'Infrarrojo color' },
  { id: 'Agricultura', nombre: 'Agricultura (SWIR)' },
  { id: 'Tierra/Agua', nombre: 'Tierra / Agua' },
  { id: 'NDVI', nombre: 'NDVI' },
  { id: 'NDWI', nombre: 'NDWI' },
  { id: 'SAVI', nombre: 'SAVI' },
  { id: 'NBR', nombre: 'NBR' }
];

const INDICES = ['NDVI', 'NDWI', 'SAVI', 'NBR'];

// Modelo digital de elevación SRTM: se maneja como una "escena" especial (sin fecha ni nubes)
const SRTM_ID = 'USGS/SRTMGL1_003';
const ESCENA_SRTM = { id: SRTM_ID, esDem: true, fecha: '2000', satelite: 'SRTM 30 m' };
const CAPAS_DEM = [
  { id: 'Elevación', nombre: 'Elevación' },
  { id: 'Pendiente', nombre: 'Pendiente' },
  { id: 'Sombreado', nombre: 'Sombreado (relieve)' }
];
const MODOS_DEM = CAPAS_DEM.map((c) => c.id);

// Bandas del producto Sentinel-2 L2A que se pueden pedir en la descarga
const BANDAS_S2 = [
  { id: 'B02', nombre: 'B02 · Azul (10 m)' },
  { id: 'B03', nombre: 'B03 · Verde (10 m)' },
  { id: 'B04', nombre: 'B04 · Rojo (10 m)' },
  { id: 'B08', nombre: 'B08 · NIR (10 m)' },
  { id: 'B05', nombre: 'B05 · Red Edge 1 (20 m)' },
  { id: 'B06', nombre: 'B06 · Red Edge 2 (20 m)' },
  { id: 'B07', nombre: 'B07 · Red Edge 3 (20 m)' },
  { id: 'B8A', nombre: 'B8A · NIR estrecho (20 m)' },
  { id: 'B11', nombre: 'B11 · SWIR 1 (20 m)' },
  { id: 'B12', nombre: 'B12 · SWIR 2 (20 m)' }
];

const ESTRUCTURA_SENSORES = [
  {
    familia: 'Sentinel-2',
    sensores: [
      { id: 'S2A_L2A', nombre: 'S2A' },
      { id: 'S2B_L2A', nombre: 'S2B' }
    ]
  },
  {
    familia: 'Landsat',
    sensores: [
      { id: 'L8_T1', nombre: 'L8' },
      { id: 'L9_T1', nombre: 'L9' }
    ]
  }
];
const TODOS_LOS_SENSORES = ESTRUCTURA_SENSORES.flatMap((f) => f.sensores.map((s) => s.id));

// Espacios de trabajo (pestañas del panel izquierdo). Por ahora solo Agricultura está habilitada.
const ESPACIOS = [
  { id: 'agricultura', nombre: 'Agricultura', habilitado: true },
  { id: 'paisaje', nombre: 'Paisaje', habilitado: false }
];

const ESTADOS_ACTIVOS = ['en_cola', 'buscando', 'descargando'];
const ETIQUETA_ESTADO = {
  en_cola: 'En cola', buscando: 'Buscando', descargando: 'Descargando',
  listo: 'Listo', error: 'Error', expirada: 'Expirada'
};
const CLAVE_DESCARGAS = 'geosat_descargas_ids';

const INFO_SECCION = {
  imagenes: { eyebrow: 'Catálogo satelital', titulo: 'Explorar imágenes' },
  zonas: { eyebrow: 'Análisis espacial', titulo: 'Zonas de manejo' },
  tendencia: { eyebrow: 'Análisis temporal', titulo: 'Tendencia vegetal' },
  lote: { eyebrow: 'Capas y análisis', titulo: 'Gestión de lote' },
  areas: { eyebrow: 'Gestión del espacio de trabajo', titulo: 'Mis áreas' },
  ia: { eyebrow: 'Inteligencia geoespacial', titulo: 'Soluciones IA' },
  descargas: { eyebrow: 'Centro de productos', titulo: 'Descargas' }
};

// ---------- Íconos ----------
const Icono = ({ size = 18, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const IconLogo = () => (
  <Icono size={20}>
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10z" />
  </Icono>
);
const IconImagenes = () => (
  <Icono>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </Icono>
);
const IconCapas = ({ size = 18 }) => (
  <Icono size={size}>
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </Icono>
);
const IconTendencia = () => (
  <Icono>
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </Icono>
);
const IconComparar = () => (
  <Icono>
    <rect x="2" y="3" width="20" height="18" rx="2" />
    <line x1="12" y1="3" x2="12" y2="21" />
  </Icono>
);
const IconDescargas = () => (
  <Icono>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </Icono>
);
const IconAreas = () => (
  <Icono>
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
    <line x1="8" y1="2" x2="8" y2="18" />
    <line x1="16" y1="6" x2="16" y2="22" />
  </Icono>
);
const IconIA = () => (
  <Icono>
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </Icono>
);
const IconDibujar = () => (
  <Icono size={16}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </Icono>
);
const IconSubir = () => (
  <Icono size={16}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </Icono>
);
const IconLote = () => (
  <Icono>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="9" y1="21" x2="9" y2="9" />
  </Icono>
);
const IconInfoPixel = () => (
  <Icono size={16}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </Icono>
);
const IconRegla = () => (
  <Icono size={16}>
    <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0l12.6 12.6z" />
  </Icono>
);

const NAV_ESPACIO = {
  agricultura: [
    {
      titulo: 'Análisis',
      items: [
        { id: 'imagenes', label: 'Explorar imágenes', Icon: IconImagenes },
        { id: 'zonas', label: 'Zonas de manejo', Icon: IconCapas },
        { id: 'tendencia', label: 'Tendencia temporal', Icon: IconTendencia },
        { id: 'comparar', label: 'Comparar escenas', Icon: IconComparar, pronto: true }
      ]
    },
    {
      titulo: 'Proyecto',
      items: [
        { id: 'lote', label: 'Gestión de lote', Icon: IconLote },
        { id: 'areas', label: 'Mis áreas', Icon: IconAreas },
        { id: 'ia', label: 'Soluciones IA', Icon: IconIA },
        { id: 'descargas', label: 'Descargas', Icon: IconDescargas }
      ]
    }
  ]
};

// ---------- Helpers ----------
const obtenerFechasDefecto = () => {
  const hoy = new Date();
  const haceSeisMeses = new Date();
  haceSeisMeses.setMonth(hoy.getMonth() - 6);
  const formato = (d) => d.toISOString().split('T')[0];
  return { inicio: formato(haceSeisMeses), fin: formato(hoy) };
};

const RADIO_TIERRA = 6378137;
const aRad = (g) => (g * Math.PI) / 180;

const areaAnilloM2 = (anillo) => {
  let suma = 0;
  for (let i = 0; i < anillo.length - 1; i++) {
    const [x1, y1] = anillo[i];
    const [x2, y2] = anillo[i + 1];
    suma += aRad(x2 - x1) * (2 + Math.sin(aRad(y1)) + Math.sin(aRad(y2)));
  }
  return Math.abs((suma * RADIO_TIERRA * RADIO_TIERRA) / 2);
};

const areaPoligonoM2 = (anillos) =>
  anillos.reduce((acc, anillo, i) => acc + (i === 0 ? areaAnilloM2(anillo) : -areaAnilloM2(anillo)), 0);

const areaGeometriaM2 = (g) => {
  if (!g) return 0;
  if (g.type === 'Polygon') return areaPoligonoM2(g.coordinates);
  if (g.type === 'MultiPolygon') return g.coordinates.reduce((acc, p) => acc + areaPoligonoM2(p), 0);
  return 0;
};

const calcularAreaGeoJSONHa = (geojson) => {
  const feats = geojson?.type === 'FeatureCollection' ? geojson.features : [geojson];
  const m2 = (feats || []).reduce((acc, f) => acc + areaGeometriaM2(f?.geometry), 0);
  return m2 / 10000;
};

const extraerContornos = (fc) => {
  const salida = [];
  (fc?.features || []).forEach((f) => {
    const g = f?.geometry;
    if (!g) return;
    const polis = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    polis.forEach((p) => salida.push(p[0].map((c) => [c[1], c[0]])));
  });
  return salida;
};

// Lee .geojson/.json, .zip (shapefile), .kml y .kmz y devuelve GeoJSON
const leerArchivoGeo = async (file) => {
  const nombre = file.name.toLowerCase();
  const aXml = (texto) => new DOMParser().parseFromString(texto, 'text/xml');
  if (nombre.endsWith('.kmz')) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entrada = zip.file('doc.kml') || zip.file(/\.kml$/i)[0];
    if (!entrada) throw new Error('KMZ sin KML');
    return kml(aXml(await entrada.async('string')));
  }
  if (nombre.endsWith('.kml')) return kml(aXml(await file.text()));
  if (nombre.endsWith('.zip')) return shp(await file.arrayBuffer());
  return JSON.parse(await file.text());
};

const geometrias = (g) => (g?.type === 'GeometryCollection' ? g.geometries.flatMap(geometrias) : g ? [g] : []);

const sumarDias = (fecha, dias) => {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().split('T')[0];
};

const quitarZ = (c) => (typeof c[0] === 'number' ? [c[0], c[1]] : c.map(quitarZ));

const distanciaTotalM = (pts) =>
  pts.reduce((acc, p, i) => (i === 0 ? 0 : acc + L.latLng(pts[i - 1]).distanceTo(L.latLng(p))), 0);

const formatoDistancia = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);
const formatoHa = (v) => (Number.isFinite(v) ? v.toLocaleString('es-AR', { maximumFractionDigits: 2 }) : '—');

const familiaDe = (escena) =>
  escena?.satelite && escena.satelite.toLowerCase().includes('landsat') ? 'Landsat' : 'Sentinel-2';

const colorPaleta = (c) => (c.startsWith('#') ? c : `#${c}`);

const placeholderSvg = (texto) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='100' height='70'><rect width='100' height='70' fill='#161d29'/><text x='50' y='38' fill='#8b95a5' font-size='9' text-anchor='middle' font-family='sans-serif'>${texto}</text></svg>`
  );

const nombreSeguro = (texto) => String(texto || 'archivo').replace(/[\\/:*?"<>|\s]+/g, '_');

const guardarBlob = (data, nombre) => {
  const url = window.URL.createObjectURL(new Blob([data]));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};

const leerIds = () => {
  try { return JSON.parse(localStorage.getItem(CLAVE_DESCARGAS)) || []; } catch (_) { return []; }
};
const guardarIds = (ids) => {
  try { localStorage.setItem(CLAVE_DESCARGAS, JSON.stringify(ids.slice(0, 50))); } catch (_) { /* sin almacenamiento */ }
};

// ---------- Componentes de mapa ----------
function ManejadorEventosMapa({ onClick, onContextMenu }) {
  useMapEvents({
    click: (e) => onClick(e.latlng),
    contextmenu: (e) => {
      e.originalEvent?.preventDefault();
      onContextMenu?.(e.latlng);
    }
  });
  return null;
}

function ControllerCentradoMapa({ destino }) {
  const map = useMap();
  useEffect(() => {
    if (!destino?.coords?.length) return;
    if (destino.coords.length === 1) map.flyTo(destino.coords[0], 13);
    else map.fitBounds(L.latLngBounds(destino.coords), { padding: [70, 70], maxZoom: 17 });
  }, [destino, map]);
  return null;
}

function LeyendaIndice({ titulo, vis }) {
  if (!vis?.palette) return null;
  const degradado = `linear-gradient(to right, ${vis.palette.map(colorPaleta).join(', ')})`;
  return (
    <div className="gs-legend">
      <div className="gs-legend-title">{titulo}</div>
      <div className="gs-legend-bar" style={{ background: degradado }} />
      <div className="gs-legend-scale"><span>{vis.min}</span><span>{vis.max}</span></div>
    </div>
  );
}

function FilaCapa({ capa, activa, onSelect, onQuitar, onDescargar }) {
  return (
    <div className={`gs-capa-card ${activa ? 'active' : ''}`} onClick={onSelect} role="button" tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect()} aria-pressed={activa}>
      <span className="gs-capa-text">
        <span className="gs-capa-name">{capa.nombre}</span>
        <span className="gs-capa-meta">{capa.satelite}</span>
      </span>
      <span className="gs-capa-actions">
        <button className="gs-link" onClick={(e) => { e.stopPropagation(); onDescargar('geotiff'); }} title="Descargar GeoTIFF recortado">TIF</button>
        <button className="gs-icon-mini" onClick={(e) => { e.stopPropagation(); onQuitar(); }} title="Quitar capa" aria-label={`Quitar ${capa.nombre}`}>×</button>
      </span>
    </div>
  );
}

function ContenidoPixel({ cargando, datos, indice }) {
  if (cargando) return <div className="gs-pop">Leyendo píxel…</div>;
  if (!datos) return null;
  if (datos.error) return <div className="gs-pop gs-pop-error">{datos.error}</div>;
  const valores = Object.entries(datos.valores || {});
  return (
    <div className="gs-pop">
      <div className="gs-pop-title">{indice}</div>
      {valores.length === 0 ? (
        <div>Sin dato en este píxel (nube, sombra o fuera de la escena).</div>
      ) : (
        valores.map(([k, v]) => (
          <div key={k} className="gs-pop-row"><span>{k}</span><strong>{v}</strong></div>
        ))
      )}
      <div className="gs-pop-coords">{datos.lat?.toFixed(5)}, {datos.lng?.toFixed(5)}</div>
    </div>
  );
}

function GraficoSerie({ puntos, indice, marca }) {
  if (!puntos?.length) {
    return <div className="gs-chart-empty">No hay datos válidos en el período (nubes o sin pasadas del satélite). Ampliá las fechas o los sensores.</div>;
  }
  const W = 330, H = 170, m = { l: 36, r: 8, t: 8, b: 22 };
  const tiempos = puntos.map((p) => new Date(p.fecha).getTime());
  const valores = puntos.map((p) => p.valor);
  const t0 = Math.min(...tiempos), t1 = Math.max(...tiempos);
  const rango = Math.max(...valores) - Math.min(...valores) || 0.1;
  const lo = Math.min(...valores) - rango * 0.1, hi = Math.max(...valores) + rango * 0.1;
  const x = (t) => m.l + (t1 === t0 ? (W - m.l - m.r) / 2 : ((t - t0) / (t1 - t0)) * (W - m.l - m.r));
  const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
  const linea = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(tiempos[i]).toFixed(1)},${y(p.valor).toFixed(1)}`).join(' ');
  const marcas = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
  const corta = (f) => f.slice(2).replace(/-/g, '/');
  const tm = marca ? new Date(marca).getTime() : null;
  const hayMarca = tm !== null && t1 !== t0 && tm >= t0 && tm <= t1;
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label={`Serie temporal de ${indice}`}>
        {marcas.map((v) => (
          <g key={v}>
            <line className="gs-chart-grid" x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} />
            <text className="gs-chart-label" x={m.l - 4} y={y(v) + 3} fontSize="9" textAnchor="end">{v.toFixed(2)}</text>
          </g>
        ))}
        {hayMarca && <line className="gs-chart-mark" x1={x(tm)} x2={x(tm)} y1={m.t} y2={H - m.b} strokeDasharray="4 3" />}
        <path className="gs-chart-line" d={linea} fill="none" strokeWidth="1.25" />
        {puntos.map((p, i) => (
          <circle key={`${p.fecha}_${p.sat}`} cx={x(tiempos[i])} cy={y(p.valor)} r="3" fill={p.sat === 'Landsat' ? '#f59e0b' : '#3b82f6'}>
            <title>{`${p.fecha} · ${p.sat}: ${p.valor}`}</title>
          </circle>
        ))}
        <text className="gs-chart-label" x={m.l} y={H - 6} fontSize="9">{corta(puntos[0].fecha)}</text>
        <text className="gs-chart-label" x={W - m.r} y={H - 6} fontSize="9" textAnchor="end">{corta(puntos[puntos.length - 1].fecha)}</text>
      </svg>
      <div className="gs-chart-legend">
        <span><i style={{ background: '#3b82f6' }} /> Sentinel-2</span>
        <span><i style={{ background: '#f59e0b' }} /> Landsat</span>
        {hayMarca && <span><i style={{ background: '#22c55e', borderRadius: 0, width: 2 }} /> Fecha de la capa</span>}
      </div>
    </>
  );
}

// ---------- App ----------
export default function App() {
  const fileInputRef = useRef(null);
  const peticionEscenaRef = useRef(0);
  const toastTimerRef = useRef(null);
  const estadosRef = useRef({});
  const [fechasDefecto] = useState(obtenerFechasDefecto);

  const [espacioActivo, setEspacioActivo] = useState('agricultura');
  const [seccionActiva, setSeccionActiva] = useState('imagenes');

  const [lotes, setLotes] = useState([]);
  const [loteActivoId, setLoteActivoId] = useState(null);

  const [modoViz, setModoViz] = useState('RGB Clásico');
  const [cargando, setCargando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [capturando, setCapturando] = useState(false);
  const [capaAnalisisId, setCapaAnalisisId] = useState(null);
  const [curvaLote, setCurvaLote] = useState(null);
  const [cargandoCurva, setCargandoCurva] = useState(false);
  const [curvaDesde, setCurvaDesde] = useState(fechasDefecto.inicio);
  const [curvaHasta, setCurvaHasta] = useState(fechasDefecto.fin);
  const [mapaBaseActual, setMapaBaseActual] = useState('Google Satélite');
  const [mostrarMenuMapas, setMostrarMenuMapas] = useState(false);
  const [servidorOk, setServidorOk] = useState(null);

  const [inputBusqueda, setInputBusqueda] = useState('');
  const [centroMapa, setCentroMapa] = useState(null);

  const [fechaInicio, setFechaInicio] = useState(fechasDefecto.inicio);
  const [fechaFin, setFechaFin] = useState(fechasDefecto.fin);
  const [nubosidadMax, setNubosidadMax] = useState(20);
  const [sensoresActivos, setSensoresActivos] = useState(TODOS_LOS_SENSORES);
  const [enmascararNubes, setEnmascararNubes] = useState(true);

  const [indiceAmbientacion, setIndiceAmbientacion] = useState('NDVI');
  const [clasesAmbientacion, setClasesAmbientacion] = useState(3);
  const [superficieMinM2, setSuperficieMinM2] = useState(2000);
  const [metodoZonas, setMetodoZonas] = useState('cuantiles');
  const [opacidadAmbientacion, setOpacidadAmbientacion] = useState(80);

  const [modoIdentificar, setModoIdentificar] = useState(false);
  const [modoMedir, setModoMedir] = useState(false);
  const [modoDibujar, setModoDibujar] = useState(false);
  const [puntosMedicion, setPuntosMedicion] = useState([]);
  const [puntosPoligono, setPuntosPoligono] = useState([]);
  const [datosPixel, setDatosPixel] = useState(null);
  const [posicionPixelInfo, setPosicionPixelInfo] = useState(null);
  const [cargandoPixel, setCargandoPixel] = useState(false);

  const [indiceTendencia, setIndiceTendencia] = useState('NDVI');
  const [puntoTendencia, setPuntoTendencia] = useState(null);
  const [serieTendencia, setSerieTendencia] = useState(null);
  const [cargandoSerie, setCargandoSerie] = useState(false);

  const [toast, setToast] = useState(null);

  const [modalDescargaAbierto, setModalDescargaAbierto] = useState(false);
  const [escenaModal, setEscenaModal] = useState(null);
  const [tipoDescarga, setTipoDescarga] = useState('completa');
  const [bandasSeleccionadas, setBandasSeleccionadas] = useState(['B02', 'B03', 'B04', 'B08']);
  const [iniciandoDescarga, setIniciandoDescarga] = useState(false);
  const [descargas, setDescargas] = useState([]);

  const loteActual = lotes.find((l) => l.id === loteActivoId) || null;
  const escenaActual = loteActual?.escenaSeleccionada || null;
  const capasLote = loteActual?.capas || [];
  const modoGestion = seccionActiva === 'lote' && !!loteActual;
  const capaAnalisis = capasLote.find((c) => c.id === capaAnalisisId) || null;
  const capasDisponibles = escenaActual?.esDem ? CAPAS_DEM : CAPAS;
  const ambientacion = loteActual?.ambientacion || null;
  const herramientaActiva = modoDibujar || modoMedir || modoIdentificar;
  const modoTendencia = seccionActiva === 'tendencia' && !herramientaActiva;
  const hayDescargasActivas = descargas.some((d) => ESTADOS_ACTIVOS.includes(d.estado));
  const distanciaMedida = distanciaTotalM(puntosMedicion);

  const actualizarLote = (id, cambios) =>
    setLotes((prev) => prev.map((l) => (l.id === id ? { ...l, ...cambios } : l)));

  const avisar = (texto, tipo = 'error') => {
    setToast({ texto, tipo });
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 6000);
  };

  const mensajeError = async (err, base) => {
    let detalle = err?.response?.data?.detail;
    if (!detalle && err?.response?.data instanceof Blob) {
      try { detalle = JSON.parse(await err.response.data.text()).detail; } catch (_) { /* sin detalle */ }
    }
    if (Array.isArray(detalle)) detalle = detalle.map((d) => d.msg).join('; ');
    if (!detalle && !err?.response) detalle = 'No se pudo conectar con el servidor.';
    return detalle ? `${base}: ${detalle}` : base;
  };

  // ---------- Herramientas del mapa ----------
  const activarHerramienta = (nombre) => {
    setModoDibujar(nombre === 'dibujar' ? !modoDibujar : false);
    setModoIdentificar(nombre === 'identificar' ? !modoIdentificar : false);
    setModoMedir(nombre === 'medir' ? !modoMedir : false);
    setPuntosPoligono([]);
    setPuntosMedicion([]);
    setPosicionPixelInfo(null);
    setDatosPixel(null);
  };

  const irASeccion = (seccion) => {
    setSeccionActiva(seccion);
    if (seccion === 'tendencia' || seccion === 'lote') activarHerramienta(null);
    if (seccion === 'lote' && loteActual?.puntosCoords.length > 0) setCentroMapa({ coords: loteActual.puntosCoords, t: Date.now() });
  };

  const toggleSensor = (id) =>
    setSensoresActivos((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const seleccionarLote = (id, centrar = true) => {
    setLoteActivoId(id);
    const l = lotes.find((item) => item.id === id);
    if (centrar && l?.puntosCoords.length > 0) setCentroMapa({ coords: l.puntosCoords, t: Date.now() });
  };

  const eliminarLote = (id, e) => {
    e.stopPropagation();
    const restantes = lotes.filter((l) => l.id !== id);
    setLotes(restantes);
    if (loteActivoId === id) setLoteActivoId(restantes.length > 0 ? restantes[0].id : null);
  };

  const agregarLote = ({ nombre, origen, geojson, contornos }) => {
    const nuevo = {
      id: `lote_${Date.now()}`,
      nombre,
      origen,
      superficieHa: calcularAreaGeoJSONHa(geojson),
      geojson,
      contornos,
      puntosCoords: contornos.flat(),
      escenas: [],
      buscada: false,
      escenaSeleccionada: null,
      tileUrl: null,
      vis: null,
      modoCapa: null,
      ambientacion: null,
      capas: []
    };
    setLotes((prev) => [...prev, nuevo]);
    setLoteActivoId(nuevo.id);
    return nuevo;
  };

  const manejarClickMapa = async ({ lat, lng }) => {
    if (modoDibujar) { setPuntosPoligono((prev) => [...prev, [lat, lng]]); return; }
    if (modoMedir) { setPuntosMedicion((prev) => [...prev, [lat, lng]]); return; }
    if (modoTendencia) { cargarSerie(lat, lng); return; }
    if (!modoIdentificar) return;
    if (!escenaActual) {
      avisar('Seleccioná una escena para consultar el valor del píxel.', 'info');
      return;
    }
    setPosicionPixelInfo([lat, lng]);
    setCargandoPixel(true);
    setDatosPixel(null);
    try {
      const res = await axios.post(`${API_BASE_URL}/identificar-pixel`, {
        escena_id: escenaActual.id, lat, lng, indice: loteActual.modoCapa || modoViz, enmascarar_nubes: enmascararNubes
      });
      setDatosPixel(res.data);
    } catch (err) {
      setDatosPixel({ error: await mensajeError(err, 'Error de lectura') });
    } finally {
      setCargandoPixel(false);
    }
  };

  const finalizarDibujoLote = () => {
    if (puntosPoligono.length < 3) { avisar('Marcá al menos 3 puntos en el mapa.', 'info'); return; }
    const anillo = [...puntosPoligono, puntosPoligono[0]].map((p) => [p[1], p[0]]);
    const featureCollection = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [anillo] }, properties: {} }]
    };
    agregarLote({ nombre: `Lote ${lotes.length + 1}`, origen: 'Dibujado', geojson: featureCollection, contornos: [puntosPoligono] });
    setPuntosPoligono([]);
    setModoDibujar(false);
  };

  const manejarClickDerecho = () => {
    if (modoDibujar) finalizarDibujoLote();
  };

  const manejarCargaArchivo = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const bruto = await leerArchivoGeo(file);
      const fcBruta = Array.isArray(bruto) ? bruto[0] : bruto;
      const feats = fcBruta.type === 'FeatureCollection' ? fcBruta.features : [fcBruta.type === 'Feature' ? fcBruta : { type: 'Feature', geometry: fcBruta }];
      const featureCollection = {
        type: 'FeatureCollection',
        features: feats
          .flatMap((f) => geometrias(f?.geometry))
          .filter((g) => ['Polygon', 'MultiPolygon'].includes(g.type))
          .map((g) => ({ type: 'Feature', properties: {}, geometry: { type: g.type, coordinates: quitarZ(g.coordinates) } }))
      };
      const contornos = extraerContornos(featureCollection);
      if (contornos.length === 0) throw new Error('sin polígonos');
      const nuevo = agregarLote({ nombre: file.name.replace(/\.[^.]+$/, ''), origen: 'Archivo importado', geojson: featureCollection, contornos });
      setCentroMapa({ coords: nuevo.puntosCoords, t: Date.now() });
    } catch (err) {
      avisar('El archivo no tiene polígonos válidos. Usá .geojson, .json, .kml, .kmz o un .zip con shapefile.');
    }
  };

  const buscarUbicacion = async () => {
    const q = inputBusqueda.trim();
    if (!q) return;
    const coord = q.match(/^(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)$/);
    if (coord) {
      const lat = parseFloat(coord[1].replace(',', '.'));
      const lng = parseFloat(coord[2].replace(',', '.'));
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        setCentroMapa({ coords: [[lat, lng]], t: Date.now() });
        return;
      }
    }
    try {
      const res = await axios.get('https://nominatim.openstreetmap.org/search', { params: { q, format: 'json', limit: 1 } });
      const r = res.data[0];
      if (!r) { avisar(`No se encontró "${q}".`, 'info'); return; }
      const [s, n, w, e] = r.boundingbox.map(Number);
      setCentroMapa({ coords: [[s, w], [n, e]], t: Date.now() });
    } catch (err) {
      avisar('No se pudo buscar la ubicación.');
    }
  };

  // ---------- Escenas y capas ----------
  const buscarEscenas = async () => {
    if (!loteActual) { avisar('Dibujá o importá un área antes de buscar imágenes.', 'info'); return; }
    if (sensoresActivos.length === 0) { avisar('Activá al menos un sensor.', 'info'); return; }
    const loteId = loteActivoId;
    setCargando(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/buscar-escenas`, {
        geojson: loteActual.geojson,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        nubosidad_max: Number(nubosidadMax),
        sensores: sensoresActivos
      });
      actualizarLote(loteId, {
        escenas: res.data.escenas || [], buscada: true,
        escenaSeleccionada: null, tileUrl: null, vis: null, modoCapa: null, ambientacion: null
      });
    } catch (err) {
      avisar(await mensajeError(err, 'Error buscando escenas'));
    } finally {
      setCargando(false);
    }
  };

  const seleccionarEscena = async (escenaObj, modo = modoViz) => {
    if (!loteActual) return;
    const loteId = loteActivoId;
    const cambioEscena = escenaActual?.id !== escenaObj.id;
    const peticion = ++peticionEscenaRef.current;
    // el DEM solo admite sus propias capas, y las escenas satelitales no admiten las del DEM
    if (escenaObj.esDem && !MODOS_DEM.includes(modo)) modo = 'Elevación';
    if (!escenaObj.esDem && MODOS_DEM.includes(modo)) modo = 'RGB Clásico';
    setModoViz(modo);
    setCargando(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/obtener-capa`, {
        escena_id: escenaObj.id, modo_viz: modo, enmascarar_nubes: enmascararNubes,
        ...(escenaObj.esDem ? { geojson: loteActual.geojson } : {})
      });
      if (peticion !== peticionEscenaRef.current) return;
      setLotes((prev) => prev.map((l) => (l.id !== loteId ? l : {
        ...l,
        escenaSeleccionada: escenaObj,
        tileUrl: res.data.tile_url,
        vis: res.data.vis,
        modoCapa: modo,
        ambientacion: cambioEscena ? null : l.ambientacion
      })));
    } catch (err) {
      if (peticion === peticionEscenaRef.current) avisar(await mensajeError(err, 'No se pudo cargar la capa'));
    } finally {
      if (peticion === peticionEscenaRef.current) setCargando(false);
    }
  };

  const cambiarCapa = (modo) => {
    setModoViz(modo);
    if (escenaActual) seleccionarEscena(escenaActual, modo);
  };

  // Sin argumentos exporta la capa activa; con { escenaId, modo } exporta otra (capa capturada o DEM)
  const descargarRaster = async (formato, { escenaId, modo } = {}) => {
    const escena = escenaId || escenaActual?.id;
    if (!escena || !loteActual) return;
    modo = modo || loteActual.modoCapa || modoViz;
    setExportando(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/descargar-raster`, {
        escena_id: escena, modo_viz: modo, geojson: loteActual.geojson,
        formato, enmascarar_nubes: enmascararNubes
      }, { responseType: 'blob' });
      guardarBlob(res.data, `${nombreSeguro(loteActual.nombre)}_${nombreSeguro(modo)}.${formato === 'png' ? 'png' : 'tif'}`);
    } catch (err) {
      avisar(await mensajeError(err, 'No se pudo exportar la capa'));
    } finally {
      setExportando(false);
    }
  };

  // ---------- Captura de capas del lote ----------
  const capturarCapa = async () => {
    if (!loteActual || !escenaActual || !loteActual.tileUrl) {
      avisar('Abrí una capa sobre el lote antes de capturarla.', 'info');
      return;
    }
    const loteId = loteActivoId;
    const modo = loteActual.modoCapa || modoViz;
    if (capasLote.some((c) => c.escenaId === escenaActual.id && c.modo === modo)) {
      avisar('Esa capa ya está capturada para este lote.', 'info');
      return;
    }
    setCapturando(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/capturar-capa`, {
        escena_id: escenaActual.id, modo_viz: modo, geojson: loteActual.geojson, enmascarar_nubes: enmascararNubes
      });
      const capa = {
        id: `capa_${Date.now()}`,
        nombre: `${modo} · ${escenaActual.fecha || ''}`,
        modo,
        escenaId: escenaActual.id,
        fecha: escenaActual.fecha || '',
        satelite: escenaActual.satelite || '',
        tileUrl: res.data.tile_url,
        vis: res.data.vis,
        stats: res.data.stats,
        visible: false // encendida en el mapa (se maneja desde el panel izquierdo)
      };
      setLotes((prev) => prev.map((l) => (l.id !== loteId ? l : { ...l, capas: [...(l.capas || []), capa] })));
      avisar(`Capa "${capa.nombre}" capturada y recortada al lote.`, 'info');
    } catch (err) {
      avisar(await mensajeError(err, 'No se pudo capturar la capa'));
    } finally {
      setCapturando(false);
    }
  };

  const cambiarCapas = (fn) =>
    setLotes((prev) => prev.map((l) => (l.id !== loteActivoId ? l : { ...l, capas: fn(l.capas || []) })));
  const quitarCapa = (id) => {
    cambiarCapas((cs) => cs.filter((c) => c.id !== id));
    if (capaAnalisisId === id) setCapaAnalisisId(null);
  };

  // Al elegir una capa para analizar, la curva propone el período que termina un mes después de su fecha
  const seleccionarCapaAnalisis = (capa) => {
    setCapaAnalisisId(capa.id);
    setCurvaLote(null);
    if (/^\d{4}-\d{2}-\d{2}$/.test(capa.fecha)) {
      const hoy = new Date().toISOString().split('T')[0];
      const fin = sumarDias(capa.fecha, 30);
      setCurvaDesde(sumarDias(capa.fecha, -180));
      setCurvaHasta(fin > hoy ? hoy : fin);
    }
  };

  const calcularCurvaLote = async () => {
    if (!capaAnalisis || !INDICES.includes(capaAnalisis.modo)) return;
    if (sensoresActivos.length === 0) { avisar('Activá al menos un sensor en Explorar imágenes.', 'info'); return; }
    setCargandoCurva(true);
    setCurvaLote(null);
    try {
      const res = await axios.post(`${API_BASE_URL}/serie-temporal-lote`, {
        geojson: loteActual.geojson, indice: capaAnalisis.modo,
        fecha_inicio: curvaDesde, fecha_fin: curvaHasta,
        sensores: sensoresActivos, nubosidad_max: Number(nubosidadMax), enmascarar_nubes: enmascararNubes
      });
      setCurvaLote({ capaId: capaAnalisis.id, puntos: res.data.puntos || [] });
    } catch (err) {
      avisar(await mensajeError(err, 'No se pudo calcular la curva de evolución'));
    } finally {
      setCargandoCurva(false);
    }
  };
  const toggleVisibleCapa = (id) => cambiarCapas((cs) => cs.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c)));

  // ---------- Descargas de escenas (Copernicus) ----------
  const abrirModalDescargaEscena = (escenaObj, e) => {
    e.stopPropagation();
    setEscenaModal(escenaObj);
    setTipoDescarga('completa');
    setModalDescargaAbierto(true);
  };

  const cerrarModalDescarga = () => setModalDescargaAbierto(false);

  const toggleBandaModal = (bandaId) =>
    setBandasSeleccionadas((prev) => (prev.includes(bandaId) ? prev.filter((b) => b !== bandaId) : [...prev, bandaId]));

  const refrescarDescargas = async () => {
    const ids = leerIds();
    if (ids.length === 0) { setDescargas([]); return; }
    try {
      const { data } = await axios.get(`${API_BASE_URL}/descargas`, { params: { ids: ids.join(',') } });
      data.forEach((d) => {
        const antes = estadosRef.current[d.job_id];
        if (antes && ESTADOS_ACTIVOS.includes(antes) && !ESTADOS_ACTIVOS.includes(d.estado)) {
          if (d.estado === 'listo') avisar('Una descarga está lista. Podés guardarla desde la sección Descargas.', 'info');
          else if (d.estado === 'error') avisar(`Falló una descarga: ${d.error || 'error desconocido'}`);
        }
        estadosRef.current[d.job_id] = d.estado;
      });
      setDescargas(data);
    } catch (_) { /* servidor no disponible: se reintenta */ }
  };

  const iniciarDescargaEscena = async () => {
    if (!escenaModal) return;
    if (familiaDe(escenaModal) === 'Landsat') { avisar('La descarga de escenas Landsat todavía no está disponible.', 'info'); return; }
    if (!escenaModal.producto) { avisar('Esta escena no trae el identificador del producto. Volvé a buscar las escenas.', 'info'); return; }
    if (tipoDescarga === 'bandas' && bandasSeleccionadas.length === 0) { avisar('Seleccioná al menos una banda.', 'info'); return; }
    setIniciandoDescarga(true);
    try {
      const { data } = await axios.post(`${API_BASE_URL}/descargas`, {
        producto: escenaModal.producto,
        satelite: escenaModal.satelite,
        fecha: escenaModal.fecha || '',
        lote: loteActual?.nombre || '',
        tipo: tipoDescarga,
        bandas: tipoDescarga === 'bandas' ? bandasSeleccionadas : []
      });
      guardarIds([data.job_id, ...leerIds().filter((i) => i !== data.job_id)]);
      estadosRef.current[data.job_id] = data.estado;
      setDescargas((prev) => [data, ...prev.filter((d) => d.job_id !== data.job_id)]);
      setModalDescargaAbierto(false);
      irASeccion('descargas');
      avisar('Descarga en preparación. Seguí el avance desde esta sección.', 'info');
    } catch (err) {
      avisar(await mensajeError(err, 'No se pudo iniciar la descarga'));
    } finally {
      setIniciandoDescarga(false);
    }
  };

  const quitarDescarga = (id) => {
    guardarIds(leerIds().filter((i) => i !== id));
    setDescargas((prev) => prev.filter((d) => d.job_id !== id));
  };

  useEffect(() => {
    if (!herramientaActiva) return undefined;
    const alTeclear = (e) => { if (e.key === 'Escape') activarHerramienta(null); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [herramientaActiva]);

  useEffect(() => { refrescarDescargas(); }, []);

  useEffect(() => {
    if (!hayDescargasActivas) return undefined;
    const t = setInterval(refrescarDescargas, 2000);
    return () => clearInterval(t);
  }, [hayDescargasActivas]);

  useEffect(() => {
    let vivo = true;
    const chequear = () =>
      axios.get(`${API_BASE_URL}/salud`, { timeout: 5000 })
        .then(() => vivo && setServidorOk(true))
        .catch(() => vivo && setServidorOk(false));
    chequear();
    const t = setInterval(chequear, 30000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  // ---------- Zonas de manejo ----------
  const ejecutarAmbientacion = async () => {
    if (!escenaActual) { avisar('Seleccioná primero una escena satelital.', 'info'); return; }
    if (escenaActual.esDem) { avisar('Las zonas de manejo se calculan sobre una escena satelital, no sobre el DEM.', 'info'); return; }
    const loteId = loteActivoId;
    const params = {
      escena_id: escenaActual.id,
      indice: indiceAmbientacion,
      num_clusters: clasesAmbientacion,
      superficie_min_m2: parseFloat(superficieMinM2) || 0,
      metodo: metodoZonas,
      enmascarar_nubes: enmascararNubes,
      geojson: loteActual.geojson
    };
    setCargando(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/clusterizar-lote`, params);
      actualizarLote(loteId, {
        ambientacion: {
          tileUrl: res.data.tile_url,
          bordesUrl: res.data.border_tile_url,
          zonas: res.data.zonas || [],
          areaTotalHa: res.data.area_total_ha,
          areaSinDatoHa: res.data.area_sin_dato_ha,
          indice: indiceAmbientacion,
          params
        }
      });
    } catch (err) {
      avisar(await mensajeError(err, 'Error procesando las zonas de manejo'));
    } finally {
      setCargando(false);
    }
  };

  const restablecerAmbientacion = () => {
    setClasesAmbientacion(3);
    setSuperficieMinM2(2000);
    setMetodoZonas('cuantiles');
    if (loteActivoId) actualizarLote(loteActivoId, { ambientacion: null });
  };

  const descargarVectorZonas = async (formato) => {
    if (!ambientacion) return;
    setExportando(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/descargar-vector-ambientacion`, { ...ambientacion.params, formato }, { responseType: 'blob' });
      guardarBlob(res.data, `${nombreSeguro(loteActual.nombre)}_zonas_${ambientacion.indice}_${formato}.zip`);
    } catch (err) {
      avisar(await mensajeError(err, 'Error al exportar las zonas'));
    } finally {
      setExportando(false);
    }
  };

  // ---------- Tendencia ----------
  const cargarSerie = async (lat, lng, indice = indiceTendencia) => {
    setPuntoTendencia([lat, lng]);
    setCargandoSerie(true);
    setSerieTendencia(null);
    try {
      const res = await axios.post(`${API_BASE_URL}/serie-temporal-pixel`, {
        lat, lng, indice,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        sensores: sensoresActivos,
        enmascarar_nubes: enmascararNubes
      });
      setSerieTendencia(res.data.puntos || []);
    } catch (err) {
      avisar(await mensajeError(err, 'Error obteniendo la serie temporal'));
    } finally {
      setCargandoSerie(false);
    }
  };

  const cambiarIndiceTendencia = (indice) => {
    setIndiceTendencia(indice);
    if (puntoTendencia) cargarSerie(puntoTendencia[0], puntoTendencia[1], indice);
  };

  const badgeDe = (id) => {
    if (id === 'imagenes') return loteActual?.escenas?.length || 0;
    if (id === 'areas') return lotes.length;
    if (id === 'lote') return capasLote.length;
    if (id === 'descargas') return descargas.length;
    return 0;
  };

  const info = INFO_SECCION[seccionActiva];

  return (
    <div className="gs-app">
      <style>{`
        *{box-sizing:border-box}
        .gs-app{
          --bg:#0c0f14; --surface:#121720; --surface-2:#0e1218; --surface-3:#18202c; --hover:#1a2230;
          --border:#232d3f; --border-soft:#1a2230;
          --text:#f3f4f6; --text-2:#c4cbd6; --muted:#8b95a5; --faint:#586377;
          --accent:#2563eb; --accent-hover:#1d4fd8; --accent-soft:rgba(37,99,235,.16); --accent-text:#7db0ff;
          --green:#22c55e; --green-soft:rgba(34,197,94,.16); --danger:#f87171; --amber:#f59e0b;
          --overlay:rgba(18,23,32,.94);
          position:fixed;inset:0;display:flex;flex-direction:column;
          background:var(--bg);color:var(--text);color-scheme:dark;
          font-family:Inter,Roboto,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
          font-size:13px;line-height:1.4;overflow:hidden;
        }
        .gs-app button{font-family:inherit}

        /* Barra superior */
        .gs-topbar{
          height:64px;flex:0 0 64px;background:var(--surface);border-bottom:1px solid var(--border);
          display:flex;align-items:center;padding:0 20px;gap:20px;z-index:1000
        }
        .gs-brand{display:flex;align-items:center;gap:11px;min-width:228px}
        .gs-logo{width:36px;height:36px;border-radius:10px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center}
        .gs-brand-name{font-size:16px;font-weight:750;letter-spacing:-.02em;color:var(--text)}
        .gs-brand-sub{font-size:9px;font-weight:650;letter-spacing:.12em;color:var(--faint);margin-top:1px}
        .gs-search{
          height:40px;flex:1;max-width:620px;background:var(--surface-2);border:1px solid var(--border);
          border-radius:9px;display:flex;align-items:center;padding:0 13px;gap:9px;color:var(--muted);transition:.15s
        }
        .gs-search:focus-within{background:var(--bg);border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
        .gs-search input{border:0;outline:0;background:transparent;width:100%;font-size:13px;color:var(--text)}
        .gs-search input::placeholder{color:var(--faint)}
        .gs-search kbd{font-family:inherit;font-size:10px;color:var(--faint)}
        .gs-top-actions{margin-left:auto;display:flex;align-items:center;gap:8px}
        .gs-top-btn{
          height:38px;padding:0 12px;border:1px solid var(--border);background:var(--surface-3);border-radius:8px;
          color:var(--text-2);font-weight:600;cursor:pointer;display:flex;align-items:center;gap:7px
        }
        .gs-top-btn:hover{background:var(--hover);border-color:var(--faint)}
        .gs-user{width:36px;height:36px;border-radius:50%;background:var(--accent-soft);color:var(--accent-text);display:flex;align-items:center;justify-content:center;font-weight:750;margin-left:4px}

        .gs-body{display:flex;min-height:0;flex:1}

        /* Panel izquierdo */
        .gs-sidebar{width:248px;flex:0 0 248px;background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;z-index:900;overflow-y:auto}
        .gs-workspace{padding:17px 12px 14px;border-bottom:1px solid var(--border-soft)}
        .gs-label{padding:0 4px;font-size:10px;text-transform:uppercase;letter-spacing:.1em;font-weight:750;color:var(--faint)}
        .gs-ws-tabs{margin-top:9px;display:flex;flex-direction:column;gap:6px}
        .gs-ws-tab{
          width:100%;border:1px solid var(--border);border-radius:9px;padding:10px 11px;background:var(--surface-2);
          display:flex;align-items:center;gap:10px;cursor:pointer;text-align:left;color:var(--muted);transition:.15s
        }
        .gs-ws-tab:hover:not(:disabled){background:var(--hover);color:var(--text-2)}
        .gs-ws-tab.active{background:var(--surface-3);border-color:var(--accent);color:var(--text)}
        .gs-ws-tab:disabled{opacity:.45;cursor:not-allowed}
        .gs-ws-dot{width:9px;height:9px;flex:0 0 9px;border-radius:50%;background:#2d3647}
        .gs-ws-tab.active .gs-ws-dot{background:var(--green);box-shadow:0 0 0 4px var(--green-soft)}
        .gs-ws-text{min-width:0;display:flex;flex-direction:column}
        .gs-ws-name{font-weight:700;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .gs-ws-meta{font-size:10px;color:var(--faint);margin-top:2px}
        .gs-nav{padding:13px 10px;display:flex;flex-direction:column;gap:3px}
        .gs-nav-title{padding:4px 10px 7px;font-size:10px;color:var(--faint);font-weight:750;letter-spacing:.09em;text-transform:uppercase}
        .gs-nav-title.spaced{margin-top:8px}
        .gs-nav-item{
          height:42px;border:0;background:transparent;border-radius:8px;padding:0 11px;display:flex;align-items:center;gap:11px;
          color:var(--muted);font-weight:600;cursor:pointer;text-align:left;width:100%
        }
        .gs-nav-item:hover:not(:disabled){background:var(--hover);color:var(--text)}
        .gs-nav-item.active{background:var(--accent-soft);color:var(--accent-text)}
        .gs-nav-item:disabled{opacity:.45;cursor:not-allowed}
        .gs-nav-icon{width:19px;display:flex;justify-content:center;align-items:center}
        .gs-nav-text{flex:1}
        .gs-nav-badge{font-size:10px;background:var(--surface-3);color:var(--muted);border-radius:10px;padding:2px 6px}
        .gs-nav-item.active .gs-nav-badge{background:rgba(37,99,235,.28);color:var(--accent-text)}
        .gs-sidebar-bottom{margin-top:auto;padding:12px 12px 14px;border-top:1px solid var(--border-soft)}
        .gs-help{border:1px solid var(--border);border-radius:9px;padding:11px;background:var(--surface-2)}
        .gs-help strong{font-size:11px;display:block;color:var(--text-2);margin-bottom:3px}
        .gs-help span{font-size:10px;color:var(--faint);display:block;line-height:1.45}

        /* Mapa */
        .gs-main{position:relative;flex:1;min-width:0;min-height:0;background:var(--bg)}
        .gs-map{position:absolute;inset:0}
        .gs-map .leaflet-container{height:100%;width:100%;font-family:inherit;background:var(--bg)}
        .gs-map.crosshair .leaflet-grab,.gs-map.crosshair .leaflet-interactive{cursor:crosshair}
        .leaflet-control-zoom{border:0!important;box-shadow:0 3px 12px rgba(0,0,0,.5)!important}
        .leaflet-control-zoom a{border:0!important;width:34px!important;height:34px!important;line-height:34px!important;color:var(--text-2)!important;background:var(--surface)!important}
        .leaflet-control-zoom a:hover{background:var(--hover)!important;color:var(--text)!important}
        .leaflet-control-attribution{font-size:9px!important;background:rgba(12,15,20,.8)!important;color:var(--muted)!important}
        .leaflet-control-attribution a{color:var(--accent-text)!important}
        .leaflet-popup-content-wrapper,.leaflet-popup-tip{background:var(--surface)!important;color:var(--text)!important;border:1px solid var(--border);box-shadow:0 6px 20px rgba(0,0,0,.5)!important}
        .leaflet-popup-content{margin:10px 12px!important;font-size:11px}
        .leaflet-container a.leaflet-popup-close-button{color:var(--muted)!important}

        .gs-pop{min-width:150px;color:var(--text-2)}
        .gs-pop-title{font-weight:750;color:var(--text);margin-bottom:5px}
        .gs-pop-row{display:flex;justify-content:space-between;gap:16px;margin-bottom:2px}
        .gs-pop-row strong{color:var(--text)}
        .gs-pop-coords{margin-top:6px;font-size:10px;color:var(--faint)}
        .gs-pop-error{color:var(--danger)}

        .gs-map-top{position:absolute;left:64px;right:18px;top:18px;z-index:600;display:flex;align-items:flex-start;justify-content:space-between;pointer-events:none}
        .gs-map-title{pointer-events:auto;background:var(--overlay);border:1px solid var(--border);border-radius:10px;padding:11px 14px;box-shadow:0 5px 18px rgba(0,0,0,.4);width:290px}
        .gs-map-title-main{font-size:13px;font-weight:750;color:var(--text)}
        .gs-map-title-sub{font-size:10px;color:var(--muted);margin-top:2px}
        .gs-map-tools{position:relative;display:flex;gap:7px;pointer-events:auto}
        .gs-tool{
          height:38px;background:var(--overlay);border:1px solid var(--border);border-radius:8px;padding:0 11px;
          box-shadow:0 4px 14px rgba(0,0,0,.35);display:flex;align-items:center;gap:7px;color:var(--text-2);font-weight:650;cursor:pointer
        }
        .gs-tool:hover{background:var(--hover)}
        .gs-tool.active{color:var(--accent-text);border-color:var(--accent);background:var(--accent-soft)}
        .gs-menu{position:absolute;right:0;top:45px;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:6px;box-shadow:0 8px 24px rgba(0,0,0,.5);display:flex;flex-direction:column;gap:2px;min-width:150px}
        .gs-menu button{border:0;background:transparent;padding:7px 10px;text-align:left;border-radius:6px;color:var(--muted);font-size:11px;cursor:pointer}
        .gs-menu button:hover{background:var(--hover);color:var(--text)}
        .gs-menu button.active{background:var(--accent-soft);color:var(--accent-text)}

        .gs-hint{position:absolute;left:50%;transform:translateX(-50%);bottom:76px;z-index:600;display:flex;align-items:center;gap:12px;flex-wrap:wrap;width:max-content;max-width:calc(100% - 300px);background:var(--overlay);border:1px solid var(--accent);border-radius:9px;padding:9px 12px;box-shadow:0 5px 18px rgba(0,0,0,.4);font-size:11px;color:var(--text-2)}
        .gs-hint strong{color:var(--text)}
        .gs-hint-actions{display:flex;gap:6px}
        .gs-tree{margin:2px 0 6px 20px;padding-left:12px;border-left:1px solid var(--border);display:flex;flex-direction:column;gap:1px}
        .gs-tree-empty{font-size:10px;color:var(--faint);padding:4px 0}
        .gs-tree-item{display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:6px;font-size:11px;color:var(--muted);cursor:pointer}
        .gs-tree-item:hover{background:var(--hover);color:var(--text)}
        .gs-tree-item input{accent-color:var(--accent);flex:0 0 auto}
        .gs-tree-item span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .gs-tree-item:has(input:checked){color:var(--text)}
        .gs-capturar{margin-top:9px;display:flex;align-items:center;gap:8px}
        .gs-capa-card{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 10px;margin-bottom:6px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2);cursor:pointer}
        .gs-capa-card:hover{background:var(--hover)}
        .gs-capa-card.active{border-color:var(--accent);background:var(--accent-soft)}
        .gs-chart-mark{stroke:var(--green)}
        .gs-capa-text{display:flex;flex-direction:column;min-width:0}
        .gs-capa-name{font-size:11px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .gs-capa-meta{font-size:9px;color:var(--muted);margin-top:2px;line-height:1.4}
        .gs-capa-actions{display:flex;align-items:center;gap:6px;flex:0 0 auto}
        .gs-icon-mini{border:0;background:transparent;color:var(--muted);cursor:pointer;font-size:14px;line-height:1;padding:2px 3px}
        .gs-icon-mini:hover{color:var(--text)}
        .gs-icon-mini.on{color:var(--green)}
        .gs-legend{position:absolute;left:18px;bottom:78px;z-index:600;width:190px;background:var(--overlay);border:1px solid var(--border);border-radius:8px;padding:7px 9px}
        .gs-legend-title{font-size:11px;font-weight:650;color:var(--text);margin-bottom:5px}
        .gs-legend-bar{height:8px;border-radius:2px}
        .gs-legend-scale{display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:3px}

        .gs-map-bottom{position:absolute;left:18px;right:18px;bottom:18px;z-index:600;display:flex;align-items:flex-end;justify-content:space-between;gap:12px;pointer-events:none}
        .gs-status{pointer-events:auto;background:var(--overlay);border:1px solid var(--border);border-radius:9px;box-shadow:0 5px 18px rgba(0,0,0,.4);padding:7px 12px;display:flex;align-items:center;gap:14px;min-height:38px;flex-wrap:wrap}
        .gs-status-item{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:10px}
        .gs-status-item strong{color:var(--text)}
        .gs-status-dot{width:7px;height:7px;border-radius:50%;background:var(--faint)}
        .gs-status-dot.ok{background:var(--green)}
        .gs-status-dot.fail{background:var(--danger)}
        .gs-chip-btn{height:26px;border:1px solid var(--border);background:var(--surface-3);color:var(--text-2);border-radius:6px;padding:0 9px;font-size:10px;font-weight:650;cursor:pointer}
        .gs-chip-btn:hover{background:var(--hover)}
        .gs-chip-btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
        .gs-layer-switch{pointer-events:auto;background:var(--overlay);border:1px solid var(--border);border-radius:9px;box-shadow:0 5px 18px rgba(0,0,0,.4);padding:4px 4px 4px 12px;display:flex;align-items:center;gap:8px;color:var(--muted);font-size:10px;font-weight:650}
        .gs-layer-switch select{height:30px;border:0;border-radius:6px;background:var(--surface-3);color:var(--text);padding:0 8px;font-size:11px;font-weight:650;outline:none;cursor:pointer}

        /* Panel derecho */
        .gs-inspector{width:390px;flex:0 0 390px;background:var(--surface);border-left:1px solid var(--border);display:flex;flex-direction:column;z-index:800;min-height:0}
        .gs-inspector-head{padding:17px 18px 14px;border-bottom:1px solid var(--border-soft)}
        .gs-eyebrow{font-size:10px;text-transform:uppercase;letter-spacing:.1em;font-weight:750;color:var(--faint)}
        .gs-inspector-title{font-size:18px;font-weight:780;letter-spacing:-.025em;color:var(--text);margin-top:4px}
        .gs-inspector-sub{font-size:11px;color:var(--muted);margin-top:3px}
        .gs-inspector-scroll{overflow:auto;flex:1;padding:15px 16px 20px}
        .gs-inspector-scroll::-webkit-scrollbar,.gs-sidebar::-webkit-scrollbar{width:7px}
        .gs-inspector-scroll::-webkit-scrollbar-thumb,.gs-sidebar::-webkit-scrollbar-thumb{background:var(--border);border-radius:20px}
        .gs-section{margin-bottom:18px}
        .gs-section-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px}
        .gs-section-title{font-size:11px;font-weight:750;color:var(--text-2)}
        .gs-section-note{font-size:10px;color:var(--faint)}
        .gs-field{margin-bottom:10px}
        .gs-field label{display:block;font-size:10px;color:var(--muted);font-weight:650;margin-bottom:5px}
        .gs-input,.gs-select{width:100%;height:38px;border:1px solid var(--border);border-radius:7px;background:var(--surface-2);padding:0 10px;outline:none;color:var(--text);font-size:12px}
        .gs-input:focus,.gs-select:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
        .gs-grid2{display:grid;grid-template-columns:1fr 1fr;gap:9px}
        .gs-slider-row{display:flex;align-items:center;gap:10px}
        .gs-slider-row input{flex:1;accent-color:var(--accent)}
        .gs-pill{background:var(--surface-3);border:1px solid var(--border);color:var(--muted);border-radius:20px;padding:4px 8px;font-size:10px;font-weight:700;white-space:nowrap}
        .gs-pill.ok{background:var(--green-soft);border-color:transparent;color:var(--green)}
        .gs-pill.error{background:rgba(248,113,113,.14);border-color:transparent;color:var(--danger)}
        .gs-pill.activo{background:var(--accent-soft);border-color:transparent;color:var(--accent-text)}
        .gs-check{display:flex;align-items:center;gap:8px;padding:8px 9px;border:1px solid var(--border);border-radius:7px;background:var(--surface-2);color:var(--text-2);font-size:11px}
        .gs-check input{accent-color:var(--accent)}
        .gs-sensor-group{display:flex;align-items:center;gap:6px;margin-bottom:6px}
        .gs-sensor-fam{width:78px;font-size:10px;color:var(--faint)}
        .gs-toggle{flex:1;height:30px;border:1px solid var(--border);border-radius:7px;background:var(--surface-2);color:var(--muted);font-size:11px;font-weight:650;cursor:pointer}
        .gs-toggle.on{background:var(--accent-soft);border-color:var(--accent);color:var(--accent-text)}
        .gs-primary{width:100%;height:42px;border:0;border-radius:8px;background:var(--accent);color:#fff;font-weight:750;font-size:12px;cursor:pointer}
        .gs-primary:hover:not(:disabled){background:var(--accent-hover)}
        .gs-primary:disabled{opacity:.55;cursor:wait}
        .gs-secondary{height:38px;border:1px solid var(--border);border-radius:7px;background:var(--surface-3);color:var(--text-2);padding:0 11px;font-weight:650;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;font-size:12px}
        .gs-secondary:hover:not(:disabled){background:var(--hover)}
        .gs-secondary:disabled{opacity:.5;cursor:not-allowed}
        .gs-btn-row{display:flex;gap:8px;margin-top:9px}
        .gs-btn-row>*{flex:1}
        .gs-link{border:0;background:transparent;color:var(--accent-text);font-size:10px;font-weight:700;cursor:pointer;text-decoration:none;padding:0}
        .gs-link:hover:not(:disabled){text-decoration:underline}
        .gs-link:disabled{color:var(--faint);cursor:not-allowed}
        .gs-link.muted{color:var(--muted)}
        .gs-icon-btn{border:0;background:transparent;color:var(--muted);cursor:pointer;font-size:20px;line-height:1;padding:0 4px}
        .gs-icon-btn:hover{color:var(--text)}

        .gs-scene{border:1px solid var(--border);border-radius:10px;background:#0a0d12;padding:9px;margin-bottom:8px;cursor:pointer;transition:.15s}
        .gs-scene:hover{border-color:var(--faint);background:#0f141b}
        .gs-scene.active{border-color:var(--accent);background:#111823}
        .gs-scene-top{display:flex;gap:9px}
        .gs-scene-thumb{width:76px;height:64px;border-radius:6px;overflow:hidden;background:var(--surface-3);flex:0 0 76px}
        .gs-scene-thumb img{width:100%;height:100%;object-fit:cover;display:block}
        .gs-scene-info{min-width:0;flex:1}
        .gs-scene-date{font-size:11px;font-weight:750;color:var(--text)}
        .gs-scene-sat{font-size:10px;color:var(--muted);margin-top:2px}
        .gs-scene-meta{display:flex;gap:6px;margin-top:7px;flex-wrap:wrap}
        .gs-scene-chip{font-size:9px;color:var(--muted);background:var(--surface-3);border-radius:10px;padding:3px 6px}
        .gs-scene-footer{display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:7px;border-top:1px solid var(--border-soft)}
        .gs-scene-status{font-size:9px;color:var(--muted)}
        .gs-empty{padding:25px 12px;text-align:center;border:1px dashed var(--border);border-radius:9px;color:var(--muted)}
        .gs-empty strong{display:block;color:var(--text-2);margin-bottom:4px;font-size:12px}
        .gs-area{border:1px solid var(--border);border-radius:9px;padding:10px;background:var(--surface-2);margin-bottom:8px;cursor:pointer}
        .gs-area:hover{background:var(--hover)}
        .gs-area.active{border-color:var(--accent);background:var(--accent-soft)}
        .gs-area.static{cursor:default}
        .gs-area.static:hover{background:var(--surface-2)}
        .gs-area-row{display:flex;align-items:center;gap:9px}
        .gs-area-icon{width:30px;height:30px;border-radius:7px;background:var(--accent-soft);color:var(--accent-text);display:flex;align-items:center;justify-content:center;flex:0 0 30px}
        .gs-area-name{font-weight:700;color:var(--text);font-size:11px}
        .gs-area-meta{font-size:9px;color:var(--muted);margin-top:2px}
        .gs-result{border:1px solid var(--border);border-radius:9px;background:var(--surface-2);padding:11px;margin-top:9px}
        .gs-result.info{background:var(--accent-soft);border-color:transparent}
        .gs-result-title{font-size:11px;font-weight:750;color:var(--text)}
        .gs-result-text{font-size:11px;color:var(--text-2);line-height:1.5;margin-top:6px}
        .gs-kpis{display:grid;grid-template-columns:1fr 1fr;gap:7px}
        .gs-kpi{padding:9px;background:var(--surface);border:1px solid var(--border);border-radius:7px}
        .gs-kpi-label{font-size:9px;color:var(--muted)}
        .gs-kpi-value{font-size:16px;font-weight:780;color:var(--text);margin-top:2px}
        .gs-kpi-value small{font-size:10px;font-weight:600;color:var(--muted)}
        .gs-zona{display:grid;grid-template-columns:14px 1fr auto auto;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-soft);font-size:10px;color:var(--text-2)}
        .gs-zona:last-of-type{border-bottom:0}
        .gs-zona-sw{width:12px;height:12px;border-radius:3px}
        .gs-zona-rango{color:var(--faint)}
        .gs-progress{height:5px;border-radius:3px;background:var(--surface-3);overflow:hidden;margin-top:8px}
        .gs-progress>div{height:100%;background:var(--accent);transition:width .4s}
        .gs-note{font-size:10px;color:var(--faint);margin-top:6px;line-height:1.45}
        .gs-note.error{color:var(--danger)}
        .gs-chart-grid{stroke:var(--border-soft)}
        .gs-chart-label{fill:var(--muted)}
        .gs-chart-line{stroke:var(--faint)}
        .gs-chart-empty{font-size:11px;color:var(--muted);padding:10px 0}
        .gs-chart-legend{display:flex;gap:14px;margin-top:6px;font-size:10px;color:var(--muted)}
        .gs-chart-legend i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px}

        .gs-toast{position:fixed;top:78px;left:50%;transform:translateX(-50%);z-index:3000;background:var(--surface-3);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:10px 14px;box-shadow:0 8px 28px rgba(0,0,0,.55);display:flex;align-items:center;gap:12px;font-size:11px;max-width:min(560px,calc(100vw - 40px))}
        .gs-toast.error .gs-toast-icon{color:var(--danger)}
        .gs-toast.info .gs-toast-icon{color:var(--green)}
        .gs-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(2px);z-index:2500;display:flex;align-items:center;justify-content:center}
        .gs-modal{width:min(620px,calc(100vw - 40px));max-height:calc(100vh - 60px);overflow:auto;background:var(--surface);border-radius:14px;box-shadow:0 20px 70px rgba(0,0,0,.6);border:1px solid var(--border)}
        .gs-modal-head{padding:18px 20px;border-bottom:1px solid var(--border-soft);display:flex;justify-content:space-between;align-items:center}
        .gs-modal-title{font-size:16px;font-weight:780;color:var(--text)}
        .gs-modal-body{padding:18px 20px}
        .gs-modal-foot{padding:13px 20px;border-top:1px solid var(--border-soft);display:flex;justify-content:flex-end;gap:8px}
        .gs-modal-foot .gs-primary{width:auto;padding:0 18px}
        .gs-radio{display:flex;gap:10px;padding:12px;border:1px solid var(--border);border-radius:9px;margin-bottom:8px;cursor:pointer;background:var(--surface-2)}
        .gs-radio input{accent-color:var(--accent)}
        .gs-radio.selected{border-color:var(--accent);background:var(--accent-soft)}
        .gs-radio-title{font-size:11px;font-weight:700;color:var(--text)}
        .gs-radio-desc{font-size:10px;color:var(--muted);margin-top:2px;line-height:1.45}
        .gs-bandas{display:grid;grid-template-columns:1fr 1fr;gap:6px}

        @media(max-width:1180px){
          .gs-sidebar{width:215px;flex-basis:215px}.gs-inspector{width:350px;flex-basis:350px}.gs-brand{min-width:190px}
        }
        @media(max-width:900px){
          .gs-sidebar{width:62px;flex-basis:62px}
          .gs-tree,.gs-brand-sub,.gs-brand-name,.gs-nav-text,.gs-nav-title,.gs-nav-badge,.gs-workspace,.gs-sidebar-bottom{display:none}
          .gs-nav-item{justify-content:center;padding:0}.gs-inspector{width:330px;flex-basis:330px}
        }
      `}</style>

      <input ref={fileInputRef} type="file" accept=".zip,.geojson,.json,.kml,.kmz" onChange={manejarCargaArchivo} style={{ display: 'none' }} />

      {toast && (
        <div className={`gs-toast ${toast.tipo}`} role="status">
          <span className="gs-toast-icon">{toast.tipo === 'error' ? '⚠' : '✓'}</span>
          <span>{toast.texto}</span>
          <button className="gs-icon-btn" onClick={() => setToast(null)} aria-label="Cerrar aviso">×</button>
        </div>
      )}

      <header className="gs-topbar">
        <div className="gs-brand">
          <div className="gs-logo"><IconLogo /></div>
          <div>
            <div className="gs-brand-name">GeoSat Pro</div>
            <div className="gs-brand-sub">INTELLIGENT GEOANALYTICS</div>
          </div>
        </div>

        <div className="gs-search">
          <span aria-hidden="true">⌕</span>
          <input
            value={inputBusqueda}
            onChange={(e) => setInputBusqueda(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && buscarUbicacion()}
            placeholder="Buscar lugar o coordenadas…"
          />
          <kbd>Enter</kbd>
        </div>
        <button className="gs-top-btn" onClick={() => fileInputRef.current?.click()}><IconSubir /> Importar área</button>

        <div className="gs-top-actions">
          <button className="gs-top-btn" onClick={() => irASeccion('descargas')}><IconDescargas /> Descargas{hayDescargasActivas ? ' •' : ''}</button>
          <div className="gs-user">EC</div>
        </div>
      </header>

      <div className="gs-body">
        <aside className="gs-sidebar">
          <div className="gs-workspace">
            <div className="gs-label" id="gs-ws-label">Espacio de trabajo</div>
            <div className="gs-ws-tabs" role="tablist" aria-labelledby="gs-ws-label" aria-orientation="vertical">
              {ESPACIOS.map((esp) => {
                const activo = esp.id === espacioActivo;
                return (
                  <button
                    key={esp.id}
                    role="tab"
                    aria-selected={activo}
                    disabled={!esp.habilitado}
                    className={`gs-ws-tab ${activo ? 'active' : ''}`}
                    onClick={() => setEspacioActivo(esp.id)}
                  >
                    <span className="gs-ws-dot" />
                    <span className="gs-ws-text">
                      <span className="gs-ws-name">{esp.nombre}</span>
                      <span className="gs-ws-meta">
                        {esp.habilitado ? `${lotes.length} ${lotes.length === 1 ? 'espacio' : 'espacios'} de trabajo` : 'Próximamente'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <nav className="gs-nav" aria-label={`Secciones de ${espacioActivo}`}>
            {(NAV_ESPACIO[espacioActivo] || []).map((grupo, gi) => (
              <React.Fragment key={grupo.titulo}>
                <div className={`gs-nav-title ${gi > 0 ? 'spaced' : ''}`}>{grupo.titulo}</div>
                {grupo.items.map(({ id, label, Icon, pronto }) => {
                  const badge = badgeDe(id);
                  return (
                    <React.Fragment key={id}>
                    <button
                      disabled={pronto}
                      title={pronto ? 'Próximamente' : undefined}
                      className={`gs-nav-item ${seccionActiva === id ? 'active' : ''}`}
                      onClick={() => irASeccion(id)}
                    >
                      <span className="gs-nav-icon"><Icon /></span>
                      <span className="gs-nav-text">{label}</span>
                      {pronto ? <span className="gs-nav-badge">Pronto</span> : badge ? <span className="gs-nav-badge">{badge}</span> : null}
                    </button>
                    {id === 'lote' && loteActual && (
                      <div className="gs-tree" role="group" aria-label="Capas del lote">
                        {capasLote.length === 0 ? (
                          <div className="gs-tree-empty">Sin capas capturadas</div>
                        ) : capasLote.map((c) => (
                          <label key={c.id} className="gs-tree-item" title={c.nombre}>
                            <input type="checkbox" checked={c.visible} onChange={() => toggleVisibleCapa(c.id)} />
                            <span>{c.nombre}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    </React.Fragment>
                  );
                })}
              </React.Fragment>
            ))}
          </nav>

          <div className="gs-sidebar-bottom">
            <div className="gs-help">
              <strong>Espacio de trabajo seguro</strong>
              <span>Tus áreas, consultas y productos quedan organizados dentro de este espacio de trabajo.</span>
            </div>
          </div>
        </aside>

        <main className="gs-main">
          <div className={`gs-map ${herramientaActiva || modoTendencia ? 'crosshair' : ''}`} onContextMenu={(e) => modoDibujar && e.preventDefault()}>
            <MapContainer center={[-27.4, -66.3]} zoom={6} scrollWheelZoom>
              <TileLayer url={MAPAS_BASE[mapaBaseActual]} attribution="&copy; Google" />
              {!modoGestion && loteActual?.tileUrl && <TileLayer url={loteActual.tileUrl} opacity={0.86} />}
              {!modoGestion && ambientacion?.tileUrl && <TileLayer url={ambientacion.tileUrl} opacity={opacidadAmbientacion / 100} />}
              {!modoGestion && ambientacion?.bordesUrl && <TileLayer url={ambientacion.bordesUrl} opacity={0.95} />}
              {capasLote.filter((c) => c.visible).map((c) => <TileLayer key={c.id} url={c.tileUrl} opacity={0.92} />)}
              {lotes.filter((l) => !modoGestion || l.id === loteActivoId).map((l) => l.contornos.map((anillo, i) => (
                <Polygon
                  key={`${l.id}-${i}`}
                  positions={anillo}
                  pathOptions={{
                    color: l.id === loteActivoId ? '#3b82f6' : '#ffffff',
                    weight: l.id === loteActivoId ? 3 : 2,
                    fillColor: l.id === loteActivoId ? '#3b82f6' : '#7c8da6',
                    fillOpacity: l.id === loteActivoId ? 0.12 : 0.06
                  }}
                  eventHandlers={{ click: () => { if (!herramientaActiva && !modoTendencia) seleccionarLote(l.id, false); } }}
                />
              )))}
              {puntosPoligono.length > 0 && <Polyline positions={puntosPoligono} pathOptions={{ color: '#3b82f6', weight: 3, dashArray: '6 5' }} />}
              {puntosPoligono.map((p, i) => <CircleMarker key={`d-${i}`} center={p} radius={4} pathOptions={{ color: '#fff', weight: 2, fillColor: '#3b82f6', fillOpacity: 1 }} />)}
              {puntosMedicion.length > 1 && <Polyline positions={puntosMedicion} pathOptions={{ color: '#f59e0b', weight: 3 }} />}
              {puntosMedicion.map((p, i) => <CircleMarker key={`m-${i}`} center={p} radius={5} pathOptions={{ color: '#fff', weight: 2, fillColor: '#f59e0b', fillOpacity: 1 }} />)}
              {puntoTendencia && modoTendencia && <CircleMarker center={puntoTendencia} radius={7} pathOptions={{ color: '#fff', weight: 2, fillColor: '#22c55e', fillOpacity: 1 }} />}
              {posicionPixelInfo && !modoGestion && (
                <>
                  <CircleMarker center={posicionPixelInfo} radius={7} pathOptions={{ color: '#fff', weight: 2, fillColor: '#3b82f6', fillOpacity: 1 }} />
                  <Popup key={posicionPixelInfo.join(',')} position={posicionPixelInfo}>
                    <ContenidoPixel cargando={cargandoPixel} datos={datosPixel} indice={loteActual?.modoCapa || modoViz} />
                  </Popup>
                </>
              )}
              <ControllerCentradoMapa destino={centroMapa} />
              <ManejadorEventosMapa onClick={manejarClickMapa} onContextMenu={manejarClickDerecho} />
            </MapContainer>
          </div>

          <div className="gs-map-top">
            <div className="gs-map-title">
              <div className="gs-map-title-main">{loteActual?.nombre || 'Vista general del territorio'}</div>
              <div className="gs-map-title-sub">
                {loteActual ? `${formatoHa(loteActual.superficieHa)} ha · ${modoGestion ? 'gestión de lote' : 'espacio de trabajo activo'}` : 'Seleccioná o importá un área para comenzar'}
              </div>
              {loteActual && !modoGestion && (
                <>
                  <div className="gs-capturar">
                    <button
                      className="gs-chip-btn primary"
                      onClick={capturarCapa}
                      disabled={capturando || !loteActual.tileUrl}
                      title={loteActual.tileUrl ? 'Guarda la capa visible, recortada al lote' : 'Abrí una capa sobre el lote para poder capturarla'}
                    >{capturando ? 'Capturando…' : 'Capturar capa'}</button>
                    <span className="gs-status-item">{loteActual.modoCapa ? `Capa abierta: ${loteActual.modoCapa}` : 'Sin capa abierta'}</span>
                  </div>
                </>
              )}
            </div>
            <div className="gs-map-tools">
              {!modoGestion && <button className={`gs-tool ${modoDibujar ? 'active' : ''}`} onClick={() => activarHerramienta('dibujar')}><IconDibujar /> Dibujar</button>}
              <button className={`gs-tool ${modoMedir ? 'active' : ''}`} onClick={() => activarHerramienta('medir')}><IconRegla /> Medir</button>
              {!modoGestion && <button className={`gs-tool ${modoIdentificar ? 'active' : ''}`} onClick={() => activarHerramienta('identificar')}><IconInfoPixel /> Píxel</button>}
              <button className="gs-tool" onClick={() => setMostrarMenuMapas((v) => !v)}><IconCapas size={16} /> Mapa</button>
              {mostrarMenuMapas && (
                <div className="gs-menu">
                  {Object.keys(MAPAS_BASE).map((m) => (
                    <button key={m} className={m === mapaBaseActual ? 'active' : ''} onClick={() => { setMapaBaseActual(m); setMostrarMenuMapas(false); }}>{m}</button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {modoDibujar && (
            <div className="gs-hint" role="status">
              <span>
                <strong>Dibujando lote · {puntosPoligono.length} {puntosPoligono.length === 1 ? 'punto' : 'puntos'}.</strong>{' '}
                Clic izquierdo para agregar puntos y <strong>clic derecho para cerrar el lote</strong>.
              </span>
              <span className="gs-hint-actions">
                <button className="gs-chip-btn" onClick={() => setPuntosPoligono((p) => p.slice(0, -1))} disabled={!puntosPoligono.length}>Deshacer punto</button>
                <button className="gs-chip-btn" onClick={() => activarHerramienta('dibujar')}>Cancelar (Esc)</button>
              </span>
            </div>
          )}

          {!modoGestion && loteActual?.vis?.palette && <LeyendaIndice titulo={loteActual.modoCapa} vis={loteActual.vis} />}

          <div className="gs-map-bottom">
            <div className="gs-status">
              <div className="gs-status-item">
                <span className={`gs-status-dot ${servidorOk === true ? 'ok' : servidorOk === false ? 'fail' : ''}`} />
                {servidorOk === false ? 'Sin conexión con el servidor' : servidorOk ? 'Servidor conectado' : 'Conectando…'}
              </div>
              {cargando && <div className="gs-status-item">Procesando…</div>}
              {modoMedir && (
                <>
                  <div className="gs-status-item">Distancia: <strong>{formatoDistancia(distanciaMedida)}</strong></div>
                  <button className="gs-chip-btn" onClick={() => setPuntosMedicion((p) => p.slice(0, -1))} disabled={!puntosMedicion.length}>Deshacer</button>
                  <button className="gs-chip-btn" onClick={() => setPuntosMedicion([])} disabled={!puntosMedicion.length}>Limpiar</button>
                </>
              )}
              {modoIdentificar && <div className="gs-status-item">Hacé clic en el mapa para leer el píxel</div>}
            </div>
            {!modoGestion && <div className="gs-layer-switch">
              Capa
              <select value={modoViz} onChange={(e) => cambiarCapa(e.target.value)} aria-label="Capa a visualizar">
                {capasDisponibles.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>}
          </div>
        </main>

        <aside className="gs-inspector">
          <div className="gs-inspector-head">
            <div className="gs-eyebrow">{info.eyebrow}</div>
            <div className="gs-inspector-title">{info.titulo}</div>
            <div className="gs-inspector-sub">
              {loteActual ? `Área activa: ${loteActual.nombre}` : 'Definí un espacio de trabajo para comenzar'}
            </div>
          </div>

          {seccionActiva === 'imagenes' && (
            <div className="gs-inspector-scroll">
              {!loteActual ? (
                <div className="gs-empty">
                  <strong>Comenzá con un área</strong>
                  Dibujá un polígono en el mapa o importá un archivo GeoJSON, KML/KMZ o Shapefile para buscar imágenes satelitales.
                  <div style={{ marginTop: 12 }}><button className="gs-primary" onClick={() => activarHerramienta('dibujar')}>Dibujar área</button></div>
                  <div style={{ marginTop: 7 }}><button className="gs-secondary" style={{ width: '100%' }} onClick={() => fileInputRef.current?.click()}>Importar archivo</button></div>
                </div>
              ) : (
                <>
                  <div className="gs-section">
                    <div className="gs-section-head"><span className="gs-section-title">Criterios de búsqueda</span><span className="gs-pill">{nubosidadMax}% nubes</span></div>
                    <div className="gs-grid2">
                      <div className="gs-field"><label htmlFor="f-desde">DESDE</label><input id="f-desde" className="gs-input" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} /></div>
                      <div className="gs-field"><label htmlFor="f-hasta">HASTA</label><input id="f-hasta" className="gs-input" type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} /></div>
                    </div>
                    <div className="gs-field">
                      <label htmlFor="f-nubes">NUBOSIDAD MÁXIMA</label>
                      <div className="gs-slider-row"><input id="f-nubes" type="range" min="0" max="100" value={nubosidadMax} onChange={(e) => setNubosidadMax(Number(e.target.value))} /><span className="gs-pill">{nubosidadMax}%</span></div>
                    </div>
                    <div className="gs-field">
                      <label>SENSORES</label>
                      {ESTRUCTURA_SENSORES.map((fam) => (
                        <div className="gs-sensor-group" key={fam.familia}>
                          <span className="gs-sensor-fam">{fam.familia}</span>
                          {fam.sensores.map((s) => (
                            <button key={s.id} type="button" aria-pressed={sensoresActivos.includes(s.id)} className={`gs-toggle ${sensoresActivos.includes(s.id) ? 'on' : ''}`} onClick={() => toggleSensor(s.id)}>{s.nombre}</button>
                          ))}
                        </div>
                      ))}
                    </div>
                    <label className="gs-check"><input type="checkbox" checked={enmascararNubes} onChange={(e) => setEnmascararNubes(e.target.checked)} /> Enmascarar nubes en el análisis</label>
                  </div>

                  <button className="gs-primary" onClick={buscarEscenas} disabled={cargando}>{cargando ? 'Procesando…' : 'Buscar escenas disponibles'}</button>

                  {escenaActual && (
                    <div className="gs-result">
                      <div className="gs-section-head" style={{ marginBottom: 0 }}>
                        <span className="gs-section-title">Exportar capa activa ({loteActual.modoCapa})</span>
                      </div>
                      <div className="gs-btn-row">
                        <button className="gs-secondary" onClick={() => descargarRaster('geotiff')} disabled={exportando}>GeoTIFF</button>
                        <button className="gs-secondary" onClick={() => descargarRaster('png')} disabled={exportando}>PNG</button>
                      </div>
                      <div className="gs-note">Recortada al polígono del área activa.</div>
                    </div>
                  )}

                  <div className="gs-section" style={{ marginTop: 18 }}>
                    <div className="gs-section-head"><span className="gs-section-title">Resultados</span><span className="gs-section-note">{loteActual.escenas.length} escenas</span></div>
                    {loteActual.escenas.length === 0 ? (
                      <div className="gs-empty">
                        <strong>{loteActual.buscada ? 'Sin escenas para esos filtros' : 'No hay escenas cargadas'}</strong>
                        {loteActual.buscada ? 'Probá ampliando las fechas, la nubosidad o los sensores.' : 'Ejecutá una búsqueda para consultar el catálogo satelital.'}
                      </div>
                    ) : loteActual.escenas.map((e) => {
                      const activa = escenaActual?.id === e.id;
                      return (
                        <div key={e.id} className={`gs-scene ${activa ? 'active' : ''}`} onClick={() => seleccionarEscena(e)}>
                          <div className="gs-scene-top">
                            <div className="gs-scene-thumb">
                              <img src={e.thumb || placeholderSvg(`${familiaDe(e)} · ${e.fecha || ''}`)} alt="" loading="lazy" />
                            </div>
                            <div className="gs-scene-info">
                              <div className="gs-scene-date">{e.fecha || 'Fecha no disponible'}</div>
                              <div className="gs-scene-sat">{e.satelite || familiaDe(e)}</div>
                              <div className="gs-scene-meta">
                                <span className="gs-scene-chip">Nubes {e.nubosidad ?? '—'}%</span>
                                {e.tile && <span className="gs-scene-chip">{e.tile}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="gs-scene-footer">
                            <span className="gs-scene-status">{activa ? '✓ Visualización activa' : 'Seleccionar escena'}</span>
                            <button
                              className="gs-link"
                              disabled={familiaDe(e) === 'Landsat'}
                              title={familiaDe(e) === 'Landsat' ? 'La descarga de Landsat todavía no está disponible' : undefined}
                              onClick={(ev) => abrirModalDescargaEscena(e, ev)}
                            >Descargar</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="gs-section">
                    <div className="gs-section-head"><span className="gs-section-title">Terreno · DEM SRTM</span><span className="gs-section-note">30 m</span></div>
                    <div className={`gs-scene ${escenaActual?.esDem ? 'active' : ''}`} onClick={() => seleccionarEscena(ESCENA_SRTM, 'Elevación')}>
                      <div className="gs-scene-top">
                        <div className="gs-scene-thumb"><img src={placeholderSvg('SRTM · DEM')} alt="" /></div>
                        <div className="gs-scene-info">
                          <div className="gs-scene-date">Modelo digital de elevación</div>
                          <div className="gs-scene-sat">SRTM · NASA/USGS · 30 m</div>
                          <div className="gs-scene-meta">
                            <span className="gs-scene-chip">Elevación</span>
                            <span className="gs-scene-chip">Pendiente</span>
                            <span className="gs-scene-chip">Relieve</span>
                          </div>
                        </div>
                      </div>
                      <div className="gs-scene-footer">
                        <span className="gs-scene-status">{escenaActual?.esDem ? '✓ Visualización activa' : 'Ver sobre el lote'}</span>
                        <span style={{ display: 'flex', gap: 10 }}>
                          {['geotiff', 'png'].map((f) => (
                            <button
                              key={f}
                              className="gs-link"
                              disabled={exportando}
                              onClick={(ev) => { ev.stopPropagation(); descargarRaster(f, { escenaId: SRTM_ID, modo: escenaActual?.esDem ? loteActual.modoCapa : 'Elevación' }); }}
                            >{f === 'geotiff' ? 'GeoTIFF' : 'PNG'}</button>
                          ))}
                        </span>
                      </div>
                    </div>
                    <div className="gs-note">Se visualiza completo; al descargar o capturar se recorta al límite del lote.</div>
                  </div>
                </>
              )}
            </div>
          )}

          {seccionActiva === 'lote' && (
            <div className="gs-inspector-scroll">
              {!loteActual ? (
                <div className="gs-empty"><strong>Seleccioná un lote</strong>Dibujá o importá un área para gestionar sus capas.</div>
              ) : (
                <>
                  <div className="gs-section">
                    <div className="gs-section-head"><span className="gs-section-title">Datos del lote</span></div>
                    <div className="gs-field"><label htmlFor="l-nombre">NOMBRE</label>
                      <input id="l-nombre" className="gs-input" value={loteActual.nombre} onChange={(e) => actualizarLote(loteActual.id, { nombre: e.target.value })} />
                    </div>
                    <div className="gs-kpis">
                      <div className="gs-kpi"><div className="gs-kpi-label">Superficie</div><div className="gs-kpi-value">{formatoHa(loteActual.superficieHa)} <small>ha</small></div></div>
                      <div className="gs-kpi"><div className="gs-kpi-label">Origen</div><div className="gs-kpi-value" style={{ fontSize: 12 }}>{loteActual.origen}</div></div>
                    </div>
                  </div>

                  <div className="gs-section">
                    <div className="gs-section-head">
                      <span className="gs-section-title">Capas capturadas</span>
                      <span className="gs-section-note">{capasLote.length} en el lote</span>
                    </div>
                    {capasLote.length === 0 ? (
                      <div className="gs-empty"><strong>Todavía no capturaste capas</strong>Abrí una capa sobre el lote en “Explorar imágenes” y usá “Capturar capa”.</div>
                    ) : (
                      <>
                        {capasLote.map((c) => (
                          <FilaCapa
                            key={c.id} capa={c} activa={capaAnalisisId === c.id}
                            onSelect={() => seleccionarCapaAnalisis(c)} onQuitar={() => quitarCapa(c.id)}
                            onDescargar={(f) => descargarRaster(f, { escenaId: c.escenaId, modo: c.modo })}
                          />
                        ))}
                        <div className="gs-note">Elegí una capa para ver sus medidas y habilitar los análisis. Para mostrarlas u ocultarlas en el mapa usá las casillas del panel izquierdo, bajo “Gestión de lote”. Las vistas caducan tras unas horas; el GeoTIFF se regenera al descargar.</div>
                      </>
                    )}
                  </div>

                  {capaAnalisis && (
                    <div className="gs-section">
                      <div className="gs-section-head"><span className="gs-section-title">Análisis · {capaAnalisis.nombre}</span></div>
                      {capaAnalisis.stats ? (
                        <div className="gs-result" style={{ marginTop: 0 }}>
                          <div className="gs-result-title">Medidas resumen del lote</div>
                          <div className="gs-kpis" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 8 }}>
                            <div className="gs-kpi"><div className="gs-kpi-label">Media</div><div className="gs-kpi-value">{capaAnalisis.stats.media}</div></div>
                            <div className="gs-kpi"><div className="gs-kpi-label">Mínimo</div><div className="gs-kpi-value">{capaAnalisis.stats.min}</div></div>
                            <div className="gs-kpi"><div className="gs-kpi-label">Máximo</div><div className="gs-kpi-value">{capaAnalisis.stats.max}</div></div>
                          </div>
                        </div>
                      ) : (
                        <div className="gs-note">Esta capa es una composición de bandas: no tiene medidas numéricas.</div>
                      )}

                      {INDICES.includes(capaAnalisis.modo) ? (
                        <div className="gs-result">
                          <div className="gs-result-title">Curva de evolución del {capaAnalisis.modo}</div>
                          <div className="gs-note" style={{ marginBottom: 8 }}>Media del lote en cada pasada del período. La línea verde marca la fecha de la capa ({capaAnalisis.fecha}).</div>
                          <div className="gs-grid2">
                            <div className="gs-field"><label htmlFor="c-desde">DESDE</label><input id="c-desde" className="gs-input" type="date" value={curvaDesde} onChange={(e) => setCurvaDesde(e.target.value)} /></div>
                            <div className="gs-field"><label htmlFor="c-hasta">HASTA</label><input id="c-hasta" className="gs-input" type="date" value={curvaHasta} onChange={(e) => setCurvaHasta(e.target.value)} /></div>
                          </div>
                          <button className="gs-primary" onClick={calcularCurvaLote} disabled={cargandoCurva}>{cargandoCurva ? 'Calculando…' : 'Calcular curva de evolución'}</button>
                          {curvaLote?.capaId === capaAnalisis.id && (
                            <div style={{ marginTop: 12 }}><GraficoSerie puntos={curvaLote.puntos} indice={capaAnalisis.modo} marca={capaAnalisis.fecha} /></div>
                          )}
                          <div className="gs-note">Usa los sensores y la nubosidad máxima definidos en “Explorar imágenes”.</div>
                        </div>
                      ) : (
                        <div className="gs-note">Para esta capa no hay análisis temporales disponibles por ahora.</div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {seccionActiva === 'zonas' && (
            <div className="gs-inspector-scroll">
              {!loteActual ? (
                <div className="gs-empty"><strong>Seleccioná un área</strong>Las zonas de manejo se calculan dentro del polígono activo.</div>
              ) : (
                <>
                  <div className="gs-section">
                    <div className="gs-section-head"><span className="gs-section-title">Configuración del análisis</span></div>
                    <div className="gs-field"><label htmlFor="z-indice">ÍNDICE</label>
                      <select id="z-indice" className="gs-select" value={indiceAmbientacion} onChange={(e) => setIndiceAmbientacion(e.target.value)}>
                        {INDICES.map((i) => <option key={i}>{i}</option>)}
                      </select>
                    </div>
                    <div className="gs-grid2">
                      <div className="gs-field"><label htmlFor="z-clases">CLASES</label>
                        <select id="z-clases" className="gs-select" value={clasesAmbientacion} onChange={(e) => setClasesAmbientacion(Number(e.target.value))}>
                          {[2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                      <div className="gs-field"><label htmlFor="z-metodo">MÉTODO</label>
                        <select id="z-metodo" className="gs-select" value={metodoZonas} onChange={(e) => setMetodoZonas(e.target.value)}>
                          <option value="cuantiles">Cuantiles</option>
                          <option value="intervalos">Intervalos</option>
                        </select>
                      </div>
                    </div>
                    <div className="gs-field"><label htmlFor="z-sup">SUPERFICIE MÍNIMA (m²)</label>
                      <input id="z-sup" className="gs-input" type="number" min="0" value={superficieMinM2} onChange={(e) => setSuperficieMinM2(e.target.value)} />
                    </div>
                    {!escenaActual && <div className="gs-note">Primero elegí una escena en “Explorar imágenes”.</div>}
                  </div>
                  <button className="gs-primary" onClick={ejecutarAmbientacion} disabled={cargando}>{cargando ? 'Procesando zonas…' : 'Generar zonas de manejo'}</button>

                  {ambientacion && (
                    <div className="gs-result">
                      <div className="gs-section-head"><span className="gs-section-title">Resultado · {ambientacion.indice}</span><span className="gs-pill ok">Listo</span></div>
                      <div className="gs-kpis">
                        <div className="gs-kpi"><div className="gs-kpi-label">Superficie</div><div className="gs-kpi-value">{formatoHa(ambientacion.areaTotalHa)} <small>ha</small></div></div>
                        <div className="gs-kpi"><div className="gs-kpi-label">Zonas</div><div className="gs-kpi-value">{ambientacion.zonas.length}</div></div>
                      </div>
                      <div style={{ marginTop: 10 }}>
                        {ambientacion.zonas.map((z) => (
                          <div className="gs-zona" key={z.zona}>
                            <span className="gs-zona-sw" style={{ background: z.color }} />
                            <span>{z.etiqueta} <span className="gs-zona-rango">{z.rango}</span></span>
                            <span>{formatoHa(z.ha)} ha</span>
                            <strong>{z.porcentaje}%</strong>
                          </div>
                        ))}
                      </div>
                      {ambientacion.areaSinDatoHa > 0 && <div className="gs-note">Sin dato (nubes o sombras): {formatoHa(ambientacion.areaSinDatoHa)} ha</div>}
                      <div className="gs-field" style={{ marginTop: 12, marginBottom: 0 }}>
                        <label htmlFor="z-opac">OPACIDAD DE LA CAPA</label>
                        <div className="gs-slider-row"><input id="z-opac" type="range" min="10" max="100" value={opacidadAmbientacion} onChange={(e) => setOpacidadAmbientacion(Number(e.target.value))} /><span className="gs-pill">{opacidadAmbientacion}%</span></div>
                      </div>
                      <div className="gs-btn-row">
                        {['geojson', 'shp', 'gpkg'].map((f) => (
                          <button key={f} className="gs-secondary" onClick={() => descargarVectorZonas(f)} disabled={exportando}>{f.toUpperCase()}</button>
                        ))}
                      </div>
                      <div className="gs-btn-row"><button className="gs-secondary" onClick={restablecerAmbientacion}>Restablecer</button></div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {seccionActiva === 'tendencia' && (
            <div className="gs-inspector-scroll">
              <div className="gs-section">
                <div className="gs-section-head"><span className="gs-section-title">Serie temporal</span><span className="gs-section-note">clic sobre el mapa</span></div>
                <div className="gs-field"><label htmlFor="t-indice">ÍNDICE</label>
                  <select id="t-indice" className="gs-select" value={indiceTendencia} onChange={(e) => cambiarIndiceTendencia(e.target.value)}>
                    {INDICES.map((i) => <option key={i}>{i}</option>)}
                  </select>
                </div>
                <div className="gs-grid2">
                  <div className="gs-field"><label htmlFor="t-desde">DESDE</label><input id="t-desde" className="gs-input" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} /></div>
                  <div className="gs-field"><label htmlFor="t-hasta">HASTA</label><input id="t-hasta" className="gs-input" type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} /></div>
                </div>
                <div className="gs-check"><span style={{ color: 'var(--green)' }}>●</span>{puntoTendencia ? `Punto: ${puntoTendencia[0].toFixed(4)}, ${puntoTendencia[1].toFixed(4)}` : 'Hacé clic en el mapa para elegir un punto'}</div>
                {!modoTendencia && <div className="gs-note">Hay otra herramienta activa; desactivala para elegir un punto.</div>}
              </div>
              {cargandoSerie ? (
                <div className="gs-empty"><strong>Calculando…</strong>Consultando las pasadas disponibles.</div>
              ) : !serieTendencia ? (
                <div className="gs-empty"><strong>Sin serie temporal</strong>Hacé clic en un punto del mapa para consultar la evolución del índice.</div>
              ) : (
                <div className="gs-result"><GraficoSerie puntos={serieTendencia} indice={indiceTendencia} /></div>
              )}
            </div>
          )}

          {seccionActiva === 'areas' && (
            <div className="gs-inspector-scroll">
              <div className="gs-section">
                <div className="gs-section-head"><span className="gs-section-title">Espacios de trabajo</span><span className="gs-section-note">{lotes.length} total</span></div>
                {lotes.length === 0 ? (
                  <div className="gs-empty"><strong>No hay áreas</strong>Importá un archivo o dibujá un polígono directamente sobre el mapa.</div>
                ) : lotes.map((l) => (
                  <div key={l.id} className={`gs-area ${l.id === loteActivoId ? 'active' : ''}`} onClick={() => seleccionarLote(l.id)}>
                    <div className="gs-area-row">
                      <div className="gs-area-icon"><IconAreas /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="gs-area-name">{l.nombre}</div>
                        <div className="gs-area-meta">{formatoHa(l.superficieHa)} ha · {l.origen}</div>
                      </div>
                      <button className="gs-icon-btn" onClick={(e) => eliminarLote(l.id, e)} aria-label={`Quitar ${l.nombre}`}>×</button>
                    </div>
                  </div>
                ))}
              </div>
              <button className="gs-secondary" style={{ width: '100%' }} onClick={() => activarHerramienta('dibujar')}>＋ Nueva área en el mapa</button>
            </div>
          )}

          {seccionActiva === 'descargas' && (
            <div className="gs-inspector-scroll">
              <div className="gs-section-head"><span className="gs-section-title">Productos solicitados</span><span className="gs-section-note">{descargas.length}</span></div>
              {descargas.length === 0 ? (
                <div className="gs-empty"><strong>No hay descargas</strong>Los productos que solicites desde una escena aparecerán aquí.</div>
              ) : descargas.map((d) => (
                <div className="gs-result" key={d.job_id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <strong style={{ fontSize: 11 }}>{d.satelite || 'Producto satelital'} · {d.fecha || ''}</strong>
                    <span className={`gs-pill ${d.estado === 'listo' ? 'ok' : d.estado === 'error' ? 'error' : ESTADOS_ACTIVOS.includes(d.estado) ? 'activo' : ''}`}>{ETIQUETA_ESTADO[d.estado] || d.estado}</span>
                  </div>
                  <div className="gs-note" style={{ marginTop: 4 }}>
                    {d.tipo === 'bandas' ? `Bandas: ${d.bandas.join(', ')}` : 'Producto completo'}{d.lote ? ` · ${d.lote}` : ''}
                  </div>
                  {ESTADOS_ACTIVOS.includes(d.estado) && (
                    <>
                      <div className="gs-progress"><div style={{ width: `${d.progreso}%` }} /></div>
                      <div className="gs-note">{d.mb_total ? `${d.mb} / ${d.mb_total} MB (${d.progreso}%)` : `${d.mb} MB`}</div>
                    </>
                  )}
                  {d.estado === 'error' && <div className="gs-note error">{d.error}</div>}
                  {d.estado === 'expirada' && <div className="gs-note">El archivo ya no está disponible. Volvé a pedir la descarga.</div>}
                  <div className="gs-btn-row" style={{ justifyContent: 'flex-end', alignItems: 'center' }}>
                    {d.estado === 'listo' && (
                      <a className="gs-secondary" style={{ flex: 'none', height: 30 }} href={`${API_BASE_URL}/descargas/${d.job_id}/archivo`} rel="noreferrer">Guardar ZIP ({d.mb} MB)</a>
                    )}
                    <button className="gs-link muted" style={{ flex: 'none' }} onClick={() => quitarDescarga(d.job_id)}>Quitar</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {seccionActiva === 'ia' && (
            <div className="gs-inspector-scroll">
              <div className="gs-result info" style={{ marginTop: 0, marginBottom: 12 }}>
                <div className="gs-result-title" style={{ color: 'var(--accent-text)' }}>Análisis inteligente</div>
                <div className="gs-result-text">Próximamente: análisis agronómicos y decisiones espaciales construidos sobre las capas e índices disponibles.</div>
              </div>
              {[
                ['Detección de cambios', 'Compará dos fechas'],
                ['Clasificación de cobertura', 'Interpretá patrones del territorio'],
                ['Priorización de anomalías', 'Detectá sectores que requieren atención']
              ].map(([titulo, desc]) => (
                <div className="gs-area static" key={titulo} style={{ opacity: 0.6 }}>
                  <div className="gs-area-row">
                    <div className="gs-area-icon">✦</div>
                    <div><div className="gs-area-name">{titulo}</div><div className="gs-area-meta">{desc}</div></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {modalDescargaAbierto && escenaModal && (
        <div className="gs-modal-backdrop" onClick={cerrarModalDescarga}>
          <div className="gs-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="gs-modal-head">
              <div><div className="gs-eyebrow">Producto satelital</div><div className="gs-modal-title">Preparar descarga</div></div>
              <button className="gs-icon-btn" onClick={cerrarModalDescarga} aria-label="Cerrar">×</button>
            </div>
            <div className="gs-modal-body">
              <div className="gs-result" style={{ marginTop: 0, marginBottom: 14 }}>
                <strong style={{ fontSize: 12 }}>{escenaModal.fecha || 'Escena'}</strong>
                <div className="gs-note" style={{ marginTop: 3 }}>{escenaModal.satelite || familiaDe(escenaModal)}</div>
              </div>
              {[
                ['completa', 'Producto completo', 'Todas las bandas, máscaras y metadatos publicados por el proveedor.'],
                ['bandas', 'Solo bandas seleccionadas', 'Generá un producto más liviano con únicamente las bandas necesarias.']
              ].map(([v, t, d]) => (
                <label key={v} className={`gs-radio ${tipoDescarga === v ? 'selected' : ''}`}>
                  <input type="radio" name="tipoDescarga" checked={tipoDescarga === v} onChange={() => setTipoDescarga(v)} />
                  <div><div className="gs-radio-title">{t}</div><div className="gs-radio-desc">{d}</div></div>
                </label>
              ))}
              {tipoDescarga === 'bandas' && (
                <div className="gs-result">
                  <div className="gs-section-head">
                    <span className="gs-section-title">Bandas</span>
                    <span>
                      <button className="gs-link" onClick={() => setBandasSeleccionadas(BANDAS_S2.map((b) => b.id))}>Todas</button>{' '}
                      <button className="gs-link muted" onClick={() => setBandasSeleccionadas([])}>Ninguna</button>
                    </span>
                  </div>
                  <div className="gs-bandas">
                    {BANDAS_S2.map((b) => (
                      <label key={b.id} className="gs-check"><input type="checkbox" checked={bandasSeleccionadas.includes(b.id)} onChange={() => toggleBandaModal(b.id)} />{b.nombre}</label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="gs-modal-foot">
              <button className="gs-secondary" onClick={cerrarModalDescarga}>Cancelar</button>
              <button className="gs-primary" disabled={iniciandoDescarga || familiaDe(escenaModal) === 'Landsat'} onClick={iniciarDescargaEscena}>{iniciandoDescarga ? 'Preparando…' : 'Preparar descarga'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
