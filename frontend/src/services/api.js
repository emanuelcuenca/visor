import axios from 'axios';

/** Base URL configurable mediante VITE_API_URL. */
export const API_BASE_URL = import.meta.env?.VITE_API_URL ?? 'http://127.0.0.1:8000/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { Accept: 'application/json' },
});

/** Normaliza respuestas de listas comunes sin imponer un esquema de backend. */
export function getListPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}
