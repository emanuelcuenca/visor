export const normalizarTexto = (s) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export const CULTIVOS_BASE = ['Maíz', 'Soja 1ra', 'Soja 2da', 'Girasol', 'Trigo']
  .sort((a, b) => a.localeCompare(b, 'es'));

/** "  cebada  " -> "Cebada" (primera letra en mayúscula, resto en minúscula) */
export const capitalizar = (texto) => {
  const t = String(texto ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Si ya existe un cultivo equivalente, respeta su grafía; si es nuevo, lo capitaliza. */
export const normalizarCultivo = (texto, existentes = []) =>
  existentes.find((c) => normalizarTexto(c) === normalizarTexto(texto)) ?? capitalizar(texto);

export const MES_INICIO_CAMPANIA = 7; // la campaña arranca el 1 de julio

export const campaniaDeFecha = (fecha = new Date()) => {
  const anio = fecha.getMonth() + 1 >= MES_INICIO_CAMPANIA ? fecha.getFullYear() : fecha.getFullYear() - 1;
  return `${anio}/${anio + 1}`;
};

/** De 2020/2021 hasta la campaña de hoy, en orden ascendente. */
export const listaCampanias = (desde = 2020, fecha = new Date()) => {
  const actual = Number(campaniaDeFecha(fecha).slice(0, 4));
  return Array.from({ length: Math.max(0, actual - desde + 1) }, (_, i) => `${desde + i}/${desde + i + 1}`);
};