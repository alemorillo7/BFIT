// Auditoría de datos B-FIT (solo lectura). Uso:
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/audit-colors.mjs 2026-10 [--backup]
// Reporta: último cambio, celdas pintadas por color, colores inválidos, días con asistencia sin color,
// colores huérfanos (color sin asistencia) y reglas especiales. Con --backup guarda un JSON en /backups.
import { mkdirSync, writeFileSync } from 'node:fs';

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_ANON_KEY;
const mes = process.argv[2];
if (!URL_ || !KEY || !mes) { console.error('Faltan SUPABASE_URL, SUPABASE_ANON_KEY o el mes (YYYY-MM)'); process.exit(1); }

const res = await fetch(`${URL_}/rest/v1/cobros?select=*&mes=eq.${mes}&limit=5000`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
if (!res.ok) { console.error('Error', res.status, await res.text()); process.exit(1); }
const rows = await res.json();

if (process.argv.includes('--backup')) {
  mkdirSync('backups', { recursive: true });
  const f = `backups/cobros_${mes}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(f, JSON.stringify(rows));
  console.log('Respaldo guardado en', f);
}

const VALID = new Set(['Verde', 'Azul', 'Amarillo', 'Naranja', 'none', 'FFF2CC']);
const colors = {}, invalid = [], unpainted = [], orphan = [];
for (const r of rows) {
  const a = typeof r.asistencias === 'string' ? JSON.parse(r.asistencias) : (r.asistencias || {});
  for (const [k, v] of Object.entries(a)) {
    const m = k.match(/^(\d+)_color$/);
    if (!m) continue;
    colors[v] = (colors[v] || 0) + 1;
    if (!VALID.has(v)) invalid.push(`${r.alumno} d${m[1]}=${v}`);
    const dv = a[m[1]];
    if (v !== 'none' && (dv === undefined || dv === '')) orphan.push(`${r.alumno} d${m[1]}`);
  }
  for (const [k, v] of Object.entries(a)) {
    if (/^\d+$/.test(k) && v !== '' && v !== '0' && !a[`${k}_color`]) unpainted.push(`${r.alumno} d${k}(${v})`);
  }
}
console.log(`Mes ${mes}: ${rows.length} filas | último cambio: ${rows.map(r => r.updated_at).sort().pop()}`);
console.log('Celdas por color:', colors);
console.log('Colores inválidos:', invalid.length, invalid.slice(0, 10));
console.log('Días con asistencia SIN color:', unpainted.length);
console.log('Colores sin asistencia en el día:', orphan.length, orphan.slice(0, 10));
const special = rows.filter(r => /MICAELA GIL|RAFAELA VACA|SEBASTIAN MONTENEGRO|MIA MONTENEGRO/.test(r.alumno)).map(r => r.alumno);
console.log('Filas con regla especial:', special);
