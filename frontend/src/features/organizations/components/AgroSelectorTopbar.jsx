import { useEffect, useMemo, useState } from 'react';
import { useSelection } from '../../../app/context/SelectionContext.jsx';
import { api, getListPayload } from '../../../services/api.js';
import { HIERARCHY_ENDPOINTS } from '../../../services/endpoints/hierarchy.js';

const ENDPOINTS = HIERARCHY_ENDPOINTS;

function entityId(entity) {
  return entity?.id ?? entity?.uuid ?? entity?.codigo ?? entity?.code ?? '';
}
function entityName(entity) {
  return entity?.nombre ?? entity?.name ?? entity?.descripcion ?? entity?.label ?? String(entityId(entity));
}

function useRemoteOptions(endpoint, parentId) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    if (!endpoint || (endpoint.includes(':parentId') && !parentId)) {
      setItems([]);
      return () => { active = false; };
    }
    const url = endpoint.replace(':parentId', encodeURIComponent(parentId ?? ''));
    setLoading(true);
    api.get(url).then(({ data }) => {
      if (active) setItems(getListPayload(data));
    }).catch(() => {
      if (active) setItems([]);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [endpoint, parentId]);
  return { items, loading };
}

function SelectEntity({ label, value, options, loading, disabled, onChange }) {
  return (
    <label className="agro-selector-field">
      <span>{label}</span>
      <select value={entityId(value)} disabled={disabled || loading || options.length === 0} onChange={(event) => {
        onChange(options.find((item) => String(entityId(item)) === event.target.value) ?? null);
      }} aria-label={label}>
        <option value="">{loading ? 'Cargando…' : options.length ? `Seleccionar ${label.toLowerCase()}` : 'Sin datos de API'}</option>
        {options.map((item) => <option key={entityId(item)} value={entityId(item)}>{entityName(item)}</option>)}
      </select>
    </label>
  );
}

/**
 * Selector jerárquico. Los endpoints se configuran en .env como:
 * VITE_API_ORGANIZATIONS=/organizaciones
 * VITE_API_ESTABLISHMENTS=/organizaciones/:parentId/establecimientos
 * VITE_API_LOTS=/establecimientos/:parentId/lotes
 * VITE_API_CAMPAIGNS=/lotes/:parentId/campanas
 * Los endpoints son opcionales porque el backend entregado aún no define esta jerarquía.
 */
export default function AgroSelectorTopbar() {
  const { selectedOrg, selectedEstablishment, selectedLot, selectedCampaign,
    selectOrg, selectEstablishment, selectLot, selectCampaign } = useSelection();
  const orgs = useRemoteOptions(ENDPOINTS.organizations, null);
  const establishments = useRemoteOptions(ENDPOINTS.establishments, entityId(selectedOrg));
  const lots = useRemoteOptions(ENDPOINTS.lots, entityId(selectedEstablishment));
  const campaigns = useRemoteOptions(ENDPOINTS.campaigns, entityId(selectedLot));
  const fields = useMemo(() => [
    { label: 'Organización / Cliente', value: selectedOrg, options: orgs, change: selectOrg, disabled: false },
    { label: 'Establecimiento', value: selectedEstablishment, options: establishments, change: selectEstablishment, disabled: !selectedOrg },
    { label: 'Lote', value: selectedLot, options: lots, change: selectLot, disabled: !selectedEstablishment },
    { label: 'Campaña', value: selectedCampaign, options: campaigns, change: selectCampaign, disabled: !selectedLot },
  ], [selectedOrg, selectedEstablishment, selectedLot, selectedCampaign, orgs, establishments, lots, campaigns, selectOrg, selectEstablishment, selectLot, selectCampaign]);

  return (
    <div className="agro-selector-topbar" aria-label="Selección del espacio agronómico">
      {fields.map((field) => <SelectEntity key={field.label} label={field.label} value={field.value}
        options={field.options.items} loading={field.options.loading} disabled={field.disabled} onChange={field.change} />)}
    </div>
  );
}
