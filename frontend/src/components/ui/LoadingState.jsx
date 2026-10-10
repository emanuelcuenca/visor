export default function LoadingState({ children = 'Cargando…' }) {
  return <div className="feature-loading" role="status" aria-live="polite">{children}</div>;
}
