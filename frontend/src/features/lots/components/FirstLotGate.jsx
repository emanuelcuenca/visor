const HERRAMIENTAS = ['Imágenes', 'Índices', 'Zonas de manejo', 'Evolución', 'Capas', 'Descargas'];

/** Pantalla completa obligatoria cuando no hay lotes. La barra superior no se muestra hasta elegir una opción. */
export default function FirstLotGate({ onImport, onDraw, onLogout }) {
  return (
    <div className="gx-gate" role="dialog" aria-modal="true" aria-labelledby="gx-gate-title">
      <div className="gx-gate-card">
        <div className="gx-brand"><span className="gx-logo" aria-hidden="true">◆</span>GeoSat</div>
        <h1 id="gx-gate-title">Creá tu primer lote</h1>
        <p className="gx-muted">GeoSat trabaja siempre sobre un lote. Necesitás al menos uno para empezar.</p>
        <div className="gx-gate-options">
          <button className="gx-option" onClick={onImport}>
            <strong>Importar un archivo</strong>
            <span>GeoJSON, KML/KMZ o Shapefile en .zip.</span>
          </button>
          <button className="gx-option" onClick={onDraw}>
            <strong>Dibujar en el mapa</strong>
            <span>Al elegir esta opción vas a poder buscar una localidad o coordenadas para ubicarte antes de dibujar.</span>
          </button>
        </div>
        <div className="gx-muted gx-gate-sub">Se habilita al crear tu lote</div>
        <div className="gx-locked">{HERRAMIENTAS.map((h) => <span key={h}>{h}</span>)}</div>
        {onLogout && <button className="gx-linkbtn" onClick={onLogout}>Cerrar sesión</button>}
      </div>
    </div>
  );
}