/**
 * scripts/cleanupEmptyPaintedDays.js
 * 
 * Script de limpieza para:
 *  1. Limpiar celdas pintadas pero vacías en Octubre (para que los días futuros queden en blanco).
 *  2. Corregir celdas con código '4' que hayan quedado atrapadas con color 'Verde'.
 * 
 * Uso:
 *   node scripts/cleanupEmptyPaintedDays.js --dry-run   (Solo simulación, no modifica la BD)
 *   node scripts/cleanupEmptyPaintedDays.js --apply     (Aplica los cambios en Supabase)
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_COBROS_URL || 'https://bwtqyyhsucqmijimuzlc.supabase.co';
const anonKey = process.env.VITE_SUPABASE_COBROS_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3dHF5eWhzdWNxbWlqaW11emxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NDA0MTMsImV4cCI6MjEwMzUxNjQxM30.hbrm6boUabXaj6bj0Plm7QKR00AijncaYr7NYBE77tc';

const supabase = createClient(url, anonKey, { auth: { persistSession: false } });

const isApply = process.argv.includes('--apply');
const modeText = isApply ? 'MODO DE EJECUCIÓN (APLICANDO CAMBIOS)' : 'MODO SIMULACIÓN (--dry-run)';

console.log(`\n============================================================`);
console.log(`LIMPIEZA DE CELDAS VACÍAS Y CORRECCIÓN DE CÓDIGO 4 B-FIT`);
console.log(`Estado: ${modeText}`);
console.log(`============================================================\n`);

async function run() {
  // 1. Limpieza de Octubre (2026-10): casillas vacías pintadas
  console.log('--- Analizando Octubre 2026 (2026-10) ---');
  const { data: octRows, error: octErr } = await supabase
    .from('cobros')
    .select('id, alumno, turno, asistencias')
    .eq('mes', '2026-10');

  if (octErr) {
    console.error('Error al leer Octubre:', octErr);
    return;
  }

  let octRowsModified = 0;
  let octColorsCleared = 0;
  let octFoursFixed = 0;

  for (const row of (octRows || [])) {
    const as = { ...(row.asistencias || {}) };
    let changed = false;

    // A) Quitar color de casillas vacías
    Object.keys(as).forEach((k) => {
      if (k.endsWith('_color')) {
        const dayKey = k.replace('_color', '');
        const val = as[dayKey];
        if (!val || String(val).trim() === '') {
          delete as[k];
          octColorsCleared++;
          changed = true;
        }
      }
    });

    // B) Si tiene '4' y quedó con Verde, corregir a Amarillo
    Object.keys(as).forEach((k) => {
      if (!k.endsWith('_color') && !k.endsWith('_nota') && String(as[k]).trim() === '4') {
        if (as[`${k}_color`] === 'Verde') {
          as[`${k}_color`] = 'Amarillo';
          octFoursFixed++;
          changed = true;
        }
      }
    });

    if (changed) {
      octRowsModified++;
      if (isApply) {
        const { error: updErr } = await supabase
          .from('cobros')
          .update({ asistencias: as, updated_at: new Date().toISOString() })
          .eq('id', row.id);

        if (updErr) {
          console.error(`Error actualizando alumno ${row.alumno} (${row.id}):`, updErr);
        }
      }
    }
  }

  console.log(`Octubre:`);
  console.log(` - Filas analizadas: ${octRows.length}`);
  console.log(` - Filas con cambios: ${octRowsModified}`);
  console.log(` - Celdas vacías des-pintadas (vuelven a blanco): ${octColorsCleared}`);
  console.log(` - Celdas con 4 corregidas a Amarillo: ${octFoursFixed}`);

  // 2. Corrección de Septiembre (2026-09): código 4 atrapado en Verde
  console.log('\n--- Analizando Septiembre 2026 (2026-09) ---');
  const { data: sepRows, error: sepErr } = await supabase
    .from('cobros')
    .select('id, alumno, turno, asistencias')
    .eq('mes', '2026-09');

  if (sepErr) {
    console.error('Error al leer Septiembre:', sepErr);
    return;
  }

  let sepRowsModified = 0;
  let sepFoursFixed = 0;

  for (const row of (sepRows || [])) {
    const as = { ...(row.asistencias || {}) };
    let changed = false;

    Object.keys(as).forEach((k) => {
      if (!k.endsWith('_color') && !k.endsWith('_nota') && String(as[k]).trim() === '4') {
        if (as[`${k}_color`] === 'Verde') {
          as[`${k}_color`] = 'Amarillo';
          sepFoursFixed++;
          changed = true;
        }
      }
    });

    if (changed) {
      sepRowsModified++;
      if (isApply) {
        const { error: updErr } = await supabase
          .from('cobros')
          .update({ asistencias: as, updated_at: new Date().toISOString() })
          .eq('id', row.id);

        if (updErr) {
          console.error(`Error actualizando alumno ${row.alumno} (${row.id}):`, updErr);
        }
      }
    }
  }

  console.log(`Septiembre:`);
  console.log(` - Filas analizadas: ${sepRows.length}`);
  console.log(` - Filas con código 4 en Verde corregidas: ${sepRowsModified}`);
  console.log(` - Total casillas 4 corregidas a Amarillo: ${sepFoursFixed}`);

  console.log(`\n============================================================`);
  if (isApply) {
    console.log(`¡LIMPIEZA COMPLETADA CON ÉXITO EN LA BASE DE DATOS!`);
  } else {
    console.log(`SIMULACIÓN COMPLETADA SIN TOCAR LA BASE DE DATOS.`);
    console.log(`Para ejecutar realmente, corre con: node scripts/cleanupEmptyPaintedDays.js --apply`);
  }
  console.log(`============================================================\n`);
}

run().catch((err) => console.error('Error ejecutando script:', err));
