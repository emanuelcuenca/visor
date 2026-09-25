import React, { useState, useRef } from 'react';
import { MapContainer, TileLayer, useMapEvents, useMap, Polygon, Polyline, CircleMarker } from 'react-leaflet';
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

const API_BASE_URL = 'http://127.0.0.1:8000/api';

const MAPAS_BASE = {
  "Google Satélite": "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
  "Esri Satélite HD": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  "OpenStreetMap": "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  "CartoDB Oscuro": "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
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

const calcularAreaGeoJSONHa = (geojson) => {
  try {
    if (!geojson || !geojson.features || !geojson.features[0]) return 0;
    const geom = geojson.features[0].geometry;
    if (geom.type !== "Polygon") return 0;
    const coords = geom.coordinates[0];
    let area = 0;
    const n = coords.length;
    if (n < 3) return 0;
    for (let i = 0; i < n - 1; i++) {
      const p1 = coords[i];
      const p2 = coords[i + 1];
      area += (p2[0] - p1[0]) * (p2[1] + p1[1]);
    }
    area = Math.abs(area / 2.0);
    const latPromedio = coords[0][1] * (Math.PI / 180);
    const m2 = area * 111320 * (111320 * Math.cos(latPromedio));
    return (m2 / 10000.0).toFixed(1);
  } catch (e) {
    return 0;
  }
};

function ManejadorEventosMapa({ modoIdentificar, modoMedir, modoDibujar, escenaSeleccionada, modoViz, setDatosPixel, setCargandoPixel, setPuntosMedicion, setPuntosPoligono, setCentroMapa, setPosicionPixelInfo }) {
  useMapEvents({
    click: async (e) => {
      setCentroMapa(null);
      if (modoDibujar) {
        setPuntosPoligono(prev => [...prev, [e.latlng.lat, e.latlng.lng]]);
        return;
      }
      if (modoMedir) {
        setPuntosMedicion(prev => [...prev, [e.latlng.lat, e.latlng.lng]]);
        return;
      }
      if (modoIdentificar && escenaSeleccionada) {
        const coords = [e.latlng.lat, e.latlng.lng];
        setPosicionPixelInfo(coords);
        setCargandoPixel(true);
        setDatosPixel(null);
        try {
          const res = await axios.post(`${API_BASE_URL}/identificar-pixel`, {
            escena_id: escenaSeleccionada.id,
            lat: e.latlng.lat,
            lng: e.latlng.lng,
            indice: modoViz
          });
          setDatosPixel(res.data);
        } catch (err) {
          setDatosPixel({ error: "Error de lectura" });
        } finally {
          setCargandoPixel(false);
        }
      }
    }
  });
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

function ControllerCentradoMapa({ centro }) {
  const map = useMap();
  if (centro) map.flyTo(centro, 13);
  return null;
}

export default function App() {
  const fileInputRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const fechasDefecto = obtenerFechasDefecto();

  const [dockExpanded, setDockExpanded] = useState(false);
  const [seccionActiva, setSeccionActiva] = useState('imagenes');

  const [lotes, setLotes] = useState([]);
  const [loteActivoId, setLoteActivoId] = useState(null);

  const [modoViz, setModoViz] = useState("RGB Clásico");
  const [pestañaCapa, setPestañaCapa] = useState("TODAS LAS CAPAS");
  const [urlCapaIndice, setUrlCapaIndice] = useState(null);
  const [urlCapaAmbientacion, setUrlCapaAmbientacion] = useState(null);
  const [urlCapaBordes, setUrlCapaBordes] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [descargandoRaster, setDescargandoRaster] = useState(false);
  const [mapaBaseActual, setMapaBaseActual] = useState("Google Satélite");

  const [inputBusqueda, setInputBusqueda] = useState("");
  const [centroMapa, setCentroMapa] = useState(null);
  const [panelDesplegado, setPanelDesplegado] = useState(true);

  const [fechaInicio, setFechaInicio] = useState(fechasDefecto.inicio);
  const [fechaFin, setFechaFin] = useState(fechasDefecto.fin);
  const [nubosidadMax, setNubosidadMax] = useState(20.0);
  const [subtildesActivas, setSubtildesActivas] = useState(["S2A_L2A", "S2B_L2A", "L8_T1", "L9_T1"]);

  const [mostrarFiltrosBusqueda, setMostrarFiltrosBusqueda] = useState(true);

  const [mostrarPanelResultadosZonas, setMostrarPanelResultadosZonas] = useState(false);
  const [zonasCalculadas, setZonasCalculadas] = useState(false);
  const [indiceOrigen, setIndiceOrigen] = useState(null);

  const [indiceAmbientacion, setIndiceAmbientacion] = useState("NDVI");
  const [clasesAmbientacion, setClasesAmbientacion] = useState(3);
  const [superficieMinM2, setSuperficieMinM2] = useState(2000);
  const [rellenosActivos, setRellenosActivos] = useState(true);
  const [opacidadAmbientacion, setOpacidadAmbientacion] = useState(80);
  const [unidadMetrica, setUnidadMetrica] = useState("ha");

  const [modoIdentificar, setModoIdentificar] = useState(false);
  const [modoMedir, setModoMedir] = useState(false);
  const [modoDibujar, setModoDibujar] = useState(false);

  const [puntosMedicion, setPuntosMedicion] = useState([]);
  const [puntosPoligono, setPuntosPoligono] = useState([]);
  const [datosPixel, setDatosPixel] = useState(null);
  const [posicionPixelInfo, setPosicionPixelInfo] = useState(null);
  const [cargandoPixel, setCargandoPixel] = useState(false);

  const [mostrarMenuMapas, setMostrarMenuMapas] = useState(false);

  // --- ESTADOS PARA MODAL DE DESCARGA DE ESCENA COMPLETA (BANDAS) ---
  const [modalDescargaAbierto, setModalDescargaAbierto] = useState(false);
  const [escenaModal, setEscenaModal] = useState(null);
  const [bandasSeleccionadas, setBandasSeleccionadas] = useState([]);

  const loteActual = lotes.find(l => l.id === loteActivoId) || null;

  const toggleSubtilde = (subId) => {
    setSubtildesActivas(prev => prev.includes(subId) ? prev.filter(id => id !== subId) : [...prev, subId]);
  };

  const seleccionarLote = (id) => {
    setLoteActivoId(id);
    const l = lotes.find(item => item.id === id);
    if (l) {
      setUrlCapaIndice(l.tileUrl || null);
      if (l.puntosCoords && l.puntosCoords.length > 0) setCentroMapa(l.puntosCoords[0]);
    }
  };

  const eliminarLote = (id, e) => {
    e.stopPropagation();
    const nuevosLotes = lotes.filter(l => l.id !== id);
    setLotes(nuevosLotes);
    if (loteActivoId === id) {
      if (nuevosLotes.length > 0) {
        setLoteActivoId(nuevosLotes[0].id);
        setUrlCapaIndice(nuevosLotes[0].tileUrl || null);
      } else {
        setLoteActivoId(null);
        setUrlCapaIndice(null);
      }
    }
  };

  const buscarEscenas = async () => {
    if (!loteActual) {
      alert("Por favor delimita o sube un lote primero.");
      return;
    }
    setCargando(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/buscar-escenas`, {
        geojson: loteActual.geojson,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        nubosidad_max: parseFloat(nubosidadMax),
        sensores: subtildesActivas
      });

      const escenasObtenidas = res.data.escenas || [];
      setLotes(prev => prev.map(l => l.id === loteActivoId ? { ...l, escenas: escenasObtenidas, escenaSeleccionada: null } : l));
      setUrlCapaIndice(null);
    } catch (err) {
      alert("Error buscando escenas satelitales.");
    } finally {
      setCargando(false);
    }
  };

  const seleccionarEscena = async (escenaObj, modo = modoViz) => {
    if (!loteActual) return;
    setModoViz(modo);
    if (zonasCalculadas && modo !== indiceOrigen) {
      restablecerAmbientacion();
    }
    setCargando(true);
    try {
      const resCapa = await axios.post(`${API_BASE_URL}/obtener-capa`, {
        escena_id: escenaObj.id,
        modo_viz: modo,
        geojson: loteActual.geojson
      });
      setUrlCapaIndice(resCapa.data.tile_url);
      setLotes(prev => prev.map(l => l.id === loteActivoId ? { ...l, escenaSeleccionada: escenaObj, tileUrl: resCapa.data.tile_url } : l));
    } catch (err) {
      console.error(err);
    } finally {
      setCargando(false);
    }
  };

  {/* FUNCIONALIDAD MODAL DESCARGA ESCENA COMPLETA */}
  const abrirModalDescargaEscena = (escenaObj, e) => {
    e.stopPropagation();
    setEscenaModal(escenaObj);
    const esLandsat = escenaObj.satelite && escenaObj.satelite.toLowerCase().includes('landsat');
    const familia = esLandsat ? "Landsat" : "Sentinel-2";
    const listaInicial = BANDAS_DISPONIBLES[familia].map(b => b.id);
    setBandasSeleccionadas(listaInicial);
    setModalDescargaAbierto(true);
  };

  const toggleBandaModal = (bandaId) => {
    setBandasSeleccionadas(prev =>
      prev.includes(bandaId) ? prev.filter(b => b !== bandaId) : [...prev, bandaId]
    );
  };

  const toggleTodasBandasModal = (todas) => {
    if (!escenaModal) return;
    const esLandsat = escenaModal.satelite && escenaModal.satelite.toLowerCase().includes('landsat');
    const familia = esLandsat ? "Landsat" : "Sentinel-2";
    if (todas) {
      setBandasSeleccionadas(BANDAS_DISPONIBLES[familia].map(b => b.id));
    } else {
      setBandasSeleccionadas([]);
    }
  };

  const ejecutarDescargaEscenaBandas = async () => {
    if (!escenaModal || !loteActual) return;
    if (bandasSeleccionadas.length === 0) {
      alert("Selecciona al menos una banda para descargar.");
      return;
    }
    setDescargandoRaster(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/descargar-escena-bandas`, {
        escena_id: escenaModal.id,
        bandas: bandasSeleccionadas,
        geojson: loteActual.geojson
      }, { responseType: 'blob' });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${loteActual.nombre}_${escenaModal.satelite}_${escenaModal.fecha}_bandas.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setModalDescargaAbierto(false);
    } catch (err) {
      alert("Error al descargar la escena multibanda.");
    } finally {
      setDescargandoRaster(false);
    }
  };

  {/* FUNCIÓN DE DESCARGA RASTER NATIVA A RESOLUCIÓN ORIGINAL */}
  const descargarIndiceOriginal = async (formato = 'geotiff') => {
    if (!loteActual || !loteActual.escenaSeleccionada) {
      alert("Selecciona una escena e índice para descargar.");
      return;
    }
    setDescargandoRaster(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/descargar-raster`, {
        escena_id: loteActual.escenaSeleccionada.id,
        modo_viz: modoViz,
        geojson: loteActual.geojson,
        formato: formato
      }, { responseType: 'blob' });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const extension = formato === 'geotiff' ? 'tif' : 'png';
      link.setAttribute('download', `${loteActual.nombre}_${modoViz}_${loteActual.escenaSeleccionada.fecha}.${extension}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert("Error al descargar la capa raster en resolución nativa.");
    } finally {
      setDescargandoRaster(false);
    }
  };

  const ejecutarAmbientacion = async () => {
    if (!loteActual || !loteActual.escenaSeleccionada) {
      alert("Selecciona primero una escena satelital.");
      return;
    }
    setCargando(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/clusterizar-lote`, {
        escena_id: loteActual.escenaSeleccionada.id,
        indice: indiceAmbientacion,
        num_clusters: parseInt(clasesAmbientacion),
        superficie_min_m2: parseFloat(superficieMinM2),
        geojson: loteActual.geojson
      });

      setUrlCapaAmbientacion(res.data.tile_url);
      setUrlCapaBordes(res.data.border_tile_url);
      setLotes(prev => prev.map(l => l.id === loteActivoId ? { ...l, leyendaClusters: res.data.zonas || [] } : l));
      setZonasCalculadas(true);
      setIndiceOrigen(indiceAmbientacion);
      setMostrarPanelResultadosZonas(true);
    } catch (err) {
      alert("Error procesando las Zonas de Manejo.");
    } finally {
      setCargando(false);
    }
  };

  const restablecerAmbientacion = () => {
    setClasesAmbientacion(3);
    setSuperficieMinM2(2000);
    setUrlCapaAmbientacion(null);
    setUrlCapaBordes(null);
    setZonasCalculadas(false);
    setIndiceOrigen(null);
    setMostrarPanelResultadosZonas(false);
  };

  const manejarCargaArchivo = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      let geojsonResultado = file.name.endsWith('.zip') ? await shp(await file.arrayBuffer()) : JSON.parse(await file.text());
      let featureCollection = Array.isArray(geojsonResultado) ? geojsonResultado[0] : geojsonResultado;
      if (featureCollection.type !== "FeatureCollection") featureCollection = { type: "FeatureCollection", features: [featureCollection] };

      const areaCalculada = calcularAreaGeoJSONHa(featureCollection);
      const geom = featureCollection.features[0].geometry;
      let coordsLeaflet = geom.type === "Polygon" ? geom.coordinates[0].map(c => [c[1], c[0]]) : [];

      const nuevoLote = {
        id: `lote_${Date.now()}`,
        nombre: file.name,
        origen: "Archivo Subido",
        superficieHa: areaCalculada,
        geojson: featureCollection,
        puntosCoords: coordsLeaflet,
        escenas: [],
        escenaSeleccionada: null,
        leyendaClusters: [],
        tileUrl: null
      };

      setLotes(prev => [...prev, nuevoLote]);
      setLoteActivoId(nuevoLote.id);
      setUrlCapaIndice(null);
      if (coordsLeaflet.length > 0) setCentroMapa(coordsLeaflet[0]);
    } catch (err) {
      alert("Error al cargar archivo vectorial.");
    }
  };

  const finalizarDibujoLote = () => {
    if (puntosPoligono.length < 3) {
      alert("Debes marcar al menos 3 puntos en el mapa.");
      return;
    }
    const coordsGeoJSON = [...puntosPoligono, puntosPoligono[0]].map(p => [p[1], p[0]]);
    const featureCollection = {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [coordsGeoJSON] },
        properties: {}
      }]
    };
    const area = calcularAreaGeoJSONHa(featureCollection);
    const nuevoLote = {
      id: `lote_${Date.now()}`,
      nombre: `Lote ${lotes.length + 1}`,
      origen: "Dibujado",
      superficieHa: area,
      geojson: featureCollection,
      puntosCoords: puntosPoligono,
      escenas: [],
      escenaSeleccionada: null,
      leyendaClusters: [],
      tileUrl: null
    };
    setLotes(prev => [...prev, nuevoLote]);
    setLoteActivoId(nuevoLote.id);
    setPuntosPoligono([]);
    setModoDibujar(false);
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', height: '100vh', width: '100vw', backgroundColor: COLOR.bg, overflow: 'hidden', fontFamily: "'Inter', 'Roboto', system-ui, -apple-system, sans-serif", fontSize: '12px', lineHeight: '1.4', letterSpacing: '-0.01em' }}>

      <input type="file" ref={fileInputRef} onChange={manejarCargaArchivo} accept=".zip,.geojson,.json" style={{ display: 'none' }} />

      {/* 1. DOCK DESPLEGABLE CON ÍCONOS MONOCROMÁTICOS */}
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
            onClick={() => setSeccionActiva('imagenes')}
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
            onClick={() => setSeccionActiva('ambientacion')}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', borderRadius: COLOR.radius,
              backgroundColor: seccionActiva === 'ambientacion' ? COLOR.cardActiveBg : 'transparent',
              color: seccionActiva === 'ambientacion' ? '#ffffff' : COLOR.textDim, cursor: 'pointer'
            }}
          >
            <IconZonas />
            {dockExpanded && <span style={{ fontSize: '12px', fontWeight: '400' }}>Zonas de vegetación</span>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', color: COLOR.textFaint, cursor: 'not-allowed' }}>
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

      {/* 2. PANEL SECUNDARIO ADYACENTE */}
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
                  justify: 'space-between', cursor: 'pointer'
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
                    <label style={{ fontSize: '11px', color: COLOR.textDim, display: 'block', marginBottom: '3px' }}>Nubosidad Máxima: {nubosidadMax}%</label>
                    <input type="range" min="0" max="100" value={nubosidadMax} onChange={(e) => setNubosidadMax(e.target.value)} style={{ width: '100%', accentColor: COLOR.accent }} />
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

            {/* LISTADO DE RESULTADOS DE ESCENAS Y OPCIONES DE DESCARGA */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {loteActual && loteActual.escenas.map((e) => {
                const estaSeleccionada = loteActual.escenaSeleccionada?.id === e.id;
                return (
                  <div
                    key={e.id}
                    onClick={() => seleccionarEscena(e, modoViz)}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px', borderRadius: COLOR.radius,
                      backgroundColor: estaSeleccionada ? COLOR.cardActiveBg : COLOR.cardBg,
                      border: `1px solid ${estaSeleccionada ? COLOR.accent : COLOR.borderSoft}`, cursor: 'pointer',
                      position: 'relative'
                    }}
                  >
                    {/* BOTÓN ICONO DESCARGA ESCENA COMPLETA EN ESQUINA SUPERIOR DERECHA */}
                    <button
                      title="Descargar bandas de la escena completa"
                      onClick={(evt) => abrirModalDescargaEscena(e, evt)}
                      style={{
                        position: 'absolute', top: '6px', right: '6px',
                        backgroundColor: COLOR.panel, border: `1px solid ${COLOR.border}`,
                        color: COLOR.textDim, width: '24px', height: '24px',
                        borderRadius: COLOR.radius, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', cursor: 'pointer', zIndex: 2
                      }}
                      onMouseEnter={(el) => el.currentTarget.style.color = COLOR.accent}
                      onMouseLeave={(el) => el.currentTarget.style.color = COLOR.textDim}
                    >
                      <IconDescargas />
                    </button>

                    <div style={{ display: 'flex', gap: '10px' }}>
                      <img src={e.thumb} alt="thumb" style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '2px' }} />
                      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2px', paddingRight: '20px' }}>
                        <span style={{ color: COLOR.text, fontSize: '12px', fontWeight: '600' }}>{e.fecha}</span>
                        <span style={{ color: COLOR.textDim, fontSize: '11px' }}>Nubosidad: {e.nubosidad}%</span>
                        <span style={{ color: COLOR.textDim, fontSize: '11px' }}>{e.satelite}</span>
                      </div>
                    </div>

                    {/* LUGAR IDEAL PARA LAS OPCIONES DE DESCARGA DE LA ESCENA CALCULADA */}
                    {estaSeleccionada && (
                      <div style={{ marginTop: '4px', paddingTop: '6px', borderTop: `1px solid ${COLOR.borderSoft}`, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ fontSize: '10px', color: COLOR.textDim, fontWeight: '500' }}>
                          DESCARGAR {modoViz.toUpperCase()} (RESOLUCIÓN ORIGINAL):
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            disabled={descargandoRaster}
                            onClick={(e) => { e.stopPropagation(); descargarIndiceOriginal('geotiff'); }}
                            style={{ flex: 1, backgroundColor: COLOR.panel, border: `1px solid ${COLOR.border}`, color: COLOR.text, borderRadius: COLOR.radius, padding: '4px', fontSize: '10px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                          >
                            <IconDescargas /> GeoTIFF
                          </button>
                          <button
                            disabled={descargandoRaster}
                            onClick={(e) => { e.stopPropagation(); descargarIndiceOriginal('png'); }}
                            style={{ flex: 1, backgroundColor: COLOR.panel, border: `1px solid ${COLOR.border}`, color: COLOR.text, borderRadius: COLOR.radius, padding: '4px', fontSize: '10px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                          >
                            <IconDescargas /> PNG HD
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {seccionActiva === 'ambientacion' && (
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
                <label style={{ fontSize: '11px', color: COLOR.textDim, display: 'block', marginBottom: '3px' }}>Opacidad: {opacidadAmbientacion}%</label>
                <input type="range" min="10" max="100" value={opacidadAmbientacion} onChange={(e) => setOpacidadAmbientacion(e.target.value)} style={{ width: '100%', accentColor: COLOR.accent }} />
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
      </aside>

      {/* 3. VISUALIZADOR DE MAPA Y CAPAS */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', width: '100%', height: '100%' }}>

        {/* BUSCADOR */}
        <div style={{ position: 'absolute', top: '12px', left: '16px', zIndex: 1000, backgroundColor: COLOR.panel, borderRadius: COLOR.radius, border: `1px solid ${COLOR.border}`, display: 'flex', alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.45)', overflow: 'hidden' }}>
          <input
            type="text" placeholder="Ubicación o coordenadas..." value={inputBusqueda} onChange={(e) => setInputBusqueda(e.target.value)}
            style={{ background: 'transparent', border: 'none', color: COLOR.text, fontSize: '11px', width: '220px', outline: 'none', padding: '6px 10px' }}
          />
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
        {mostrarPanelResultadosZonas && loteActual && loteActual.leyendaClusters && (
          <div style={{ position: 'absolute', top: '70px', right: '16px', width: '190px', zIndex: 1000, backgroundColor: 'rgba(18, 23, 32, 0.96)', border: `1px solid ${COLOR.border}`, borderRadius: COLOR.radius, padding: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${COLOR.borderSoft}`, paddingBottom: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: '600', color: COLOR.text }}>Zonas de Manejo</span>
              <button onClick={() => setMostrarPanelResultadosZonas(false)} style={{ background: 'transparent', border: 'none', color: COLOR.textDim, cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ display: 'flex', border: `1px solid ${COLOR.border}`, borderRadius: COLOR.radius, overflow: 'hidden', alignSelf: 'center' }}>
              {['m', 'ha', '%'].map((unit) => (
                <button key={unit} onClick={() => setUnidadMetrica(unit)} style={{ backgroundColor: unidadMetrica === unit ? COLOR.accent : COLOR.panelAlt, color: unidadMetrica === unit ? '#fff' : COLOR.textDim, border: 'none', padding: '2px 8px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}>{unit}</button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {loteActual.leyendaClusters.map((z) => (
                <div key={z.zona} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLOR.panelAlt, border: `1px solid ${COLOR.borderSoft}`, padding: '5px 8px', borderRadius: COLOR.radius }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: z.color }} />
                    <span style={{ fontSize: '11px', color: COLOR.text }}>{z.etiqueta}</span>
                  </div>
                  <span style={{ fontSize: '11px', color: COLOR.green, fontWeight: '600' }}>
                    {unidadMetrica === 'm' ? `${z.m2} m²` : unidadMetrica === 'ha' ? `${z.ha} ha` : `${z.porcentaje}%`}
                  </span>
                </div>
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
              onClick={() => {
                setModoDibujar(!modoDibujar);
                setModoIdentificar(false);
                setModoMedir(false);
              }}
              style={{ width: '32px', height: '32px', backgroundColor: modoDibujar ? COLOR.cardActiveBg : 'transparent', border: 'none', color: modoDibujar ? COLOR.accent : COLOR.textDim, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <IconDibujar />
            </button>

            <div style={{ height: '1px', backgroundColor: COLOR.borderSoft }} />

            <button
              title="Ver valor e información de píxel"
              onClick={() => {
                setModoIdentificar(!modoIdentificar);
                setModoDibujar(false);
                setModoMedir(false);
              }}
              style={{ width: '32px', height: '32px', backgroundColor: modoIdentificar ? COLOR.cardActiveBg : 'transparent', border: 'none', color: modoIdentificar ? COLOR.accent : COLOR.textDim, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <IconInfoPixel />
            </button>

            <div style={{ height: '1px', backgroundColor: COLOR.borderSoft }} />

            <button
              title="Medir distancia"
              onClick={() => {
                setModoMedir(!modoMedir);
                setModoDibujar(false);
                setModoIdentificar(false);
              }}
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
        </div>

        {/* MAPA PRINCIPAL LEAFLET */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}>
          <MapContainer ref={mapInstanceRef} center={[-28.42, -65.77]} zoom={11} style={{ height: '100%', width: '100%', background: '#0c0f14' }} zoomControl={false}>
            <ControllerCentradoMapa centro={centroMapa} />
            <ManejadorEventosMapa modoIdentificar={modoIdentificar} modoMedir={modoMedir} modoDibujar={modoDibujar} escenaSeleccionada={loteActual?.escenaSeleccionada} modoViz={modoViz} setDatosPixel={setDatosPixel} setCargandoPixel={setCargandoPixel} setPuntosMedicion={setPuntosMedicion} setPuntosPoligono={setPuntosPoligono} setCentroMapa={setCentroMapa} setPosicionPixelInfo={setPosicionPixelInfo} />

            <TileLayer url={MAPAS_BASE[mapaBaseActual]} />
            {urlCapaIndice && <TileLayer url={urlCapaIndice} key={urlCapaIndice} />}
            {zonasCalculadas && urlCapaAmbientacion && (
              <TileLayer
                url={rellenosActivos ? urlCapaAmbientacion : (urlCapaBordes || urlCapaAmbientacion)}
                opacity={rellenosActivos ? (opacidadAmbientacion / 100.0) : 1.0}
                key={`${urlCapaAmbientacion}_${rellenosActivos}_${opacidadAmbientacion}`}
              />
            )}

            {puntosPoligono.length > 0 && <Polyline positions={puntosPoligono} pathOptions={{ color: '#2563eb', weight: 2, dashArray: '4, 4' }} />}
            {puntosPoligono.map((pt, idx) => <CircleMarker key={`draw_${idx}`} center={pt} radius={4} pathOptions={{ color: '#2563eb', fillColor: '#ffffff', fillOpacity: 1 }} />)}

            {puntosMedicion.length > 0 && <Polyline positions={puntosMedicion} pathOptions={{ color: '#f59e0b', weight: 2 }} />}
            {puntosMedicion.map((pt, idx) => <CircleMarker key={`med_${idx}`} center={pt} radius={4} pathOptions={{ color: '#f59e0b', fillColor: '#ffffff', fillOpacity: 1 }} />)}

            {loteActual && loteActual.puntosCoords && loteActual.puntosCoords.length > 0 && (
              <Polygon positions={loteActual.puntosCoords} pathOptions={{ color: '#ffffff', weight: 1.5, fillColor: 'transparent' }} />
            )}
          </MapContainer>
        </div>

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
                  <div key={capa.id} onClick={() => loteActual && loteActual.escenaSeleccionada && seleccionarEscena(loteActual.escenaSeleccionada, capa.id)} style={{ width: '100px', height: '80px', borderRadius: COLOR.radius, overflow: 'hidden', border: `2px solid ${activa ? COLOR.accent : COLOR.borderSoft}`, backgroundColor: COLOR.panel, flexShrink: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ flex: 1, backgroundColor: '#000' }}>
                      <img src={capa.thumbLocal} alt={capa.nombre} onError={(e) => { e.target.src = 'https://via.placeholder.com/100x70/11151c/ffffff?text=' + capa.nombre; }} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={{ backgroundColor: activa ? COLOR.cardActiveBg : COLOR.panel, padding: '3px', color: COLOR.text, fontSize: '10px', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {capa.nombre}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

      </div>

      {/* --- VENTANA EMERGENTE (MODAL) DE DESCARGA DE BANDAS --- */}
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
              <button onClick={() => setModalDescargaAbierto(false)} style={{ background: 'transparent', border: 'none', color: COLOR.textDim, cursor: 'pointer', fontSize: '14px' }}>✕</button>
            </div>

            <div style={{ display: 'flex', gap: '12px', backgroundColor: COLOR.panelAlt, padding: '10px', borderRadius: COLOR.radius, border: `1px solid ${COLOR.borderSoft}` }}>
              <img src={escenaModal.thumb} alt="thumb" style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '2px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontWeight: '600', color: COLOR.text }}>Fecha: {escenaModal.fecha}</span>
                <span style={{ color: COLOR.textDim }}>Satélite: {escenaModal.satelite}</span>
                <span style={{ color: COLOR.textDim }}>Nubosidad: {escenaModal.nubosidad}%</span>
                {loteActual && <span style={{ color: COLOR.green }}>Lote: {loteActual.nombre} ({loteActual.superficieHa} ha)</span>}
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: '600', color: COLOR.textDim }}>SELECCIONAR BANDAS DE INTERÉS:</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => toggleTodasBandasModal(true)} style={{ background: 'transparent', border: 'none', color: COLOR.accent, fontSize: '10px', cursor: 'pointer' }}>Todas</button>
                  <button onClick={() => toggleTodasBandasModal(false)} style={{ background: 'transparent', border: 'none', color: COLOR.textDim, fontSize: '10px', cursor: 'pointer' }}>Ninguna</button>
                </div>
              </div>

              <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '4px' }}>
                {(() => {
                  const esLandsat = escenaModal.satelite && escenaModal.satelite.toLowerCase().includes('landsat');
                  const familia = esLandsat ? "Landsat" : "Sentinel-2";
                  return BANDAS_DISPONIBLES[familia].map((b) => (
                    <label key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLOR.panelAlt, border: `1px solid ${COLOR.borderSoft}`, padding: '6px 10px', borderRadius: COLOR.radius, cursor: 'pointer' }}>
                      <span style={{ fontSize: '11px', color: COLOR.text }}>{b.nombre}</span>
                      <input
                        type="checkbox"
                        checked={bandasSeleccionadas.includes(b.id)}
                        onChange={() => toggleBandaModal(b.id)}
                        style={{ accentColor: COLOR.accent }}
                      />
                    </label>
                  ));
                })()}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button
                onClick={() => setModalDescargaAbierto(false)}
                style={{ backgroundColor: COLOR.panelAlt, border: `1px solid ${COLOR.border}`, color: COLOR.textDim, padding: '7px 12px', borderRadius: COLOR.radius, cursor: 'pointer', fontSize: '11px' }}
              >
                Cancelar
              </button>
              <button
                disabled={descargandoRaster}
                onClick={ejecutarDescargaEscenaBandas}
                style={{ backgroundColor: COLOR.accent, color: '#fff', border: 'none', padding: '7px 14px', borderRadius: COLOR.radius, fontWeight: '600', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <IconDescargas /> {descargandoRaster ? 'Procesando Descarga...' : 'Descargar GeoTIFF Multibanda'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}