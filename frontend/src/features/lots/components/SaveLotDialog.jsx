import { useEffect, useRef, useState } from 'react';
import { useSelection } from '../../../app/context/SelectionContext.jsx';
import { api, getListPayload } from '../../../services/api.js';
import { HIERARCHY_ENDPOINTS as H } from '../../../services/endpoints/hierarchy.js';
import { AUTH_ENDPOINTS } from '../../../services/endpoints/auth.js';
import './saveLot.css';

const NUEVA = '__nueva';
const CULTIVOS = ['Soja', 'Maíz', 'Trigo', 'Girasol', 'Sorgo', 'Cebada', 'Algodón', 'Caña de azúcar'];
const idDe = (e) => String(e?.id ?? e?.uuid ?? e?.codigo ?? e?.code ?? '');
const nombreDe = (e) => e?.nombre ?? e?.name ?? e?.descripcion ?? idDe(e);

class ConfigError extends Error {}
const exigir = (ruta, variable) => { if (!ruta) throw new ConfigError(`Falta configurar ${variable} en .env.`); return ruta; };

/** Convierte cualquier fallo en { codigo, mensaje } con el motivo real devuelto por el servidor. */
function describirError(err) {
  if (err instanceof ConfigError) return { codigo: null, mensaje: err.message };
  const r = err?.response;
  if (!r) return { codigo: null, mensaje: err?.code === 'ECONNABORTED' ? 'El servidor no respondió a tiempo.' : 'No se pudo conectar con el servidor (revisá VITE_API_URL y CORS).' };
  let d = r.data?.detail ?? r.data?.message ?? r.data?.error;
  if (Array.isArray(d)) d = d.map((x) => [x.loc?.slice(1).join('.'), x.msg].filter(Boolean).join(': ')).join('; ');
  if (d && typeof d === 'object') d = JSON.stringify(d);
  const ruta = `${(r.config?.method || '').toUpperCase()} ${r.config?.baseURL ?? ''}${r.config?.url ?? ''}`.trim();
  return { codigo: r.status, mensaje: d || r.statusText || 'El servidor no dio detalles.', ruta };
}

function useOpciones(ruta, parentId) {
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(false);
  useEffect(() => {
    let vivo = true;
    if (!ruta || (ruta.includes(':parentId') && !parentId)) { setItems([]); return undefined; }
    setCargando(true);
    api.get(ruta.replace(':parentId', encodeURIComponent(parentId ?? '')))
      .then(({ data }) => vivo && setItems(getListPayload(data)))
      .catch(() => vivo && setItems([]))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [ruta, parentId]);
  return { items, cargando };
}

function Nivel({ id, titulo, valor, onChange, opciones, cargando, disabled, forzarNueva, nuevo, onNuevo, placeholder }) {
  const esNueva = forzarNueva || valor === NUEVA;
  return (
    <div className="gx-save-lvl">
      <label htmlFor={id}>{titulo}</label>
      <select id={id} value={forzarNueva ? NUEVA : valor} disabled={disabled || forzarNueva} onChange={(e) => onChange(e.target.value)}>
        <option value="">{cargando ? 'Cargando…' : 'Seleccionar…'}</option>
        {opciones.map((o) => <option key={idDe(o)} value={idDe(o)}>{nombreDe(o)}</option>)}
        <option value={NUEVA}>+ Crear nueva…</option>
      </select>
      {esNueva && <input aria-label={`Nombre nuevo: ${titulo}`} value={nuevo} onChange={(e) => onNuevo(e.target.value)} placeholder={placeholder} />}
    </div>
  );
}

export default function SaveLotDialog({ lote, onClose, onSaved }) {
  const { selectOrg, selectEstablishment, selectLot, selectCampaign } = useSelection();
  const [orgSel, setOrgSel] = useState('');
  const [orgNueva, setOrgNueva] = useState('');
  const [estSel, setEstSel] = useState('');
  const [estNueva, setEstNueva] = useState('');
  const [nombre, setNombre] = useState(lote.nombre || '');
  const [cultivo, setCultivo] = useState('');
  const [ciclo, setCiclo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const creados = useRef({}); // evita duplicar organización/establecimiento al reintentar

  const orgId = orgSel && orgSel !== NUEVA ? orgSel : '';
  const orgs = useOpciones(H.organizations, null);
  const ests = useOpciones(H.establishments, orgId);
  const estForzada = orgSel === NUEVA;

  useEffect(() => {
    const cerrar = (e) => { if (e.key === 'Escape' && !guardando) onClose(); };
    window.addEventListener('keydown', cerrar);
    return () => window.removeEventListener('keydown', cerrar);
  }, [guardando, onClose]);

  const faltan = [];
  if (!(orgSel === NUEVA ? orgNueva.trim() : orgSel)) faltan.push('Organización / Cliente');
  if (!(estForzada || estSel === NUEVA ? estNueva.trim() : estSel)) faltan.push('Establecimiento');
  if (!nombre.trim()) faltan.push('Nombre del lote');
  if (!cultivo.trim()) faltan.push('Cultivo');
  if (!ciclo.trim()) faltan.push('Ciclo');

  const crear = async (clave, ruta, variable, cuerpo) => {
    if (creados.current[clave]?.nombre === cuerpo.nombre) return creados.current[clave].data;
    const { data } = await api.post(exigir(ruta, variable), cuerpo);
        if (!idDe(data)) throw new ConfigError('El servidor creó el registro pero no devolvió su id. Debe responder {"id": ..., "nombre": ...}.');
    creados.current[clave] = { nombre: cuerpo.nombre, data };
    return data;
  };

  const guardar = async () => {
    setError(null); setGuardando(true);
    let paso = 'Preparación';
    try {
      exigir(AUTH_ENDPOINTS.myLots, 'VITE_API_MY_LOTS');
      let org = orgs.items.find((o) => idDe(o) === orgSel);
      if (orgSel === NUEVA) { paso = 'Crear organización / cliente'; org = await crear('org', H.organizations, 'VITE_API_ORGANIZATIONS', { nombre: orgNueva.trim() }); }
      let est = ests.items.find((o) => idDe(o) === estSel);
      if (estForzada || estSel === NUEVA) {
        paso = 'Crear establecimiento';
        est = await crear('est', H.establishments && H.establishments.replace(':parentId', encodeURIComponent(idDe(org))), 'VITE_API_ESTABLISHMENTS', { nombre: estNueva.trim() });
      }
      paso = 'Guardar lote';
      const cuerpo = {
        organizacion_id: idDe(org), establecimiento_id: idDe(est), nombre: nombre.trim(), origen: lote.origen,
        superficie_ha: Number(lote.superficieHa), geojson: lote.geojson,
        campania: { cultivo: cultivo.trim(), ciclo: ciclo.trim() },
      };
      const { data } = await api.post(AUTH_ENDPOINTS.myLots, cuerpo);
      const campania = data?.campania ?? { id: data?.campania_id, nombre: `${cultivo.trim()} ${ciclo.trim()}` };
      selectOrg(org); selectEstablishment(est); selectLot(data); selectCampaign(campania);
      onSaved({ servidorId: idDe(data), nombre: nombre.trim(), jerarquia: { org, est, campania } });
    } catch (err) {
      setError({ ...describirError(err), paso });
    } finally { setGuardando(false); }
  };

  return (
    <div className="gx-save-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !guardando) onClose(); }}>
      <div className="gx-save" role="dialog" aria-modal="true" aria-labelledby="gx-save-title">
        <header>
          <h2 id="gx-save-title">Guardar lote en tu cuenta</h2>
          <p>Definí dónde se organiza dentro de tu base de datos. Podés seguir trabajando sin guardarlo.</p>
        </header>
        <div className="gx-save-body">
          <Nivel id="sv-org" titulo="Organización / Cliente" valor={orgSel} opciones={orgs.items} cargando={orgs.cargando} nuevo={orgNueva}
            onNuevo={setOrgNueva} placeholder="Nombre de la organización / cliente" onChange={(v) => { setOrgSel(v); setEstSel(''); }} />
          <Nivel id="sv-est" titulo="Establecimiento" valor={estSel} opciones={ests.items} cargando={ests.cargando} nuevo={estNueva}
            onNuevo={setEstNueva} placeholder="Nombre del establecimiento" disabled={!orgSel} forzarNueva={estForzada} onChange={setEstSel} />
          <div className="gx-save-lvl">
            <label htmlFor="sv-lote">Lote</label>
            <input id="sv-lote" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            <div className="gx-save-auto"><span>{Number(lote.superficieHa).toLocaleString('es-AR', { maximumFractionDigits: 2 })} ha</span><span>{lote.origen}</span></div>
          </div>
          <div className="gx-save-lvl">
            <span className="gx-lbl">Campaña</span>
            <div className="gx-save-row">
              <input aria-label="Cultivo" list="sv-cultivos" value={cultivo} onChange={(e) => setCultivo(e.target.value)} placeholder="Cultivo (ej.: Soja)" />
              <input aria-label="Ciclo" value={ciclo} onChange={(e) => setCiclo(e.target.value)} placeholder="Ciclo (ej.: 2025/26)" />
            </div>
            <datalist id="sv-cultivos">{CULTIVOS.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          {faltan.length > 0 && <div className="gx-save-missing" role="status">Falta completar: {faltan.join(', ')}.</div>}
        </div>
        <footer>
          <button className="gx-save-btn" onClick={onClose} disabled={guardando}>Ahora no</button>
          <button className="gx-save-btn primary" onClick={guardar} disabled={guardando || faltan.length > 0}>
            {guardando ? 'Guardando…' : error ? 'Reintentar' : 'Guardar lote'}
          </button>
          {error && (
  <div className="gx-save-feedback">
    <div className="gx-save-error" role="alert">
      <strong>{error.paso}: {error.codigo ? `HTTP ${error.codigo}` : 'sin respuesta'}</strong>
      <span>{error.mensaje}</span>
      {error.ruta && <small>{error.ruta}</small>}
    </div>
  </div>
)}
        </footer>
      </div>
    </div>
  );
}