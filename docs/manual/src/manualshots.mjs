// Capturas nuevas para el manual v2 (Colegio Demo Sentryx, schoolId 9). API en 3010, front en 5185.
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
const API = 'http://localhost:3010';
const WEB = 'http://localhost:5185';
const KEY = readFileSync('C:/Users/Marcos/Desktop/sentryx/api/.env', 'utf8').match(/^CLIENT_APP_KEYS=(.+)$/m)[1].trim();
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = 'C:/Users/Marcos/AppData/Local/Temp/claude/c--Users-Marcos-Desktop-sentryx/0d966a03-08b5-4cb9-86c2-924209ca898e/scratchpad/manual';
const sessions = {};
const rfetch = async (u, o, n = 4) => { for (let i = 0; ; i++) { try { return await fetch(u, o); } catch (e) { if (i >= n) throw e; await new Promise((r) => setTimeout(r, 1500)); } } };
const login = async (alias) => {
  if (alias === 'none') return null;
  if (sessions[alias]) return sessions[alias];
  const j = await (await rfetch(`${API}/users/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Client-Key': KEY }, body: JSON.stringify({ email: `${alias}@demo.wearesrv.com`, password: 'Demo-Sentryx-2026' }) })).json();
  if (!j.token) throw new Error(`login ${alias}: ${j.message}`);
  const me = await (await rfetch(`${API}/users/me`, { headers: { Authorization: `Bearer ${j.token}`, 'X-Client-Key': KEY } })).json();
  return (sessions[alias] = { token: j.token, userData: me });
};
const call = async (alias, method, path, body) => {
  const s = await login(alias);
  const r = await rfetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Client-Key': KEY, Authorization: `Bearer ${s.token}`, 'X-School-Id': '9' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};

// Datos de ejemplo para que las pantallas nuevas muestren algo real (se borran al final).
const created = { posts: [], announcements: [] };
const due = (d) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
let r = await call('docente3', 'POST', '/school/classrooms/10/posts', { kind: 'EVALUACION', subjectId: 19, title: 'Evaluación: textos argumentativos', body: 'Entra todo lo visto en la unidad 3. Traer hoja de carpeta.', dueDate: due(6), notifyFamilies: false });
if (r.body?.id) created.posts.push(r.body.id);
r = await call('docente3', 'POST', '/school/classrooms/10/posts', { kind: 'TP', subjectId: 19, title: 'TP Nº 3: reseña de una novela', body: 'Elegir una novela de la lista y escribir una reseña de una carilla.', dueDate: due(12), notifyFamilies: false });
if (r.body?.id) created.posts.push(r.body.id);
r = await call('rectora', 'POST', '/school/announcements', { title: 'Reunión de padres de 5º 1ª', body: 'La reunión será el jueves a las 18 en el aula del curso.', audience: { type: 'DIVISION', ids: [11] }, mode: 'schedule', scheduledAt: new Date(Date.now() + 2 * 86_400_000).toISOString() });
if (r.body?.id) created.announcements.push(r.body.id);
r = await call('rectora', 'POST', '/school/announcements', { title: 'Borrador: salida educativa al museo', body: 'Pendiente de confirmar fecha y costo.', audience: { type: 'LEVEL', ids: [21] }, mode: 'draft' });
if (r.body?.id) created.announcements.push(r.body.id);

const SHOTS = [
  ['desk', 'rectora', '/estadisticas', 'd_estadisticas'],
  ['desk', 'representante', '/admin?tab=calificaciones', 'd_calificaciones'],
  ['desk', 'representante', '/admin?tab=roles', 'd_roles'],
  ['desk', 'rectora', '/comunicados', 'd_comunicados'],
  ['desk', 'rectora', '/comunicados/nuevo', 'd_comunicado_nuevo'],
  ['desk', 'docente3', '/aulas/10', 'd_aula'],
  ['desk', 'rectora', '/alumnos', 'd_alumnos'],
  ['desk', 'rectora', '/ayuda', 'd_ayuda'],
  ['desk', 'representante', '/admin?tab=personal', 'd_personal'],
  ['desk', 'rectora', '/inicio', 'd_inicio'],
  ['phone', 'familia25', '/inicio', 'p_inicio_familia'],
  ['phone', 'familia25', '/comunicados', 'p_comunicados'],
];
const only = process.argv[2]?.split(',');
for (const [kind, alias, to, name] of SHOTS) {
  if (only && !only.includes(name)) continue;
  const session = await login(alias);
  const [w, h] = kind === 'desk' ? [1280, 860] : [390, 844];
  const payload = { session: session ?? null, schoolId: 9, to, ...(kind === 'phone' ? { frame: [w, h] } : {}) };
  const hash = Buffer.from(unescape(encodeURIComponent(JSON.stringify(payload))), 'latin1').toString('base64');
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2', `--window-size=${Math.max(w, 520)},${h}`, '--virtual-time-budget=12000', `--screenshot=${OUT}/${name}.png`, `--user-data-dir=${process.env.TEMP}/man2-${alias}`, `${WEB}/_shot.html#${hash}`], { stdio: 'ignore' });
  console.log('ok', name);
}
if (!process.argv.includes('--keep')) {
  for (const id of created.posts) await call('docente3', 'DELETE', `/school/classroom-posts/${id}`);
  for (const id of created.announcements) await call('rectora', 'DELETE', `/school/announcements/${id}`);
  console.log('limpieza lista');
}
