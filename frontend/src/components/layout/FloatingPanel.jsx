/** Panel flotante/inspector de herramientas. Conserva los estilos existentes de AgroVisor. */
export default function FloatingPanel({ children, className = 'gs-inspector', ...props }) {
  return <aside className={className} {...props}>{children}</aside>;
}
