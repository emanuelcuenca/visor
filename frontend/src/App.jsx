import React, { useState, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, useMapEvents, useMap, Polygon, Polyline, CircleMarker, Popup } from 'react-leaflet';
import axios from 'axios';
import shp from 'shpjs';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const API_BASE_URL = import.meta.env?.VITE_API_URL ?? 'http://127.0.0.1:8000/api';

const MAPAS_BASE = {
  "Google Satélite": "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
  "Google Híbrido": "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
  "Google Calles": "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
  "Google Relieve": "https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}"
};

const CAPAS_CAROUSEL = [
  { id: "NDVI", nombre: "NDVI", esIndice: true, min: "-1.0", max: "1.0", categoria: "AGRICULTURA", thumbLocal: "/indices/ndvi.jpg" },
  { id: "Infrarrojo Color", nombre: "Infrarrojo Color", esIndice: false, categoria: "AGRICULTURA", thumbLocal: "/indices/infrarrojo.jpg" },
  { id: "Agricultura", nombre: "Agricultura SWIR", esIndice: false, categoria: "AGRICULTURA", thumbLocal: "/indices/agricultura.jpg" },
  { id: "Tierra/Agua", nombre: "Tierra/Agua", esIndice: false, categoria: "TODAS LAS CAPAS", thumbLocal: "/indices/tierra_agua.jpg" },
  { id: "NDWI", nombre: "NDWI", esIndice: true, min: "-1.0", max: "1.0", categoria: "TODAS LAS CAPAS", thumbLocal: "/indices/ndwi.jpg" },
  { id: "SAVI", nombre: "SAVI", esIndice: true, min: "-1.0", max: "1.0", categoria: "SILVICULTURA", thumbLocal: "/indices/savi.jpg" },
  { id: "NBR", nombre: "NBR", esIndice: true, min: "-1.0", max: "1.0", categoria: "SILVICULTURA", thumbLocal: "/indices/nbr.jpg" },
  { id: "RGB Clásico", nombre: "RGB Clásico", esIndice: false, categoria: "TODAS LAS CAPAS", thumbLocal: "/indices/rgb.jpg" }
];

const BANDAS_DISPONIBLES = {
  "Sentinel-2": [
    { id: "B02", nombre: "B02 - Azul (10m)" },
    { id: "B03", nombre: "B03 - Verde (10m)" },
    { id: "B04", nombre: "B04 - Rojo (10m)" },
    { id: "B08", nombre: "B08 - NIR Infrarrojo Cercano (10m)" },
    { id: "B05", nombre: "B05 - Red Edge 1 (20m)" },
    { id: "B06", nombre: "B06 - Red Edge 2 (20m)" },
    { id: "B07", nombre: "B07 - Red Edge 3 (20m)" },
    { id: "B8A", nombre: "B8A - NIR Estrecho (20m)" },
    { id: "B11", nombre: "B11 - SWIR 1 (20m)" },
    { id: "B12", nombre: "B12 - SWIR 2 (20m)" }
  ],
  "Landsat": [
    { id: "B1", nombre: "B1 - Aerosol Costero (30m)" },
    { id: "B2", nombre: "B2 - Azul (30m)" },
    { id: "B3", nombre: "B3 - Verde (30m)" },
    { id: "B4", nombre: "B4 - Rojo (30m)" },
    { id: "B5", nombre: "B5 - NIR (30m)" },
    { id: "B6", nombre: "B6 - SWIR 1 (30m)" },
    { id: "B7", nombre: "B7 - SWIR 2 (30m)" },
    { id: "B10", nombre: "B10 - Térmico TIRS 1 (100m)" }
  ]
};

const ESTRUCTURA_SENSORES = [
  {
    familia: "Sentinel-2",
    subtildes: [
      { id: "S2A_L2A", nombre: "Sentinel-2A L2A" },
      { id: "S2B_L2A", nombre: "Sentinel-2B L2A" }
    ]
  },
  {
    familia: "Landsat",
    subtildes: [
      { id: "L9_T1", nombre: "Landsat 9" },
      { id: "L8_T1", nombre: "Landsat 8" }
    ]
  }
];

const COLOR = {
  bg: '#0c0f14',
  dock: '#090c10',
  panel: '#121720',
  panelAlt: '#0e1218',
  cardBg: '#18202c',
  cardActiveBg: '#1f2b3c',
  border: '#232d3f',
  borderSoft: '#1a2230',
  text: '#f3f4f6',
  textDim: '#8b95a5',
  textFaint: '#505b6e',
  accent: '#2563eb',
  green: '#16a34a',
  radius: '3px'
};

// Tarjetas de escena: mucho más oscuras, cercanas al fondo del sitio
const CARD_BG = '#0a0d12';
const CARD_ACTIVA = '#111823';
const CARD_HOVER = '#0f141b';

const IconLogo = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="2" y1="12" x2="22" y2="12"></line>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10z"></path>
  </svg>
);

const IconImagenes = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <circle cx="8.5" cy="8.5" r="1.5"></circle>
    <polyline points="21 15 16 10 5 21"></polyline>
  </svg>
);

const IconZonas = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
    <polyline points="2 17 12 22 22 17"></polyline>
    <polyline points="2 12 12 17 22 12"></polyline>
  </svg>
);

const IconTendencia = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
    <polyline points="17 6 23 6 23 12"></polyline>
  </svg>
);

const IconComparar = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="18" rx="2"></rect>
    <line x1="12" y1="3" x2="12" y2="21"></line>
  </svg>
);

const IconDescargas = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
);

const IconAreas = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon>
    <line x1="8" y1="2" x2="8" y2="18"></line>
    <line x1="16" y1="6" x2="16" y2="22"></line>
  </svg>
);

const IconIA = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
  </svg>
);

const IconDibujar = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

const IconCalendarioEscena = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <line x1="16" y1="2.5" x2="16" y2="6" />
    <line x1="8" y1="2.5" x2="8" y2="6" />
    <line x1="3" y1="9" x2="21" y2="9" />
  </svg>
);

const IconSolEscena = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f4c542" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" fill="#f4c542" stroke="none" />
    <line x1="12" y1="1.5" x2="12" y2="4" />
    <line x1="12" y1="20" x2="12" y2="22.5" />
    <line x1="1.5" y1="12" x2="4" y2="12" />
    <line x1="20" y1="12" x2="22.5" y2="12" />
    <line x1="4.6" y1="4.6" x2="6.4" y2="6.4" />
    <line x1="17.6" y1="17.6" x2="19.4" y2="19.4" />
    <line x1="17.6" y1="6.4" x2="19.4" y2="4.6" />
    <line x1="4.6" y1="19.4" x2="6.4" y2="17.6" />
  </svg>
);

// Ícono que cambia según el porcentaje de nubosidad de la escena
const IconNubosidadEscena = ({ pct }) => {
  const n = Number(pct) || 0;
  if (n < 10) return <IconSolEscena />;
  const nube = 'M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z';
  const sol = (cx, cy, r) => <circle cx={cx} cy={cy} r={r} fill="#f4c542" />;
  const props = { width: 14, height: 14, viewBox: '0 0 24 24', 'aria-hidden': true };
  if (n < 35) {
    return (
      <svg {...props}>
        {sol(9, 9, 5)}
        <g transform="translate(8 9) scale(0.6)"><path d={nube} fill="#aab4c3" stroke="#0a0d12" strokeWidth="1.5" /></g>
      </svg>
    );
  }
  if (n < 75) {
    return (
      <svg {...props}>
        {sol(8, 8, 4.5)}
        <g transform="translate(4 6) scale(0.78)"><path d={nube} fill="#aab4c3" stroke="#0a0d12" strokeWidth="1.5" /></g>
      </svg>
    );
  }
  return (
    <svg {...props}>
      <path d={nube} fill="#7d889a" stroke="#4a5568" strokeWidth="1" transform="translate(1 2) scale(0.9)" />
    </svg>
  );
};

const IconInfoPixel = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

const IconRegla = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0l12.6 12.6z" />
  </svg>
);

const IconCapasMapa = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);

const obtenerFechasDefecto = () => {
  const hoy = new Date();
  const haceSeisMeses = new Date();
  haceSeisMeses.setMonth(hoy.getMonth() - 6);
  const formatoFecha = (d) => d.toISOString().split('T')[0];
  return { inicio: formatoFecha(haceSeisMeses), fin: formatoFecha(hoy) };
};

// ---------- Geometría ----------
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
  return (m2 / 10000).toFixed(1);
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

const quitarZ = (c) => (typeof c[0] === 'number' ? [c[0], c[1]] : c.map(quitarZ));

const distanciaTotalM = (pts) =>
  pts.reduce((acc, p, i) => (i === 0 ? 0 : acc + L.latLng(pts[i - 1]).distanceTo(L.latLng(p))), 0);

const formatoDistancia = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);

const familiaDe = (escena) =>
  escena?.satelite && escena.satelite.toLowerCase().includes('landsat') ? 'Landsat' : 'Sentinel-2';

const colorPaleta = (c) => (c.startsWith('#') ? c : `#${c}`);

const placeholderSvg = (texto) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='100' height='70'><rect width='100' height='70' fill='#11151c'/><text x='50' y='38' fill='#8b95a5' font-size='10' text-anchor='middle' font-family='sans-serif'>${texto}</text></svg>`
  );

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

// Filas de información extra de una escena (para la ventana de "Más info")
const detallesEscena = (e) => {
  const hora = e.hora || e.datetime || e.fecha_hora;
  const res = e.resolucion ?? e.resolution;
  const elev = e.elevacion_solar ?? e.elevacionSolar ?? e.sun_elevation ?? e.sunElevation;
  const filas = [
    ['Nubosidad', e.nubosidad != null ? `${e.nubosidad}%` : null],
    ['Elevación solar', elev != null && elev !== '' ? `${elev}°` : null],
    ['ID de tesela', e.tile || e.id_tesela || e.idTesela || e.mgrs_tile],
    ['Captura', hora ? `${hora}${String(hora).includes('UTC') ? '' : ' UTC'}` : null],
    ['Órbita', e.orbita || e.relative_orbit || e.relativeOrbit],
    ['Resolución', res ? `${res}${/^\d+(\.\d+)?$/.test(String(res)) ? ' m' : ''}` : null],
    ['Procesamiento', e.nivel_procesamiento || e.processing_level || e.product_level],
    ['Plataforma', e.plataforma || e.platform],
  ];
  return filas.filter(([, v]) => v !== null && v !== undefined && v !== '');
};

// ---------- Componentes de mapa ----------
function ManejadorEventosMapa({ onClick }) {
  useMapEvents({ click: (e) => onClick(e.latlng) });
  return null;
}

function ControlZoomLeaflet({ mapRef }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', borderRadius: COLOR.radius, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.5)', border: `1px solid ${COLOR.border}` }}>
      <button onClick={() => mapRef.current?.zoomIn()} style={{ width: '32px', height: '32px', backgroundColor: COLOR.panel, border: 'none', color: COLOR.text, cursor: 'pointer', fontSize: '1rem' }}>+</button>
      <div style={{ height: '1px', backgroundColor: COLOR.border }} />
      <button onClick={() => mapRef.current?.zoomOut()} style={{ width: '32px', height: '32px', backgroundColor: COLOR.panel, border: 'none', color: COLOR.text, cursor: 'pointer', fontSize: '1rem' }}>-</button>
    </div>
  );
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

function LeyendaIndice({ titulo, vis, bottom }) {
  if (!vis?.palette) return null;
  const degradado = `linear-gradient(to right, ${vis.palette.map(colorPaleta).join(', ')})`;
  return (
    <div style={{ position: 'absolute', left: '16px', bottom, zIndex: 1000, width: '190px', backgroundColor: 'rgba(18, 23, 32, 0.92)', border: `1px solid ${COLOR.border}`, borderRadius: COLOR.radius, padding: '6px 8px', transition: 'bottom 0.25s ease' }}>
      <div style={{ fontSize: '11px', fontWeight: '600', color: COLOR.text, marginBottom: '4px' }}>{titulo}</div>
      <div style={{ height: '8px', borderRadius: '2px', background: degradado }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: COLOR.textDim, marginTop: '2px' }}>
        <span>{vis.min}</span>
        <span>{vis.max}</span>
      </div>
    </div>
  );
}

function GraficoSerie({ puntos, indice }) {
  if (!puntos?.length) {
    return <div style={{ fontSize: '11px', color: COLOR.textDim, padding: '10px 0' }}>No hay datos válidos en el período (nubes o sin pasadas del satélite). Amplía las fechas o los sensores.</div>;
  }
  const W = 278, H = 160, m = { l: 34, r: 8, t: 8, b: 22 };
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
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label={`Serie temporal de ${indice}`}>
      {marcas.map((v) => (
        <g key={v}>
          <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke={COLOR.borderSoft} />
          <text x={m.l - 4} y={y(v) + 3} fill={COLOR.textDim} fontSize="9" textAnchor="end">{v.toFixed(2)}</text>
        </g>
      ))}
      <path d={linea} fill="none" stroke={COLOR.textFaint} strokeWidth="1.25" />
      {puntos.map((p, i) => (
        <circle key={`${p.fecha}_${p.sat}`} cx={x(tiempos[i])} cy={y(p.valor)} r="3" fill={p.sat === 'Landsat' ? '#f59e0b' : COLOR.accent}>
          <title>{`${p.fecha} · ${p.sat}: ${p.valor}`}</title>
        </circle>
      ))}
      <text x={m.l} y={H - 6} fill={COLOR.textDim} fontSize="9">{corta(puntos[0].fecha)}</text>
      <text x={W - m.r} y={H - 6} fill={COLOR.textDim} fontSize="9" textAnchor="end">{corta(puntos[puntos.length - 1].fecha)}</text>
    </svg>
  );
}

// ---------- App ----------
export default function App() {
  const fileInputRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const peticionEscenaRef = useRef(0);
  const toastTimerRef = useRef(null);
  const fechasDefecto = obtenerFechasDefecto();

  const [dockExpanded, setDockExpanded] = useState(false);
  const [seccionActiva, setSeccionActiva] = useState('imagenes');

  const [lotes, setLotes] = useState([]);
  const [loteActivoId, setLoteActivoId] = useState(null);

  const [modoViz, setModoViz] = useState("RGB Clásico");
  const [pestañaCapa, setPestañaCapa] = useState("TODAS LAS CAPAS");
  const [cargando, setCargando] = useState(false);
  const [descargandoRaster, setDescargandoRaster] = useState(false);
  const [mapaBaseActual, setMapaBaseActual] = useState("Google Satélite");

  const [inputBusqueda, setInputBusqueda] = useState("");
  const [centroMapa, setCentroMapa] = useState(null);
  const [panelDesplegado, setPanelDesplegado] = useState(true);

  const [fechaInicio, setFechaInicio] = useState(fechasDefecto.inicio);
  const [fechaFin, setFechaFin] = useState(fechasDefecto.fin);
  const [nubosidadMax, setNubosidadMax] = useState(20);
  const [subtildesActivas, setSubtildesActivas] = useState(["S2A_L2A", "S2B_L2A", "L8_T1", "L9_T1"]);
  const [enmascararNubes, setEnmascararNubes] = useState(true);
  const [mostrarFiltrosBusqueda, setMostrarFiltrosBusqueda] = useState(true);

  const [mostrarPanelResultadosZonas, setMostrarPanelResultadosZonas] = useState(false);
  const [indiceAmbientacion, setIndiceAmbientacion] = useState("NDVI");
  const [clasesAmbientacion, setClasesAmbientacion] = useState(3);
  const [superficieMinM2, setSuperficieMinM2] = useState(2000);
  const [metodoZonas, setMetodoZonas] = useState("cuantiles");
  const [rellenosActivos, setRellenosActivos] = useState(true);
  const [opacidadAmbientacion, setOpacidadAmbientacion] = useState(80);
  const [unidadMetrica, setUnidadMetrica] = useState("ha");

  const [modoIdentificar, setModoIdentificar] = useState(false);
  const [modoMedir, setModoMedir] = useState(false);
  const [modoDibujar, setModoDibujar] = useState(false);
  const [modoTendencia, setModoTendencia] = useState(false);

  const [puntosMedicion, setPuntosMedicion] = useState([]);
  const [puntosPoligono, setPuntosPoligono] = useState([]);
  const [datosPixel, setDatosPixel] = useState(null);
  const [posicionPixelInfo, setPosicionPixelInfo] = useState(null);
  const [cargandoPixel, setCargandoPixel] = useState(false);

  const [indiceTendencia, setIndiceTendencia] = useState("NDVI");
  const [puntoTendencia, setPuntoTendencia] = useState(null);
  const [serieTendencia, setSerieTendencia] = useState(null);
  const [cargandoSerie, setCargandoSerie] = useState(false);

  const [mostrarMenuMapas, setMostrarMenuMapas] = useState(false);
  const [toast, setToast] = useState(null);

  const [modalDescargaAbierto, setModalDescargaAbierto] = useState(false);
  const [escenaModal, setEscenaModal] = useState(null);
  const [trabajo, setTrabajo] = useState(null);
  const pollRef = useRef(null);
  const [infoHover, setInfoHover] = useState(null);

  useEffect(() => () => clearInterval(pollRef.current), []);

  const loteActual = lotes.find(l => l.id === loteActivoId) || null;
  const urlCapaIndice = loteActual?.tileUrl || null;
  const visActual = loteActual?.vis || null;
  const ambientacion = loteActual?.ambientacion || null;
  const urlCapaAmbientacion = ambientacion?.tileUrl || null;
  const urlCapaBordes = ambientacion?.bordesUrl || null;
  const zonasCalculadas = !!ambientacion;

  const actualizarLote = (id, cambios) =>
    setLotes(prev => prev.map(l => (l.id === id ? { ...l, ...cambios } : l)));

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
    if (Array.isArray(detalle)) detalle = detalle.map(d => d.msg).join('; ');
    if (!detalle && !err?.response) detalle = 'No se pudo conectar con el servidor.';
    return detalle ? `${base}: ${detalle}` : base;
  };

  const activarHerramienta = (nombre) => {
    setModoDibujar(nombre === 'dibujar' ? !modoDibujar : false);
    setModoIdentificar(nombre === 'identificar' ? !modoIdentificar : false);
    setModoMedir(nombre === 'medir' ? !modoMedir : false);
    setModoTendencia(false);
    if (nombre !== 'identificar') { setPosicionPixelInfo(null); setDatosPixel(null); }
  };

  const irASeccion = (seccion) => {
    setSeccionActiva(seccion);
    const esTendencia = seccion === 'tendencia';
    setModoTendencia(esTendencia);
    if (esTendencia) { setModoDibujar(false); setModoIdentificar(false); setModoMedir(false); }
  };

  const toggleSubtilde = (subId) => {
    setSubtildesActivas(prev => prev.includes(subId) ? prev.filter(id => id !== subId) : [...prev, subId]);
  };

  const seleccionarLote = (id) => {
    setLoteActivoId(id);
    const l = lotes.find(item => item.id === id);
    if (l) {
      setMostrarPanelResultadosZonas(false);
      if (l.puntosCoords.length > 0) setCentroMapa({ coords: l.puntosCoords, t: Date.now() });
    }
  };

  const eliminarLote = (id, e) => {
    e.stopPropagation();
    const restantes = lotes.filter(l => l.id !== id);
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
      ambientacion: null
    };
    setLotes(prev => [...prev, nuevo]);
    setLoteActivoId(nuevo.id);
    setMostrarPanelResultadosZonas(false);
    return nuevo;
  };

  const manejarClickMapa = async ({ lat, lng }) => {
    if (modoDibujar) { setPuntosPoligono(prev => [...prev, [lat, lng]]); return; }
    if (modoMedir) { setPuntosMedicion(prev => [...prev, [lat, lng]]); return; }
    if (modoTendencia) { cargarSerie(lat, lng); return; }
    if (!modoIdentificar) return;
    if (!loteActual?.escenaSeleccionada) {
      avisar('Selecciona una escena para consultar el valor del píxel.', 'info');
      return;
    }
    setPosicionPixelInfo([lat, lng]);
    setCargandoPixel(true);
    setDatosPixel(null);
    try {
      const res = await axios.post(`${API_BASE_URL}/identificar-pixel`, {
        escena_id: loteActual.escenaSeleccionada.id, lat, lng, indice: modoViz, enmascarar_nubes: enmascararNubes
      });
      setDatosPixel(res.data);
    } catch (err) {
      setDatosPixel({ error: await mensajeError(err, 'Error de lectura') });
    } finally {
      setCargandoPixel(false);
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

  const buscarEscenas = async () => {
    if (!loteActual) { avisar('Dibuja o sube un lote antes de buscar imágenes.', 'info'); return; }
    if (subtildesActivas.length === 0) { avisar('Activa al menos un sensor.', 'info'); return; }
    const loteId = loteActivoId;
    setCargando(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/buscar-escenas`, {
        geojson: loteActual.geojson,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        nubosidad_max: Number(nubosidadMax),
        sensores: subtildesActivas
      });
      const escenas = res.data.escenas || [];
      actualizarLote(loteId, { escenas, buscada: true, escenaSeleccionada: null, tileUrl: null, vis: null, ambientacion: null });
      setMostrarPanelResultadosZonas(false);
    } catch (err) {
      avisar(await mensajeError(err, 'Error buscando escenas'));
    } finally {
      setCargando(false);
    }
  };

  const seleccionarEscena = async (escenaObj, modo = modoViz) => {
    if (!loteActual) return;
    const loteId = loteActivoId;
    const cambioEscena = loteActual.escenaSeleccionada?.id !== escenaObj.id;
    const peticion = ++peticionEscenaRef.current;
    setModoViz(modo);
    setCargando(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/obtener-capa`, {
        escena_id: escenaObj.id, modo_viz: modo, enmascarar_nubes: enmascararNubes
      });
      if (peticion !== peticionEscenaRef.current) return;
      setLotes(prev => prev.map(l => l.id !== loteId ? l : {
        ...l,
        escenaSeleccionada: escenaObj,
        tileUrl: res.data.tile_url,
        vis: res.data.vis,
        ambientacion: cambioEscena ? null : l.ambientacion
      }));
      if (cambioEscena) setMostrarPanelResultadosZonas(false);
    } catch (err) {
      if (peticion === peticionEscenaRef.current) avisar(await mensajeError(err, 'No se pudo cargar la capa'));
    } finally {
      if (peticion === peticionEscenaRef.current) setCargando(false);
    }
  };

  const abrirModalDescargaEscena = (escenaObj, e) => {
    e.stopPropagation();
    clearInterval(pollRef.current);
    setTrabajo(null);
    setEscenaModal(escenaObj);
    setModalDescargaAbierto(true);
  };

  const cerrarModalDescarga = () => {
    clearInterval(pollRef.current);
    setModalDescargaAbierto(false);
  };

  const avisarEscala = (response) => {
    const escala = response.headers?.['x-escala-usada'];
    if (escala) avisar(`Descarga lista. Para respetar el límite de tamaño se usó un píxel de ${escala} m.`, 'info');
  };

  // Descarga de la escena completa (producto original de Copernicus), preparada en segundo plano
  const iniciarDescargaEscena = async () => {
    if (!escenaModal) return;
    if (!escenaModal.producto) {
      avisar('Esta escena no trae el identificador del producto. Vuelve a buscar las escenas.', 'info');
      return;
    }
    clearInterval(pollRef.current);
    setTrabajo({ estado: 'en_cola', progreso: 0 });
    try {
      const { data } = await axios.post(`${API_BASE_URL}/descargas`, {
        producto: escenaModal.producto,
        satelite: escenaModal.satelite
      });
      const id = data.job_id;
      setTrabajo({ ...data, id });
      pollRef.current = setInterval(async () => {
        try {
          const r = await axios.get(`${API_BASE_URL}/descargas/${id}`);
          setTrabajo({ ...r.data, id });
          if (r.data.estado === 'listo' || r.data.estado === 'error') clearInterval(pollRef.current);
        } catch (err) {
          clearInterval(pollRef.current);
          setTrabajo({ estado: 'error', error: await mensajeError(err, 'Se perdió la conexión con el servidor') });
        }
      }, 2000);
    } catch (err) {
      setTrabajo({ estado: 'error', error: await mensajeError(err, 'No se pudo iniciar la descarga') });
    }
  };

  const descargarIndiceOriginal = async (formato = 'geotiff') => {
    if (!loteActual?.escenaSeleccionada) { avisar('Selecciona una escena e índice para descargar.', 'info'); return; }
    setDescargandoRaster(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/descargar-raster`, {
        escena_id: loteActual.escenaSeleccionada.id,
        modo_viz: modoViz,
        geojson: loteActual.geojson,
        formato,
        enmascarar_nubes: enmascararNubes
      }, { responseType: 'blob' });
      const extension = formato === 'geotiff' ? 'tif' : 'png';
      guardarBlob(response.data, `${loteActual.nombre}_${modoViz}_${loteActual.escenaSeleccionada.fecha}.${extension}`);
      avisarEscala(response);
    } catch (err) {
      avisar(await mensajeError(err, 'Error al descargar la capa'));
    } finally {
      setDescargandoRaster(false);
    }
  };

  const ejecutarAmbientacion = async () => {
    if (!loteActual?.escenaSeleccionada) { avisar('Selecciona primero una escena satelital.', 'info'); return; }
    const loteId = loteActivoId;
    const params = {
      escena_id: loteActual.escenaSeleccionada.id,
      indice: indiceAmbientacion,
      num_clusters: Math.min(5, Math.max(2, parseInt(clasesAmbientacion, 10) || 3)),
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
          cortes: res.data.cortes || [],
          areaTotalHa: res.data.area_total_ha,
          areaSinDatoHa: res.data.area_sin_dato_ha,
          indice: indiceAmbientacion,
          params
        }
      });
      setMostrarPanelResultadosZonas(true);
    } catch (err) {
      avisar(await mensajeError(err, 'Error procesando las zonas de manejo'));
    } finally {
      setCargando(false);
    }
  };

  const restablecerAmbientacion = () => {
    setClasesAmbientacion(3);
    setSuperficieMinM2(2000);
    setMetodoZonas("cuantiles");
    if (loteActivoId) actualizarLote(loteActivoId, { ambientacion: null });
    setMostrarPanelResultadosZonas(false);
  };

  const descargarVectorZonas = async (formato) => {
    if (!ambientacion) return;
    setDescargandoRaster(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/descargar-vector-ambientacion`, { ...ambientacion.params, formato }, { responseType: 'blob' });
      guardarBlob(response.data, `${loteActual.nombre}_zonas_${ambientacion.indice}_${formato}.zip`);
    } catch (err) {
      avisar(await mensajeError(err, 'Error al exportar las zonas'));
    } finally {
      setDescargandoRaster(false);
    }
  };

  const cargarSerie = async (lat, lng, indice = indiceTendencia) => {
    setPuntoTendencia([lat, lng]);
    setCargandoSerie(true);
    setSerieTendencia(null);
    try {
      const res = await axios.post(`${API_BASE_URL}/serie-temporal-pixel`, {
        lat, lng, indice,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        sensores: subtildesActivas,
        enmascarar_nubes: enmascararNubes
      });
      setSerieTendencia(res.data.puntos || []);
    } catch (err) {
      avisar(await mensajeError(err, 'Error obteniendo la serie temporal'));
    } finally {
      setCargandoSerie(false);
    }
  };

  const manejarCargaArchivo = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const bruto = file.name.toLowerCase().endsWith('.zip') ? await shp(await file.arrayBuffer()) : JSON.parse(await file.text());
      const fcBruta = Array.isArray(bruto) ? bruto[0] : bruto;
      const feats = fcBruta.type === 'FeatureCollection' ? fcBruta.features : [fcBruta.type === 'Feature' ? fcBruta : { type: 'Feature', geometry: fcBruta }];
      const featureCollection = {
        type: 'FeatureCollection',
        features: feats
          .filter(f => f?.geometry && ['Polygon', 'MultiPolygon'].includes(f.geometry.type))
          .map(f => ({ type: 'Feature', properties: {}, geometry: { type: f.geometry.type, coordinates: quitarZ(f.geometry.coordinates) } }))
      };
      const contornos = extraerContornos(featureCollection);
      if (contornos.length === 0) throw new Error('sin polígonos');
      const nuevo = agregarLote({ nombre: file.name, origen: "Archivo Subido", geojson: featureCollection, contornos });
      setCentroMapa({ coords: nuevo.puntosCoords, t: Date.now() });
    } catch (err) {
      avisar('El archivo no tiene polígonos válidos. Usa .geojson, .json o un .zip con shapefile.');
    }
  };

  const finalizarDibujoLote = () => {
    if (puntosPoligono.length < 3) { avisar('Marca al menos 3 puntos en el mapa.', 'info'); return; }
    const anillo = [...puntosPoligono, puntosPoligono[0]].map(p => [p[1], p[0]]);
    const featureCollection = {
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [anillo] }, properties: {} }]
    };
    agregarLote({ nombre: `Lote ${lotes.length + 1}`, origen: "Dibujado", geojson: featureCollection, contornos: [puntosPoligono] });
    setPuntosPoligono([]);
    setModoDibujar(false);
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', height: '100vh', width: '100vw', backgroundColor: COLOR.bg, overflow: 'hidden', fontFamily: "'Inter', 'Roboto', system-ui, -apple-system, sans-serif", fontSize: '12px', lineHeight: '1.4', letterSpacing: '-0.01em' }}>

      <style>{`
        .rango-oscuro{-webkit-appearance:none;appearance:none;width:100%;height:3px;border-radius:2px;outline:none;cursor:pointer}
        .rango-oscuro::-webkit-slider-thumb{-webkit-appearance:none;width:11px;height:11px;border-radius:50%;background:#8b95a5;border:2px solid #121720}
        .rango-oscuro::-moz-range-thumb{width:8px;height:8px;border-radius:50%;background:#8b95a5;border:2px solid #121720}
        .rango-oscuro:hover::-webkit-slider-thumb{background:#c4ccd8}
      `}</style>

      <input type="file" ref={fileInputRef} onChange={manejarCargaArchivo} accept=".zip,.geojson,.json" style={{ display: 'none' }} />

      {toast && (
        <div role="status" style={{ position: 'fixed', top: '14px', left: '50%', transform: 'translateX(-50%)', zIndex: 4000, maxWidth: '520px', backgroundColor: COLOR.panel, border: `1px solid ${toast.tipo === 'error' ? '#dc2626' : COLOR.accent}`, color: COLOR.text, padding: '8px 12px', borderRadius: COLOR.radius, fontSize: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.6)', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span>{toast.texto}</span>
          <button onClick={() => setToast(null)} aria-label="Cerrar aviso" style={{ background: 'transparent', border: 'none', color: COLOR.textDim, cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* 1. DOCK DESPLEGABLE */}
      <div
        onMouseEnter={() => setDockExpanded(true)}
        onMouseLeave={() => setDockExpanded(false)}
        style={{
          width: dockExpanded ? '230px' : '52px',
          backgroundColor: COLOR.dock,
          borderRight: `1px solid ${COLOR.border}`,
          display: 'flex',
          flexDirection: 'column',
          zIndex: 20,
          transition: 'width 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: dockExpanded ? '4px 0 24px rgba(0,0,0,0.6)' : 'none',
          overflow: 'hidden',
          whiteSpace: 'nowrap'
        }}
      >
        <div style={{ height: '50px', display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: `1px solid ${COLOR.borderSoft}`, gap: '12px' }}>
          <div style={{ color: COLOR.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconLogo />
          </div>
          {dockExpanded && <span style={{ color: COLOR.text, fontWeight: '600', fontSize: '13px', letterSpacing: '0.02em' }}>GeoSat Pro</span>}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', padding: '8px 4px' }}>
          <div
            onClick={() => irASeccion('imagenes')}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', borderRadius: COLOR.radius,
              backgroundColor: seccionActiva === 'imagenes' ? COLOR.cardActiveBg : 'transparent',
              color: seccionActiva === 'imagenes' ? '#ffffff' : COLOR.textDim, cursor: 'pointer'
            }}
          >
            <IconImagenes />
            {dockExpanded && <span style={{ fontSize: '12px', fontWeight: '400' }}>Imágenes abiertas</span>}
          </div>

          <div
            onClick={() => irASeccion('ambientacion')}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', borderRadius: COLOR.radius,
              backgroundColor: seccionActiva === 'ambientacion' ? COLOR.cardActiveBg : 'transparent',
              color: seccionActiva === 'ambientacion' ? '#ffffff' : COLOR.textDim, cursor: 'pointer'
            }}
          >
            <IconZonas />
            {dockExpanded && <span style={{ fontSize: '12px', fontWeight: '400' }}>Zonas de vegetación</span>}
          </div>

          <div
            onClick={() => irASeccion('tendencia')}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', borderRadius: COLOR.radius,
              backgroundColor: seccionActiva === 'tendencia' ? COLOR.cardActiveBg : 'transparent',
              color: seccionActiva === 'tendencia' ? '#ffffff' : COLOR.textDim, cursor: 'pointer'
            }}
          >
            <IconTendencia />
            {dockExpanded && <span style={{ fontSize: '12px' }}>Tendencia vegetal</span>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', color: COLOR.textFaint, cursor: 'not-allowed' }}>
            <IconComparar />
            {dockExpanded && <span style={{ fontSize: '12px' }}>Comparar imágenes</span>}
          </div>

          <div 
            onClick={() => loteActual?.escenaSeleccionada && descargarIndiceOriginal('geotiff')}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', 
              color: loteActual?.escenaSeleccionada ? COLOR.text : COLOR.textFaint, 
              cursor: loteActual?.escenaSeleccionada ? 'pointer' : 'not-allowed' 
            }}
          >
            <IconDescargas />
            {dockExpanded && <span style={{ fontSize: '12px' }}>Exportar GeoTIFF</span>}
          </div>

          <div style={{ height: '1px', backgroundColor: COLOR.borderSoft, margin: '6px 0' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', color: COLOR.textDim, cursor: 'pointer' }}>
            <IconAreas />
            {dockExpanded && <span style={{ fontSize: '12px' }}>Mis áreas</span>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', color: COLOR.textDim, cursor: 'pointer' }}>
            <IconIA />
            {dockExpanded && <span style={{ fontSize: '12px' }}>Soluciones IA</span>}
          </div>
        </div>

        <div style={{ padding: '10px 12px', borderTop: `1px solid ${COLOR.borderSoft}`, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: COLOR.cardActiveBg, border: `1px solid ${COLOR.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLOR.text, fontSize: '10px', fontWeight: '600', flexShrink: 0 }}>
            RC
          </div>
          {dockExpanded && (
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <span style={{ fontSize: '11px', fontWeight: '500', color: COLOR.text }}>Ruben Emanuel Cuenca</span>
              <span style={{ fontSize: '10px', color: COLOR.textFaint }}>Ingeniero Agrónomo</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. PANEL SECUNDARIO */}
      <aside style={{ width: '310px', backgroundColor: COLOR.panelAlt, borderRight: `1px solid ${COLOR.border}`, display: 'flex', flexDirection: 'column', zIndex: 9 }}>
        {seccionActiva === 'imagenes' && (
          <>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${COLOR.borderSoft}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: COLOR.text, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  IMÁGENES ABIERTAS
                </div>
              </div>

              <button
                onClick={() => setMostrarFiltrosBusqueda(!mostrarFiltrosBusqueda)}
                style={{
                  width: '100%', backgroundColor: COLOR.panel, border: `1px solid ${COLOR.border}`,
                  color: COLOR.text, padding: '6px 10px', borderRadius: COLOR.radius,
                  fontSize: '11px', fontWeight: '500', display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', cursor: 'pointer'
                }}
              >
                <span>Filtros de búsqueda</span>
                <span style={{ fontSize: '10px', color: COLOR.textDim, transform: mostrarFiltrosBusqueda ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>▼</span>
              </button>

              {mostrarFiltrosBusqueda && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px', padding: '10px', backgroundColor: COLOR.panel, border: `1px solid ${COLOR.borderSoft}`, borderRadius: COLOR.radius }}>
                  <div>
                    <label style={{ fontSize: '11px', color: COLOR.textDim, display: 'block', marginBottom: '3px' }}>Fecha Desde:</label>
                    <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} style={{ width: '100%', backgroundColor: COLOR.panelAlt, border: `1px solid ${COLOR.border}`, color: COLOR.text, borderRadius: COLOR.radius, padding: '5px 8px', fontSize: '11px', colorScheme: 'dark', outline: 'none' }} />
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', color: COLOR.textDim, display: 'block', marginBottom: '3px' }}>Fecha Hasta:</label>
                    <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} style={{ width: '100%', backgroundColor: COLOR.panelAlt, border: `1px solid ${COLOR.border}`, color: COLOR.text, borderRadius: COLOR.radius, padding: '5px 8px', fontSize: '11px', colorScheme: 'dark', outline: 'none' }} />
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', color: COLOR.textDim, display: 'block', marginBottom: '6px' }}>Nubosidad Máxima: {nubosidadMax}%</label>
                    <input
                      type="range" className="rango-oscuro" min="0" max="100" value={nubosidadMax}
                      onChange={(e) => setNubosidadMax(Number(e.target.value))}
                      style={{ background: `linear-gradient(to right, #3b4a63 ${nubosidadMax}%, #232d3f ${nubosidadMax}%)` }}
                    />
                  </div>

                  <div style={{ marginTop: '2px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '500', color: COLOR.textDim }}>Sensores:</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                      {ESTRUCTURA_SENSORES.map(fam => (
                        <div key={fam.familia} style={{ backgroundColor: COLOR.panelAlt, padding: '6px 8px', borderRadius: COLOR.radius, border: `1px solid ${COLOR.borderSoft}` }}>
                          <div style={{ fontSize: '11px', fontWeight: '500', color: COLOR.text, marginBottom: '2px' }}>{fam.familia}</div>
                          {fam.subtildes.map(sub => (
                            <label key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '10px', color: COLOR.textDim }}>
                              <input type="checkbox" checked={subtildesActivas.includes(sub.id)} onChange={() => toggleSubtilde(sub.id)} style={{ accentColor: COLOR.accent }} />
                              <span>{sub.nombre}</span>
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '10px', color: COLOR.textDim }}>
                    <input type="checkbox" checked={enmascararNubes} onChange={(e) => setEnmascararNubes(e.target.checked)} style={{ accentColor: COLOR.accent }} />
                    <span>Enmascarar nubes y sombras en índices</span>
                  </label>

                  <button
                    onClick={buscarEscenas}
                    disabled={cargando}
                    style={{ backgroundColor: COLOR.accent, color: '#ffffff', border: 'none', padding: '7px 10px', borderRadius: COLOR.radius, fontWeight: '500', cursor: 'pointer', fontSize: '11px', marginTop: '4px' }}
                  >
                    {cargando ? 'Buscando...' : 'Buscar Escenas'}
                  </button>
                </div>
              )}
            </div>

            {/* LISTADO DE RESULTADOS DE ESCENAS */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {!loteActual && (
                <div style={{ fontSize: '11px', color: COLOR.textDim, padding: '6px' }}>
                  Dibuja un lote con la herramienta de lápiz o sube un archivo (.geojson o .zip con shapefile) para buscar imágenes.
                </div>
              )}
              {loteActual && loteActual.buscada && loteActual.escenas.length === 0 && (
                <div style={{ fontSize: '11px', color: COLOR.textDim, padding: '6px' }}>
                  No hay escenas con estos filtros. Amplía las fechas o sube la nubosidad máxima.
                </div>
              )}
              {loteActual && loteActual.escenas.map((e) => {
                const estaSeleccionada = loteActual.escenaSeleccionada?.id === e.id;

                return (
                  <div
                    key={e.id}
                    data-escena="1"
                    onClick={() => seleccionarEscena(e, modoViz)}
                    onMouseLeave={(evt) => {
                      setInfoHover(null);
                      evt.currentTarget.style.backgroundColor = estaSeleccionada ? CARD_ACTIVA : CARD_BG;
                    }}
                    onMouseEnter={(evt) => {
                      evt.currentTarget.style.backgroundColor = estaSeleccionada ? CARD_ACTIVA : CARD_HOVER;
                    }}
                    style={{
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      width: '100%',
                      boxSizing: 'border-box',
                      minHeight: '102px',
                      padding: '10px',
                      gap: '12px',
                      backgroundColor: estaSeleccionada ? CARD_ACTIVA : CARD_BG,
                      border: `1px solid ${estaSeleccionada ? COLOR.accent : COLOR.borderSoft}`,
                      borderRadius: '4px',
                      cursor: 'pointer',
                      overflow: 'visible',
                      transition: 'background-color 0.15s ease, border-color 0.15s ease'
                    }}
                  >
                    <button
                      title="Descargar bandas"
                      onClick={(evt) => abrirModalDescargaEscena(e, evt)}
                      onMouseEnter={(evt) => { evt.currentTarget.style.color = '#ffffff'; }}
                      onMouseLeave={(evt) => { evt.currentTarget.style.color = COLOR.textDim; }}
                      style={{ position: 'absolute', top: '6px', right: '6px', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: COLOR.textDim, cursor: 'pointer', padding: 0, zIndex: 2 }}
                    >
                      <IconDescargas />
                    </button>

                    <img
                      src={e.thumb || placeholderSvg('sin miniatura')}
                      alt="miniatura de la escena"
                      style={{
                        width: '82px',
                        height: '82px',
                        minWidth: '82px',
                        minHeight: '82px',
                        flexShrink: 0,
                        objectFit: 'cover',
                        borderRadius: '4px',
                        border: 'none',
                        display: 'block',
                        backgroundColor: '#0e1218'
                      }}
                    />

                    <div
                      style={{
                        minWidth: 0,
                        flex: 1,
                        height: '82px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        padding: '1px 0',
                        boxSizing: 'border-box'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '7px',
                          minWidth: 0,
                          paddingRight: '24px',
                          color: '#ffffff',
                          fontSize: '12px',
                          lineHeight: '16px',
                          fontWeight: 600,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#8d99ae',
                            flexShrink: 0
                          }}
                        >
                          <IconCalendarioEscena />
                        </span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {e.fecha || '—'}
                        </span>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          color: '#9eaab8',
                          fontSize: '11px',
                          lineHeight: '15px',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        <span>Nubosidad:</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          <IconNubosidadEscena pct={e.nubosidad} />
                        </span>
                        <span style={{ color: '#d8dde5', fontWeight: 500 }}>
                          {e.nubosidad !== undefined && e.nubosidad !== null ? `${e.nubosidad}%` : '—'}
                        </span>
                      </div>

                      <div
                        style={{
                          color: '#9eaab8',
                          fontSize: '11px',
                          lineHeight: '15px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        Satélite: {e.satelite || '—'}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', minHeight: '17px', paddingTop: '1px' }}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={(evt) => evt.stopPropagation()}
                          onMouseEnter={(evt) => {
                            const r = evt.currentTarget.closest('[data-escena]').getBoundingClientRect();
                            setInfoHover({
                              escena: e,
                              left: r.right + 8,
                              top: Math.min(Math.max(r.top, 8), window.innerHeight - 260)
                            });
                          }}
                          onMouseLeave={() => setInfoHover(null)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            color: '#b0b3b8',
                            fontSize: '10.5px',
                            lineHeight: '15px',
                            cursor: 'help',
                            userSelect: 'none',
                            outline: 'none'
                          }}
                        >
                          <IconInfoPixel />
                          <span style={{ lineHeight: '15px' }}>Más info</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {seccionActiva === 'ambientacion' && (
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: COLOR.text, textTransform: 'uppercase', borderBottom: `1px solid ${COLOR.borderSoft}`, paddingBottom: '6px', letterSpacing: '0.04em' }}>
              ZONAS DE VEGETACIÓN (AMBIENTACIÓN)
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <label style={{ fontSize: '11px', color: COLOR.textDim, display: 'block', marginBottom: '3px' }}>Índice Base:</label>
                <select
                  value={indiceAmbientacion}
                  onChange={(e) => {
                    const nuevoIndice = e.target.value;
                    setIndiceAmbientacion(nuevoIndice);
                    if (loteActual && loteActual.escenaSeleccionada) seleccionarEscena(loteActual.escenaSeleccionada, nuevoIndice);
                  }}
                  style={{ width: '100%', backgroundColor: COLOR.panel, border: `1px solid ${COLOR.border}`, color: COLOR.text, padding: '5px 8px', borderRadius: COLOR.radius, fontSize: '11px', outline: 'none' }}
                >
                  <option value="NDVI">NDVI</option>
                  <option value="NDWI">NDWI</option>
                  <option value="SAVI">SAVI</option>
                  <option value="NBR">NBR</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: COLOR.textDim, display: 'block', marginBottom: '3px' }}>Método de corte:</label>
                <select
                  value={metodoZonas}
                  onChange={(e) => setMetodoZonas(e.target.value)}
                  style={{ width: '100%', backgroundColor: COLOR.panel, border: `1px solid ${COLOR.border}`, color: COLOR.text, padding: '5px 8px', borderRadius: COLOR.radius, fontSize: '11px', outline: 'none' }}
                >
                  <option value="cuantiles">Cuantiles (zonas de igual superficie)</option>
                  <option value="intervalos">Intervalos iguales (superficies reales)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: COLOR.textDim, display: 'block', marginBottom: '3px' }}>Número de Zonas:</label>
                <input
                  type="number" min="2" max="5" value={clasesAmbientacion}
                  onChange={(e) => setClasesAmbientacion(e.target.value)}
                  style={{ width: '100%', backgroundColor: COLOR.panel, border: `1px solid ${COLOR.border}`, color: COLOR.text, padding: '5px 8px', borderRadius: COLOR.radius, fontSize: '11px', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: COLOR.textDim, display: 'block', marginBottom: '3px' }}>Superficie Mínima (m²):</label>
                <input
                  type="number" step="100" value={superficieMinM2}
                  onChange={(e) => setSuperficieMinM2(e.target.value)}
                  style={{ width: '100%', backgroundColor: COLOR.panel, border: `1px solid ${COLOR.border}`, color: COLOR.text, padding: '5px 8px', borderRadius: COLOR.radius, fontSize: '11px', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLOR.panel, padding: '6px 8px', borderRadius: COLOR.radius, border: `1px solid ${COLOR.borderSoft}` }}>
                <label style={{ fontSize: '11px', color: COLOR.text, cursor: 'pointer' }}>Rellenos</label>
                <input type="checkbox" checked={rellenosActivos} onChange={(e) => setRellenosActivos(e.target.checked)} style={{ accentColor: COLOR.accent }} />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: COLOR.textDim, display: 'block', marginBottom: '6px' }}>Opacidad: {opacidadAmbientacion}%</label>
                <input
                  type="range" className="rango-oscuro" min="10" max="100" value={opacidadAmbientacion}
                  onChange={(e) => setOpacidadAmbientacion(Number(e.target.value))}
                  style={{ background: `linear-gradient(to right, #3b4a63 ${((opacidadAmbientacion - 10) / 90) * 100}%, #232d3f ${((opacidadAmbientacion - 10) / 90) * 100}%)` }}
                />
              </div>

              <button
                onClick={ejecutarAmbientacion}
                disabled={cargando}
                style={{ backgroundColor: COLOR.green, color: '#ffffff', border: 'none', padding: '8px', borderRadius: COLOR.radius, fontWeight: '600', cursor: 'pointer', fontSize: '11px', marginTop: '6px' }}
              >
                {cargando ? 'Procesando Zonas...' : 'Calcular Zonas'}
              </button>

              <button
                onClick={restablecerAmbientacion}
                style={{ backgroundColor: COLOR.panel, border: `1px solid ${COLOR.border}`, color: COLOR.textDim, padding: '6px', borderRadius: COLOR.radius, fontSize: '11px', cursor: 'pointer' }}
              >
                Restablecer
              </button>
            </div>
          </div>
        )}
        {seccionActiva === 'tendencia' && (
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: COLOR.text, textTransform: 'uppercase', borderBottom: `1px solid ${COLOR.borderSoft}`, paddingBottom: '6px', letterSpacing: '0.04em' }}>
              TENDENCIA VEGETAL
            </div>
            <div>
              <label style={{ fontSize: '11px', color: COLOR.textDim, display: 'block', marginBottom: '3px' }}>Índice:</label>
              <select
                value={indiceTendencia}
                onChange={(e) => {
                  setIndiceTendencia(e.target.value);
                  if (puntoTendencia) cargarSerie(puntoTendencia[0], puntoTendencia[1], e.target.value);
                }}
                style={{ width: '100%', backgroundColor: COLOR.panel, border: `1px solid ${COLOR.border}`, color: COLOR.text, padding: '5px 8px', borderRadius: COLOR.radius, fontSize: '11px', outline: 'none' }}
              >
                <option value="NDVI">NDVI</option>
                <option value="NDWI">NDWI</option>
                <option value="SAVI">SAVI</option>
                <option value="NBR">NBR</option>
              </select>
            </div>
            <div style={{ fontSize: '11px', color: COLOR.textDim }}>
              {puntoTendencia
                ? `Punto: ${puntoTendencia[0].toFixed(5)}, ${puntoTendencia[1].toFixed(5)}`
                : 'Haz clic en el mapa para ver cómo cambió el índice en ese punto. Usa las fechas y sensores de "Imágenes abiertas".'}
            </div>
            <div style={{ fontSize: '11px', color: COLOR.textDim }}>Período: {fechaInicio} a {fechaFin}</div>
            {cargandoSerie && <div style={{ fontSize: '11px', color: COLOR.textDim }}>Consultando pasadas del satélite…</div>}
            {serieTendencia && (
              <>
                <GraficoSerie puntos={serieTendencia} indice={indiceTendencia} />
                {serieTendencia.length > 0 && (
                  <div style={{ display: 'flex', gap: '12px', fontSize: '10px', color: COLOR.textDim }}>
                    <span><span style={{ color: COLOR.accent }}>●</span> Sentinel-2</span>
                    <span><span style={{ color: '#f59e0b' }}>●</span> Landsat</span>
                    <span>{serieTendencia.length} observaciones</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </aside>

      {/* 3. VISUALIZADOR DE MAPA Y CAPAS */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', width: '100%', height: '100%' }}>

        {/* BUSCADOR */}
        <div style={{ position: 'absolute', top: '12px', left: '16px', zIndex: 1000, backgroundColor: COLOR.panel, borderRadius: COLOR.radius, border: `1px solid ${COLOR.border}`, display: 'flex', alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.45)', overflow: 'hidden' }}>
          <input
            type="text" placeholder="Ubicación o coordenadas..." value={inputBusqueda} onChange={(e) => setInputBusqueda(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscarUbicacion()}
            style={{ background: 'transparent', border: 'none', color: COLOR.text, fontSize: '11px', width: '220px', outline: 'none', padding: '6px 10px' }}
          />
          <button onClick={buscarUbicacion} style={{ backgroundColor: COLOR.panelAlt, color: COLOR.text, border: 'none', padding: '6px 10px', fontSize: '11px', cursor: 'pointer', borderLeft: `1px solid ${COLOR.border}` }}>Ir</button>
          <button onClick={() => fileInputRef.current?.click()} style={{ backgroundColor: COLOR.accent, color: '#fff', border: 'none', padding: '6px 12px', fontSize: '11px', fontWeight: '500', cursor: 'pointer', borderLeft: `1px solid ${COLOR.border}` }}>
            Subir área
          </button>
        </div>

        {/* SOLAPAS DE LOTES */}
        {lotes.length > 0 && (
          <div style={{ position: 'absolute', top: '12px', left: '420px', right: '80px', zIndex: 1000, display: 'flex', gap: '6px', overflowX: 'auto' }}>
            {lotes.map((l) => (
              <div
                key={l.id} onClick={() => seleccionarLote(l.id)}
                style={{ backgroundColor: l.id === loteActivoId ? COLOR.panel : COLOR.panelAlt, border: `1px solid ${l.id === loteActivoId ? COLOR.accent : COLOR.border}`, borderRadius: COLOR.radius, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flexShrink: 0 }}
              >
                <span style={{ fontSize: '11px', fontWeight: '500', color: COLOR.text }}>{l.nombre}</span>
                <span style={{ fontSize: '10px', color: COLOR.green }}>{l.superficieHa} ha</span>
                <button onClick={(e) => eliminarLote(l.id, e)} style={{ background: 'transparent', border: 'none', color: COLOR.textDim, cursor: 'pointer', fontSize: '11px' }}>✕</button>
              </div>
            ))}
          </div>
        )}

        {/* ZONAS DE MANEJO RESULTADOS */}
        {mostrarPanelResultadosZonas && ambientacion && (
          <div style={{ position: 'absolute', top: '70px', right: '60px', width: '230px', zIndex: 1000, backgroundColor: 'rgba(18, 23, 32, 0.96)', border: `1px solid ${COLOR.border}`, borderRadius: COLOR.radius, padding: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${COLOR.borderSoft}`, paddingBottom: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: '600', color: COLOR.text }}>Zonas de Manejo · {ambientacion.indice}</span>
              <button onClick={() => setMostrarPanelResultadosZonas(false)} aria-label="Cerrar" style={{ background: 'transparent', border: 'none', color: COLOR.textDim, cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ display: 'flex', border: `1px solid ${COLOR.border}`, borderRadius: COLOR.radius, overflow: 'hidden', alignSelf: 'center' }}>
              {['m', 'ha', '%'].map((unit) => (
                <button key={unit} onClick={() => setUnidadMetrica(unit)} style={{ backgroundColor: unidadMetrica === unit ? COLOR.accent : COLOR.panelAlt, color: unidadMetrica === unit ? '#fff' : COLOR.textDim, border: 'none', padding: '2px 8px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}>{unit}</button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {ambientacion.zonas.map((z) => (
                <div key={z.zona} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLOR.panelAlt, border: `1px solid ${COLOR.borderSoft}`, padding: '5px 8px', borderRadius: COLOR.radius }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: z.color }} />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '11px', color: COLOR.text }}>{z.etiqueta}</span>
                      <span style={{ fontSize: '9px', color: COLOR.textFaint }}>{z.rango}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', color: COLOR.green, fontWeight: '600' }}>
                    {unidadMetrica === 'm' ? `${z.m2} m²` : unidadMetrica === 'ha' ? `${z.ha} ha` : `${z.porcentaje}%`}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: '10px', color: COLOR.textDim }}>
              Lote: {ambientacion.areaTotalHa} ha
              {ambientacion.areaSinDatoHa > 0 && ` · ${ambientacion.areaSinDatoHa} ha sin dato (nubes/sombra)`}
            </div>

            <div style={{ display: 'flex', gap: '4px' }}>
              {[['geojson', 'GeoJSON'], ['shp', 'SHP'], ['gpkg', 'GPKG']].map(([fmt, etiqueta]) => (
                <button key={fmt} disabled={descargandoRaster} onClick={() => descargarVectorZonas(fmt)} style={{ flex: 1, backgroundColor: COLOR.panel, border: `1px solid ${COLOR.border}`, color: COLOR.text, borderRadius: COLOR.radius, padding: '4px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}>
                  {etiqueta}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* BOTONERA FLOTANTE DEL PANEL DERECHO */}
        <div style={{ position: 'absolute', top: '12px', right: '16px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <ControlZoomLeaflet mapRef={mapInstanceRef} />

          <div style={{ display: 'flex', flexDirection: 'column', backgroundColor: COLOR.panel, borderRadius: COLOR.radius, border: `1px solid ${COLOR.border}`, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
            <button
              title="Dibujar polígono de lote"
              onClick={() => activarHerramienta('dibujar')}
              style={{ width: '32px', height: '32px', backgroundColor: modoDibujar ? COLOR.cardActiveBg : 'transparent', border: 'none', color: modoDibujar ? COLOR.accent : COLOR.textDim, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <IconDibujar />
            </button>

            <div style={{ height: '1px', backgroundColor: COLOR.borderSoft }} />

            <button
              title="Ver valor e información de píxel"
              onClick={() => activarHerramienta('identificar')}
              style={{ width: '32px', height: '32px', backgroundColor: modoIdentificar ? COLOR.cardActiveBg : 'transparent', border: 'none', color: modoIdentificar ? COLOR.accent : COLOR.textDim, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <IconInfoPixel />
            </button>

            <div style={{ height: '1px', backgroundColor: COLOR.borderSoft }} />

            <button
              title="Medir distancia"
              onClick={() => activarHerramienta('medir')}
              style={{ width: '32px', height: '32px', backgroundColor: modoMedir ? COLOR.cardActiveBg : 'transparent', border: 'none', color: modoMedir ? COLOR.accent : COLOR.textDim, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <IconRegla />
            </button>

            <div style={{ height: '1px', backgroundColor: COLOR.borderSoft }} />

            <button
              title="Cambiar mapa base"
              onClick={() => setMostrarMenuMapas(!mostrarMenuMapas)}
              style={{ width: '32px', height: '32px', backgroundColor: mostrarMenuMapas ? COLOR.cardActiveBg : 'transparent', border: 'none', color: mostrarMenuMapas ? COLOR.accent : COLOR.textDim, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <IconCapasMapa />
            </button>
          </div>

          {mostrarMenuMapas && (
            <div style={{ position: 'absolute', top: '160px', right: '40px', width: '150px', backgroundColor: COLOR.panel, border: `1px solid ${COLOR.border}`, borderRadius: COLOR.radius, padding: '4px', boxShadow: '0 8px 24px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {Object.keys(MAPAS_BASE).map(mName => (
                <button
                  key={mName}
                  onClick={() => {
                    setMapaBaseActual(mName);
                    setMostrarMenuMapas(false);
                  }}
                  style={{
                    backgroundColor: mapaBaseActual === mName ? COLOR.cardActiveBg : 'transparent',
                    border: 'none', color: mapaBaseActual === mName ? COLOR.text : COLOR.textDim,
                    padding: '6px 8px', fontSize: '11px', textAlign: 'left', cursor: 'pointer', borderRadius: COLOR.radius
                  }}
                >
                  {mName}
                </button>
              ))}
            </div>
          )}

          {modoDibujar && puntosPoligono.length > 0 && (
            <button
              onClick={finalizarDibujoLote}
              style={{ backgroundColor: COLOR.green, color: '#fff', border: 'none', padding: '6px 10px', borderRadius: COLOR.radius, fontSize: '11px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}
            >
              Finalizar Lote ({puntosPoligono.length} pts)
            </button>
          )}

          {modoDibujar && puntosPoligono.length > 0 && (
            <button
              onClick={() => setPuntosPoligono(prev => prev.slice(0, -1))}
              style={{ backgroundColor: COLOR.panel, color: COLOR.text, border: `1px solid ${COLOR.border}`, padding: '6px 10px', borderRadius: COLOR.radius, fontSize: '11px', cursor: 'pointer' }}
            >
              Deshacer punto
            </button>
          )}
        </div>

        {/* MAPA PRINCIPAL LEAFLET */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}>
          <MapContainer ref={mapInstanceRef} center={[-28.42, -65.77]} zoom={11} style={{ height: '100%', width: '100%', background: '#0c0f14' }} zoomControl={false}>
            <ControllerCentradoMapa destino={centroMapa} />
            <ManejadorEventosMapa onClick={manejarClickMapa} />

            <TileLayer url={MAPAS_BASE[mapaBaseActual]} key={mapaBaseActual} maxZoom={20} />
            {urlCapaIndice && <TileLayer url={urlCapaIndice} key={urlCapaIndice} />}
            {zonasCalculadas && urlCapaAmbientacion && (
              <TileLayer
                url={rellenosActivos ? urlCapaAmbientacion : (urlCapaBordes || urlCapaAmbientacion)}
                opacity={rellenosActivos ? (opacidadAmbientacion / 100.0) : 1.0}
                key={`${urlCapaAmbientacion}_${rellenosActivos}_${opacidadAmbientacion}`}
              />
            )}

            {/* Lote en dibujo: siempre cerrado (polígono) */}
            {puntosPoligono.length > 1 && (
              <Polygon
                positions={puntosPoligono}
                pathOptions={{ color: '#2563eb', weight: 2, dashArray: '4, 4', fillColor: '#2563eb', fillOpacity: 0.12, interactive: false }}
              />
            )}
            {puntosPoligono.map((pt, idx) => <CircleMarker key={`draw_${idx}`} center={pt} radius={4} pathOptions={{ color: '#2563eb', fillColor: '#ffffff', fillOpacity: 1 }} />)}

            {puntosMedicion.length > 0 && <Polyline positions={puntosMedicion} pathOptions={{ color: '#f59e0b', weight: 2 }} />}
            {puntosMedicion.map((pt, idx) => <CircleMarker key={`med_${idx}`} center={pt} radius={4} pathOptions={{ color: '#f59e0b', fillColor: '#ffffff', fillOpacity: 1 }} />)}

            {loteActual && (loteActual.contornos || []).map((c, i) => (
              <Polygon key={`${loteActual.id}_${i}`} positions={c} pathOptions={{ color: '#ffffff', weight: 1.5, fillColor: 'transparent', interactive: false }} />
            ))}

            {posicionPixelInfo && (
              <Popup key={posicionPixelInfo.join(',')} position={posicionPixelInfo}>
                <div style={{ fontSize: '11px', color: '#111', minWidth: '130px' }}>
                  <div style={{ fontWeight: 600, marginBottom: '2px' }}>{modoViz}</div>
                  {cargandoPixel && <div>Leyendo…</div>}
                  {datosPixel?.error && <div>{datosPixel.error}</div>}
                  {datosPixel && !datosPixel.error && (
                    Object.keys(datosPixel.valores || {}).length > 0
                      ? Object.entries(datosPixel.valores).map(([k, v]) => <div key={k}>{k}: {v}</div>)
                      : <div>Sin dato (nube o sombra)</div>
                  )}
                  <div style={{ color: '#666', marginTop: '3px' }}>{posicionPixelInfo[0].toFixed(5)}, {posicionPixelInfo[1].toFixed(5)}</div>
                </div>
              </Popup>
            )}

            {puntoTendencia && <CircleMarker center={puntoTendencia} radius={6} pathOptions={{ color: '#ffffff', fillColor: COLOR.green, fillOpacity: 1 }} />}
          </MapContainer>
        </div>

        {urlCapaIndice && <LeyendaIndice titulo={modoViz} vis={visActual} bottom={panelDesplegado ? '150px' : '30px'} />}

        {puntosMedicion.length > 0 && (
          <div style={{ position: 'absolute', top: '52px', left: '16px', zIndex: 1000, backgroundColor: COLOR.panel, border: `1px solid ${COLOR.border}`, borderRadius: COLOR.radius, padding: '5px 8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: COLOR.text, boxShadow: '0 4px 12px rgba(0,0,0,0.45)' }}>
            <span>Distancia: <b>{formatoDistancia(distanciaTotalM(puntosMedicion))}</b></span>
            <button onClick={() => setPuntosMedicion(prev => prev.slice(0, -1))} style={{ background: 'transparent', border: 'none', color: COLOR.textDim, cursor: 'pointer', fontSize: '10px' }}>Deshacer</button>
            <button onClick={() => setPuntosMedicion([])} style={{ background: 'transparent', border: 'none', color: COLOR.accent, cursor: 'pointer', fontSize: '10px' }}>Limpiar</button>
          </div>
        )}

        {/* CARRUSEL INFERIOR DE ÍNDICES */}
        <div style={{ position: 'absolute', bottom: panelDesplegado ? 0 : '-110px', left: 0, right: 0, height: '135px', backgroundColor: COLOR.panelAlt, borderTop: `1px solid ${COLOR.border}`, display: 'flex', flexDirection: 'column', zIndex: 1000, transition: 'bottom 0.25s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 14px', borderBottom: `1px solid ${COLOR.borderSoft}` }}>
            <div style={{ display: 'flex', gap: '14px', fontSize: '11px', fontWeight: '500', color: COLOR.textDim }}>
              {["TODAS LAS CAPAS", "AGRICULTURA", "SILVICULTURA"].map((tab) => (
                <span key={tab} onClick={() => setPestañaCapa(tab)} style={{ color: pestañaCapa === tab ? COLOR.text : COLOR.textFaint, cursor: 'pointer', borderBottom: pestañaCapa === tab ? `2px solid ${COLOR.accent}` : '2px solid transparent', paddingBottom: '2px' }}>{tab}</span>
              ))}
            </div>
            <button onClick={() => setPanelDesplegado(!panelDesplegado)} style={{ backgroundColor: COLOR.panel, border: `1px solid ${COLOR.border}`, color: COLOR.textDim, padding: '2px 6px', borderRadius: COLOR.radius, fontSize: '10px', cursor: 'pointer' }}>
              {panelDesplegado ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>

          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 14px', overflowX: 'auto' }}>
            {CAPAS_CAROUSEL
              .filter(capa => pestañaCapa === "TODAS LAS CAPAS" || capa.categoria === pestañaCapa)
              .map((capa) => {
                const activa = modoViz === capa.id;
                return (
                  <div
                    key={capa.id}
                    onClick={() => (loteActual?.escenaSeleccionada ? seleccionarEscena(loteActual.escenaSeleccionada, capa.id) : avisar('Selecciona una escena en "Imágenes abiertas" para aplicar una capa.', 'info'))}
                    style={{ position: 'relative', width: '100px', height: '80px', borderRadius: COLOR.radius, overflow: 'hidden', border: `2px solid ${activa ? COLOR.accent : COLOR.borderSoft}`, backgroundColor: '#000', flexShrink: 0, cursor: 'pointer' }}
                  >
                    <img
                      src={capa.thumbLocal}
                      alt={capa.nombre}
                      onError={(e) => { e.target.onerror = null; e.target.src = placeholderSvg(capa.nombre); }}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.35)' }}
                    />
                    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '10px 3px 3px', background: 'linear-gradient(to top, rgba(9,12,16,0.92), rgba(9,12,16,0))', color: COLOR.text, fontSize: '10px', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {capa.nombre}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

      </div>

      {/* VENTANA FLOTANTE "MÁS INFO" (fuera de la tarjeta, no tapa su contenido) */}
      {infoHover && (() => {
        const filas = detallesEscena(infoHover.escena);
        if (filas.length === 0) return null;
        return (
          <div style={{ position: 'fixed', left: infoHover.left, top: infoHover.top, width: '220px', boxSizing: 'border-box', padding: '10px 11px', backgroundColor: '#06090d', border: `1px solid ${COLOR.border}`, borderRadius: '4px', boxShadow: '0 8px 24px rgba(0,0,0,0.6)', zIndex: 3500, pointerEvents: 'none' }}>
            <div style={{ marginBottom: '7px', color: '#fff', fontSize: '11px', fontWeight: 600 }}>Imagen abierta</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '10px', lineHeight: '14px', color: COLOR.textDim }}>
              {filas.map(([k, v]) => (
                <div key={k}><strong style={{ color: '#dfe4eb' }}>{k}:</strong> {v}</div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* MODAL DE DESCARGA DE BANDAS */}
      {modalDescargaAbierto && escenaModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
          zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            width: '420px', backgroundColor: COLOR.panel, border: `1px solid ${COLOR.border}`,
            borderRadius: COLOR.radius, padding: '18px', boxShadow: '0 12px 40px rgba(0,0,0,0.8)',
            display: 'flex', flexDirection: 'column', gap: '14px', color: COLOR.text
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${COLOR.borderSoft}`, paddingBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: '600' }}>Descarga de Escena Satelital Completa</span>
              <button onClick={cerrarModalDescarga} style={{ background: 'transparent', border: 'none', color: COLOR.textDim, cursor: 'pointer', fontSize: '14px' }}>✕</button>
            </div>

            <div style={{ display: 'flex', gap: '12px', backgroundColor: COLOR.panelAlt, padding: '10px', borderRadius: COLOR.radius, border: `1px solid ${COLOR.borderSoft}` }}>
              <img src={escenaModal.thumb || placeholderSvg("sin miniatura")} alt="miniatura" style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '2px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontWeight: '600', color: COLOR.text }}>Fecha: {escenaModal.fecha}</span>
                <span style={{ color: COLOR.textDim }}>Satélite: {escenaModal.satelite}</span>
                <span style={{ color: COLOR.textDim }}>Nubosidad: {escenaModal.nubosidad}%</span>
                {loteActual && <span style={{ color: COLOR.green }}>Lote: {loteActual.nombre} ({loteActual.superficieHa} ha)</span>}
              </div>
            </div>

            <div style={{ fontSize: '11px', color: COLOR.textDim, lineHeight: '1.5' }}>
              Se descarga el producto original completo de Copernicus (todas las bandas a su resolución nativa, sin recortar).
              Es un archivo grande (cerca de 1 GB): primero se prepara en el servidor y después aparece el botón para guardarlo.
            </div>

            {trabajo && (
              <div style={{ backgroundColor: COLOR.panelAlt, border: `1px solid ${COLOR.borderSoft}`, borderRadius: COLOR.radius, padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '11px', color: trabajo.estado === 'error' ? '#f87171' : COLOR.text }}>
                  {trabajo.estado === 'en_cola' && 'En cola…'}
                  {trabajo.estado === 'buscando' && 'Buscando la escena en Copernicus…'}
                  {trabajo.estado === 'descargando' && `Descargando en el servidor… ${trabajo.mb} MB${trabajo.mb_total ? ` de ${trabajo.mb_total} MB` : ''}`}
                  {trabajo.estado === 'listo' && `Lista para guardar (${trabajo.mb_total || trabajo.mb} MB).`}
                  {trabajo.estado === 'error' && (trabajo.error || 'Ocurrió un error.')}
                </div>
                {(trabajo.estado === 'descargando' || trabajo.estado === 'listo') && (
                  <div style={{ height: '4px', backgroundColor: COLOR.border, borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${trabajo.progreso || 0}%`, backgroundColor: trabajo.estado === 'listo' ? COLOR.green : COLOR.accent, transition: 'width 0.4s ease' }} />
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button
                onClick={cerrarModalDescarga}
                style={{ backgroundColor: COLOR.panelAlt, border: `1px solid ${COLOR.border}`, color: COLOR.textDim, padding: '7px 12px', borderRadius: COLOR.radius, cursor: 'pointer', fontSize: '11px' }}
              >
                Cerrar
              </button>
              {trabajo?.estado === 'listo' ? (
                <a
                  href={`${API_BASE_URL}/descargas/${trabajo.id}/archivo`}
                  style={{ backgroundColor: COLOR.green, color: '#fff', textDecoration: 'none', padding: '7px 14px', borderRadius: COLOR.radius, fontWeight: '600', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <IconDescargas /> Guardar archivo
                </a>
              ) : (
                <button
                  disabled={['en_cola', 'buscando', 'descargando'].includes(trabajo?.estado)}
                  onClick={iniciarDescargaEscena}
                  style={{ backgroundColor: COLOR.accent, color: '#fff', border: 'none', padding: '7px 14px', borderRadius: COLOR.radius, fontWeight: '600', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', opacity: ['en_cola', 'buscando', 'descargando'].includes(trabajo?.estado) ? 0.6 : 1 }}
                >
                  <IconDescargas /> {trabajo?.estado === 'error' ? 'Reintentar' : 'Preparar descarga'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
