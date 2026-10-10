const INDICES = ['RGB Clásico', 'Infrarrojo Color', 'Agricultura', 'Tierra/Agua', 'NDVI', 'NDWI', 'SAVI', 'NBR'];

/** Control satelital reutilizable; recibe estado para integrarse con el panel de imágenes existente. */
export default function SatelliteControl({ index, onIndexChange, startDate, onStartDateChange, endDate, onEndDateChange }) {
  return <div className="feature-control satellite-control">
    <label>Composición o índice<select value={index} onChange={(event) => onIndexChange?.(event.target.value)}>
      {INDICES.map((item) => <option key={item} value={item}>{item}</option>)}
    </select></label>
    <div className="feature-control-dates">
      <label>Desde<input type="date" value={startDate ?? ''} onChange={(event) => onStartDateChange?.(event.target.value)} /></label>
      <label>Hasta<input type="date" value={endDate ?? ''} onChange={(event) => onEndDateChange?.(event.target.value)} /></label>
    </div>
  </div>;
}
