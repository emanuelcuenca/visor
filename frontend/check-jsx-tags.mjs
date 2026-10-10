// Uso (desde la carpeta frontend):  node check-jsx-tags.mjs src/features/workspace/WorkspaceCore.jsx
import { readFileSync } from 'node:fs';

const src = readFileSync(process.argv[2], 'utf8');
const blank = (s) => s.replace(/[^\n]/g, ' ');

// 1) Tapar comentarios y textos entre comillas (conserva saltos de línea y posiciones)
let t = '';
for (let i = 0; i < src.length;) {
  const c = src[i], n = src[i + 1];
  if (c === '/' && n === '/') { let j = src.indexOf('\n', i); if (j < 0) j = src.length; t += blank(src.slice(i, j)); i = j; }
  else if (c === '/' && n === '*') { let j = src.indexOf('*/', i + 2); j = j < 0 ? src.length : j + 2; t += blank(src.slice(i, j)); i = j; }
  else if (c === "'" || c === '"' || c === '`') {
    let j = i + 1;
    while (j < src.length && src[j] !== c && (c === '`' || src[j] !== '\n')) { if (src[j] === '\\') j++; j++; }
    if (src[j] !== c) { t += c; i++; continue; } // comilla suelta (apóstrofo en un texto): se ignora
    t += c + blank(src.slice(i + 1, j)) + c; i = j + 1;
  } else { t += c; i++; }
}

// Tapar clases de caracteres de expresiones regulares (p. ej. /[<>|]/) para que no cuenten como etiquetas
t = t.replace(/(?<=\/)\[(?:\\.|[^\]\\\n])*\]/g, (x) => blank(x));

const nl = []; for (let k = 0; k < t.length; k++) if (t[k] === '\n') nl.push(k);
const lineOf = (pos) => { let lo = 0, hi = nl.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (nl[mid] < pos) lo = mid + 1; else hi = mid; } return lo + 1; };

// 2) Recorrer las etiquetas y llevar la pila de abiertas
const re = /<(\/?)([A-Za-z][\w.]*)?(?=[\s/>])/g;
const stack = [], problemas = [];
let m;
while ((m = re.exec(t))) {
  const cierra = m[1] === '/', nombre = m[2] || '';
  if (!nombre && !(t[m.index + m[0].length] === '>')) continue; // no es fragmento
  const linea = lineOf(m.index);
  let j = m.index + m[0].length, prof = 0, auto = false;
  for (; j < t.length; j++) {
    const ch = t[j];
    if (ch === '{') prof++; else if (ch === '}') prof--;
    else if (ch === '>' && prof === 0) { auto = t[j - 1] === '/'; break; }
  }
  re.lastIndex = j + 1;
  const nom = nombre || 'fragmento <>';
  if (!cierra) { if (!auto) stack.push({ nombre: nom, linea }); continue; }
  const tope = stack[stack.length - 1];
  if (tope && tope.nombre === nom) { stack.pop(); continue; }
  const idx = stack.map((s) => s.nombre).lastIndexOf(nom);
  if (idx === -1) { problemas.push(`Línea ${linea}: sobra un cierre </${nombre}> (no hay nada abierto con ese nombre).`); continue; }
  while (stack.length - 1 > idx) {
    const s = stack.pop();
    problemas.push(`Línea ${s.linea}: <${s.nombre}> se abre pero NO se cierra antes del cierre de la línea ${linea}.`);
  }
  stack.pop();
}
stack.forEach((s) => problemas.push(`Línea ${s.linea}: <${s.nombre}> se abre y nunca se cierra.`));

if (!problemas.length) console.log('OK: todas las etiquetas están emparejadas.');
else { console.log(`Se encontraron ${problemas.length} problema(s). Empezá por el primero:\n`); problemas.slice(0, 8).forEach((p) => console.log(' - ' + p)); }
