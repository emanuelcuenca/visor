import { AuthProvider, useAuth } from './app/context/AuthContext.jsx';
import { SelectionProvider } from './app/context/SelectionContext.jsx';
import LoginPage from './features/auth/LoginPage.jsx';
import WorkspaceCore from './features/workspace/WorkspaceCore.jsx';
import LoadingState from './components/ui/LoadingState.jsx';
import './app/app.css';
import './app/geosat.css';

/** Sesión → (lotes del usuario) → espacio de trabajo. El requisito de lote lo resuelve WorkspaceCore con FirstLotGate. */
function Shell() {
  const { status } = useAuth();
  if (status === 'loading') return <LoadingState>Verificando sesión…</LoadingState>;
  if (status !== 'authenticated') return <LoginPage />;
  return <SelectionProvider><WorkspaceCore /></SelectionProvider>;
}

export default function App() {
  return <AuthProvider><Shell /></AuthProvider>;
}
