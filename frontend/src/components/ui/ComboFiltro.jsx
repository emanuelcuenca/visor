import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { normalizarTexto } from '../../utils/agro.js';

export default function ComboFiltro({
  id, label, value = '', onChange, options = [], placeholder = '', allowCreate = false, disabled = false, emptyText = 'Sin coincidencias'
}) {
  const uid = useId();
  const raiz = useRef(null);
  const [abierto, setAbierto] = useState(false);
  const [tecleo, setTecleo] = useState(false);
  const [activo, setActivo] = useState(0);

  const q = tecleo ? normalizarTexto(value) : '';
  const items = useMemo(() => {
    const lista = options.filter((o) => normalizarTexto(o).includes(q));
    const nuevo = allowCreate && value.trim() && !options.some((o) => normalizarTexto(o) === normalizarTexto(value));
    return nuevo ? [...lista, { crear: value.trim() }] : lista;
  }, [options, q, allowCreate, value]);
  const idx = Math.min(activo, Math.max(items.length - 1, 0));

  useEffect(() => {
    const fuera = (e) => { if (raiz.current && !raiz.current.contains(e.target)) setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);

  const elegir = (it) => { onChange(typeof it === 'string' ? it : it.crear); setAbierto(false); setTecleo(false); };

  const teclas = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAbierto(true); setActivo(Math.min(idx + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(Math.max(idx - 1, 0)); }
    else if (e.key === 'Enter') { if (abierto && items[idx]) { e.preventDefault(); elegir(items[idx]); } }
    else if (e.key === 'Escape') { if (abierto) { e.stopPropagation(); setAbierto(false); } }
    else if (e.key === 'Tab') setAbierto(false);
  };

  return (
    <div className="gx-combo" ref={raiz}>
      {label && <label htmlFor={id}>{label}</label>}
      <div className="gx-combo-box">
        <input
          id={id} role="combobox" aria-expanded={abierto} aria-controls={`${uid}-lista`} aria-autocomplete="list"
          aria-activedescendant={abierto && items[idx] ? `${uid}-o${idx}` : undefined}
          autoComplete="off" disabled={disabled} value={value} placeholder={placeholder}
          onChange={(e) => { onChange(e.target.value); setTecleo(true); setAbierto(true); setActivo(0); }}
          onFocus={() => { setTecleo(false); setAbierto(true); }}
          onClick={() => setAbierto(true)}
          onKeyDown={teclas}
        />
        {value && !disabled && (
          <button type="button" className="gx-combo-x" aria-label="Borrar" onClick={() => { onChange(''); setTecleo(false); setAbierto(true); }}>×</button>
        )}
      </div>
      {abierto && !disabled && (
        <ul className="gx-combo-list" id={`${uid}-lista`} role="listbox">
          {items.length === 0 ? <li className="gx-combo-empty" role="presentation">{emptyText}</li> : items.map((it, i) => (
            <li key={typeof it === 'string' ? it : '__crear'} id={`${uid}-o${i}`} role="option" aria-selected={i === idx}
              className={`gx-combo-opt ${i === idx ? 'on' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); elegir(it); }} onMouseEnter={() => setActivo(i)}>
              {typeof it === 'string' ? it : `Crear “${it.crear}”`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}