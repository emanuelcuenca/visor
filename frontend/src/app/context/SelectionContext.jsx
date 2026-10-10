import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const SelectionContext = createContext(null);

const EMPTY_SELECTION = {
  selectedOrg: null,
  selectedEstablishment: null,
  selectedLot: null,
  selectedCampaign: null,
};

export function SelectionProvider({ children }) {
  const [selection, setSelection] = useState(EMPTY_SELECTION);

  const selectOrg = useCallback((value) => setSelection({
    selectedOrg: value, selectedEstablishment: null, selectedLot: null, selectedCampaign: null,
  }), []);
  const selectEstablishment = useCallback((value) => setSelection((current) => ({
    ...current, selectedEstablishment: value, selectedLot: null, selectedCampaign: null,
  })), []);
  const selectLot = useCallback((value) => setSelection((current) => ({
    ...current, selectedLot: value, selectedCampaign: null,
  })), []);
  const selectCampaign = useCallback((value) => setSelection((current) => ({ ...current, selectedCampaign: value })), []);
  const clearSelection = useCallback(() => setSelection(EMPTY_SELECTION), []);

  const value = useMemo(() => ({
    ...selection, selectOrg, selectEstablishment, selectLot, selectCampaign, clearSelection,
  }), [selection, selectOrg, selectEstablishment, selectLot, selectCampaign, clearSelection]);

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection() {
  const context = useContext(SelectionContext);
  if (!context) throw new Error('useSelection debe utilizarse dentro de SelectionProvider.');
  return context;
}
