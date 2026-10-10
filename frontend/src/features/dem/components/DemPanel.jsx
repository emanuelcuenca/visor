const DEM_PRODUCTS = [
  { id: 'Elevación', label: 'Elevación' },
  { id: 'Pendiente', label: 'Pendiente' },
  { id: 'Sombreado', label: 'Sombreado del relieve' },
];

export default function DemPanel({ product, onProductChange, children }) {
  return <section className="feature-control dem-panel">
    <label>Producto del modelo digital de elevación<select value={product ?? 'Elevación'} onChange={(event) => onProductChange?.(event.target.value)}>
      {DEM_PRODUCTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select></label>
    {children}
  </section>;
}
