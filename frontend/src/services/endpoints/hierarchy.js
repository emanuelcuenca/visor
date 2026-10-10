/** Rutas configurables: no se presupone que el backend ya implemente estos recursos. */
export const HIERARCHY_ENDPOINTS = Object.freeze({
  organizations: import.meta.env?.VITE_API_ORGANIZATIONS ?? '',
  establishments: import.meta.env?.VITE_API_ESTABLISHMENTS ?? '',
  lots: import.meta.env?.VITE_API_LOTS ?? '',
  campaigns: import.meta.env?.VITE_API_CAMPAIGNS ?? '',
});
