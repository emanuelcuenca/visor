/** Rutas de autenticación y lotes del usuario (relativas a VITE_API_URL). Vacías = no configuradas. */
export const AUTH_ENDPOINTS = Object.freeze({
  login: import.meta.env?.VITE_API_LOGIN ?? '',        // POST {email, password} -> {token, user}
  register: import.meta.env?.VITE_API_REGISTER ?? '',  // POST {nombre, email, password} -> {token, user} (o 201 sin token)
  me: import.meta.env?.VITE_API_ME ?? '',              // GET  -> {id, nombre, email}
  myLots: import.meta.env?.VITE_API_MY_LOTS ?? '',     // GET  -> lista de lotes del usuario; POST crea uno
});
