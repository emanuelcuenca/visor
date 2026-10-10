export default function ChartLegend({ items = [] }) {
  if (!items.length) return null;
  return <ul className="feature-chart-legend">{items.map((item) => <li key={item.id ?? item.label}>
    <span aria-hidden="true" style={{ background: item.color }} />{item.label}
  </li>)}</ul>;
}
