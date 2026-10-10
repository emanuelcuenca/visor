/** Contenedor reutilizable para el mapa Leaflet y sus controles superpuestos. */
export default function MapView({ children, className = 'gs-main' }) {
  return <main className={className}>{children}</main>;
}
