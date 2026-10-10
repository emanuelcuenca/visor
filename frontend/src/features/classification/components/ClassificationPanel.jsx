const METHODS = [
  { id: 'kmeans', label: 'K-Means' },
  { id: 'fuzzy_cmeans', label: 'Fuzzy C-Means' },
  { id: 'cuantiles', label: 'Percentiles iguales' },
  { id: 'desviacion_estandar', label: 'Desviación estándar / intervalos' },
  { id: 'umbrales', label: 'Umbrales manuales' },
];

/** Selector compartido para los cinco métodos de clasificación admitidos por AgroVisor. */
export default function ClassificationPanel({ method, onMethodChange, children }) {
  return <section className="feature-control classification-panel">
    <label>Método de clasificación<select value={method ?? 'cuantiles'} onChange={(event) => onMethodChange?.(event.target.value)}>
      {METHODS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select></label>
    {children}
  </section>;
}
