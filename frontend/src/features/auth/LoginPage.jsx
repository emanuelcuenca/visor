import { useState } from 'react';
import { useAuth } from '../../app/context/AuthContext.jsx';

const VALORES = [
  ['Imágenes e índices', 'Sentinel-2 y Landsat, NDVI, NDWI, SAVI y NBR.'],
  ['Zonas de manejo', 'Cinco métodos de clasificación y exportación vectorial.'],
  ['Evolución temporal', 'La curva del lote en cada pasada del satélite.'],
];
const MIN_CLAVE = 8;

/** Acceso a la cuenta: alterna entre iniciar sesión y crear cuenta. */
export default function LoginPage() {
  const { login, register } = useAuth();
  const [modo, setModo] = useState('login'); // 'login' | 'registro'
  const [form, setForm] = useState({ nombre: '', email: '', password: '', repetir: '' });
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);
  const esRegistro = modo === 'registro';

  const campo = (k) => ({ value: form[k], onChange: (e) => setForm((f) => ({ ...f, [k]: e.target.value })) });
  const cambiarModo = (m) => { setModo(m); setError(''); setAviso(''); setForm((f) => ({ ...f, password: '', repetir: '' })); };

  const validar = () => {
    if (!esRegistro) return '';
    if (form.password.length < MIN_CLAVE) return `La contraseña debe tener al menos ${MIN_CLAVE} caracteres.`;
    if (form.password !== form.repetir) return 'Las contraseñas no coinciden.';
    return '';
  };

  const enviar = async (event) => {
    event.preventDefault();
    const problema = validar();
    if (problema) { setError(problema); return; }
    setError(''); setAviso(''); setEnviando(true);
    try {
      if (esRegistro) {
        const { sesionIniciada } = await register({ nombre: form.nombre.trim(), email: form.email.trim(), password: form.password });
        if (!sesionIniciada) { cambiarModo('login'); setAviso('Cuenta creada. Ya podés iniciar sesión.'); }
      } else {
        await login(form.email.trim(), form.password);
      }
    } catch (err) { setError(err.message); } finally { setEnviando(false); }
  };

  const listo = form.email && form.password && (!esRegistro || (form.nombre.trim() && form.repetir));

  return (
    <div className="gx-login">
      <section className="gx-login-brand">
        <div className="gx-brand"><span className="gx-logo" aria-hidden="true">◆</span>GeoSat</div>
        <div>
          <h1>Todo el análisis, alrededor de tu lote.</h1>
          <p>Imágenes satelitales, índices, zonas de manejo y curvas de evolución, en un solo espacio de trabajo.</p>
          {VALORES.map(([titulo, texto]) => <div className="gx-value" key={titulo}><strong>{titulo}</strong><span>{texto}</span></div>)}
        </div>
      </section>
      <section className="gx-login-form-wrap">
        <form className="gx-login-form" onSubmit={enviar} noValidate>
          <div>
            <h2>{esRegistro ? 'Crear cuenta' : 'Iniciar sesión'}</h2>
            <span className="gx-muted">{esRegistro ? 'Registrate para guardar y retomar tus lotes.' : 'Ingresá para retomar tus lotes.'}</span>
          </div>
          {aviso && <div className="gx-ok" role="status">{aviso}</div>}
          {esRegistro && (
            <label className="gx-field">Nombre
              <input type="text" autoComplete="name" required {...campo('nombre')} />
            </label>
          )}
          <label className="gx-field">Correo electrónico
            <input type="email" autoComplete="email" required placeholder="nombre@correo.com" {...campo('email')} />
          </label>
          <label className="gx-field">{esRegistro ? `Contraseña (mínimo ${MIN_CLAVE} caracteres)` : 'Contraseña'}
            <input type="password" autoComplete={esRegistro ? 'new-password' : 'current-password'} required {...campo('password')} />
          </label>
          {esRegistro && (
            <label className="gx-field">Repetir contraseña
              <input type="password" autoComplete="new-password" required {...campo('repetir')} />
            </label>
          )}
          {error && <div className="gx-error" role="alert">{error}</div>}
          <button className="gx-btn primary" type="submit" disabled={enviando || !listo}>
            {enviando ? (esRegistro ? 'Creando cuenta…' : 'Ingresando…') : (esRegistro ? 'Crear cuenta' : 'Entrar')}
          </button>
          <span className="gx-muted gx-switch">
            {esRegistro ? '¿Ya tenés cuenta?' : '¿No tenés cuenta?'}{' '}
            <button type="button" className="gx-linkbtn" onClick={() => cambiarModo(esRegistro ? 'login' : 'registro')}>
              {esRegistro ? 'Iniciar sesión' : 'Crear cuenta'}
            </button>
          </span>
        </form>
      </section>
    </div>
  );
}
