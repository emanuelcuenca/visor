export default function Sidebar({ children, ...props }) {
  return <aside className="gs-sidebar" {...props}>{children}</aside>;
}
