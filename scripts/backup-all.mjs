// Descarga TODA la tabla cobros (todos los meses) a backups/cobros_all.json. Solo lectura.
import { mkdirSync, writeFileSync } from 'node:fs';
const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_ANON_KEY;
if (!URL_ || !KEY) { console.error('Faltan SUPABASE_URL / SUPABASE_ANON_KEY'); process.exit(1); }
const PAGE = 1000; let all = [];
for (let from = 0; ; from += PAGE) {
  const res = await fetch(`${URL_}/rest/v1/cobros?select=*&order=id.asc`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' } });
  if (!res.ok) { console.error('Error', res.status, await res.text()); process.exit(1); }
  const rows = await res.json(); all = all.concat(rows);
  if (rows.length < PAGE) break;
}
if (all.length < 100) { console.error('Respaldo sospechosamente chico:', all.length); process.exit(1); }
mkdirSync('backups', { recursive: true });
writeFileSync('backups/cobros_all.json', JSON.stringify(all));
console.log('Filas respaldadas:', all.length);
