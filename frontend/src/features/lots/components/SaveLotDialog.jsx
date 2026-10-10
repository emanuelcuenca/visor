import { useEffect, useRef, useState } from 'react';
import { useSelection } from '../../../app/context/SelectionContext.jsx';
import { api, getListPayload } from '../../../services/api.js';
import { HIERARCHY_ENDPOINTS as H } from '../../../services/endpoints/hierarchy.js';
import { AUTH_ENDPOINTS } from '../../../services/endpoints/auth.js';
import ComboFiltro from '../../../components/ui/ComboFiltro.jsx';
import { campaniaDeFecha, listaCampanias, normalizarCultivo, normalizarTexto } from '../../../utils/agro.js';
import './saveLot.css';

const idDe = (e) => String(e?.id ?? e?.uuid ?? e?.codigo ?? e?.code ?? '');
const nombreDe = (e) => e?.nombre ?? e?.name ?? e?.descripcion ?? idDe(e);
class ConfigError extends Error {}
const exigir = (ruta, variable) => { if (!ruta) throw new ConfigError(`Falta configurar ${variable} en .env.`); return ruta; };

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

const mismo = (a, b) => normalizarTexto(a) === normalizarTexto(b);

export default function SaveLotDialog({ lote, cultivosExistentes = [], onClose, onSaved }) {
  const { selectOrg, selectEstablishment, selectLot } = useSelection();
  const campanias = listaCampanias();
  const [orgTxt, setOrgTxt] = useState('');
  const [estTxt, setEstTxt] = useState('');
  const [nombre, setNombre] = useState(lote.nombre || '');
  const [cultivoTxt, setCultivoTxt] = useState(lote.cultivo || '');
  const [campania, setCampania] = useState(lote.campania || campaniaDeFecha());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const creados = useRef({});

  const orgs = useOpciones(H.organizations, null);
  const orgExistente = orgs.items.find((o) => mismo(nombreDe(o), orgTxt)) || null;
  const ests = useOpciones(H.establishments, orgExistente ? idDe(orgExistente) : '');
  const estExistente = orgExistente ? ests.items.find((o) => mismo(nombreDe(o), estTxt)) || null : null;

  useEffect(() => {
    const cerrar = (e) => { if (e.key === 'Escape' && !guardando) onClose(); };
    window.addEventListener('keydown', cerrar);
    return () => window.removeEventListener('keydown', cerrar);
  }, [guardando, onClose]);

  const faltan = [];
  if (!orgTxt.trim()) faltan.push('Organización / Cliente');
  if (!estTxt.trim()) faltan.push('Establecimiento');
  if (!nombre.trim()) faltan.push('Lote');
  if (!cultivoTxt.trim()) faltan.push('Cultivo');
  if (!campanias.includes(campania)) faltan.push('Campaña');

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
      let org = orgExistente;
      if (!org) { paso = 'Crear organización / cliente'; org = await crear('org', H.organizations, 'VITE_API_ORGANIZATIONS', { nombre: orgTxt.trim() }); }
      let est = estExistente;
      if (!est) {
        paso = 'Crear establecimiento';
        const ruta = H.establishments && H.establishments.replace(':parentId', encodeURIComponent(idDe(org)));
        est = await crear('est', ruta, 'VITE_API_ESTABLISHMENTS', { nombre: estTxt.trim() });
      }
      paso = 'Guardar lote';
      const cultivo = normalizarCultivo(cultivoTxt, cultivosExistentes);
      const { data } = await api.post(AUTH_ENDPOINTS.myLots, {
        organizacion_id: idDe(org), establecimiento_id: idDe(est), nombre: nombre.trim(), origen: lote.origen,
        superficie_ha: Number(lote.superficieHa), geojson: lote.geojson, cultivo, campania,
      });
      selectOrg(org); selectEstablishment(est); selectLot(data);
      onSaved({ servidorId: idDe(data), nombre: nombre.trim(), cultivo, campania, jerarquia: { org, est } });
    } catch (err) {
      setError({ ...describirError(err), paso });
    } finally { setGuardando(false); }
  };

  return (
    <div className="gx-save-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !guardando) onClose(); }}>
      <div className="gx-save" role="dialog" aria-modal="true" aria-labelledby="gx-save-title">
        <header>
          <h2 id="gx-save-title">Guardar lote en tu cuenta</h2>
          <p>Organización / Cliente → Establecimiento → Lote. Podés seguir trabajando sin guardarlo.</p>
        </header>
        <div className="gx-save-body">
          <ComboFiltro id="sv-org" label="Organización / Cliente" value={orgTxt} onChange={setOrgTxt}
            options={orgs.items.map(nombreDe)} placeholder={orgs.cargando ? 'Cargando…' : 'Escribí para buscar o crear'} allowCreate />
          {orgTxt.trim() && <div className="gx-hint">{orgExistente ? 'Organización / cliente existente.' : 'Se creará como nueva.'}</div>}

          <ComboFiltro id="sv-est" label="Establecimiento" value={estTxt} onChange={setEstTxt} disabled={!orgTxt.trim()}
            options={ests.items.map(nombreDe)} placeholder={orgTxt.trim() ? 'Escribí para buscar o crear' : 'Primero elegí la organización'} allowCreate />
          {estTxt.trim() && orgTxt.trim() && <div className="gx-hint">{estExistente ? 'Establecimiento existente.' : 'Se creará como nuevo.'}</div>}

          <div className="gx-save-lvl">
            <label htmlFor="sv-lote">Lote</label>
            <input id="sv-lote" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            <div className="gx-save-auto">
              <span>{Number(lote.superficieHa).toLocaleString('es-AR', { maximumFractionDigits: 2 })} ha</span><span>{lote.origen}</span>
            </div>
          </div>

          <div className="gx-save-row">
            <ComboFiltro id="sv-cultivo" label="Cultivo" value={cultivoTxt} onChange={setCultivoTxt}
              options={cultivosExistentes} placeholder="Elegí o escribí otro" allowCreate />
            <ComboFiltro id="sv-camp" label="Campaña" value={campania} onChange={setCampania}
              options={campanias} placeholder="2025/2026" emptyText="Campaña fuera de rango" />
          </div>
          {faltan.length > 0 && <div className="gx-save-missing" role="status">Falta completar: {faltan.join(', ')}.</div>}
        </div>
        {error && (
          <div className="gx-save-feedback">
            <div className="gx-save-error" role="alert">
              <strong>{error.paso}: {error.codigo ? `HTTP ${error.codigo}` : 'sin respuesta'}</strong>
              <span>{error.mensaje}</span>
              {error.ruta && <small>{error.ruta}</small>}
            </div>
          </div>
        )}
        <footer>
          <button className="gx-save-btn" onClick={onClose} disabled={guardando}>Ahora no</button>
          <button className="gx-save-btn primary" onClick={guardar} disabled={guardando || faltan.length > 0}>
            {guardando ? 'Guardando…' : error ? 'Reintentar' : 'Guardar lote'}
          </button>
        </footer>
      </div>
    </div>
  );
}