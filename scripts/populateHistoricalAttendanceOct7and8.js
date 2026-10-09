/**
 * scripts/populateHistoricalAttendanceOct7and8.js
 * 
 * Asigna la asistencia histórica de Miércoles 7 y Jueves 8 a los comensales habituales
 * de todos los turnos (11:50, 11:25, 12:00, 12:40, 13:05), respetando faltas notificadas.
 */

import { createClient } from '@supabase/supabase-js';

const url = 'https://bwtqyyhsucqmijimuzlc.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3dHF5eWhzdWNxbWlqaW11emxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NDA0MTMsImV4cCI6MjEwMzUxNjQxM30.hbrm6boUabXaj6bj0Plm7QKR00AijncaYr7NYBE77tc';

const sb = createClient(url, anonKey, { auth: { persistSession: false } });

function getPricePerPlate(curso) {
  const c = String(curso || '').toUpperCase();
  if (c.includes('KINDER') || c.includes('PRE-KINDER') || c.includes('PRE KINDER')) return 30;
  return 32;
}

function calculateRowTotals(asistencias, curso) {
  const as = asistencias || {};
  const price = getPricePerPlate(curso);
  let platos = 0;
  let meriendas = 0;

  Object.keys(as).forEach((k) => {
    if (k.endsWith('_color') || k.endsWith('_nota')) return;
    const val = String(as[k]).trim().toUpperCase();
    if (val === '1') platos += 1;
    else if (val === '4') {
      platos += 1;
      meriendas += 1;
    } else if (val === 'M') {
      meriendas += 1;
    }
  });

  return {
    platos_vendidos: platos,
    platos_vendidos_bs: platos * price,
    meriendas_consumidas: meriendas,
    meriendas_consumidas_bs: meriendas * 10
  };
}

async function run() {
  console.log('--- CARGANDO ASISTENCIA HISTÓRICA DÍAS 7 Y 8 EN OCTUBRE 2026 ---');

  const { data: rows, error } = await sb.from('cobros').select('*').eq('mes', '2026-10');
  if (error) throw error;

  let updatedCount = 0;
  const turnsCount = {};

  for (const row of rows) {
    const as = { ...(row.asistencias || {}) };

    // Analizar comensal habitual en días 1, 2, 5, 6
    let daysAttended = 0;
    const codeCount = { '1': 0, '4': 0, 'M': 0 };

    [1, 2, 5, 6].forEach((d) => {
      const v = as[d];
      if (v && v !== 'F') {
        daysAttended++;
        codeCount[v] = (codeCount[v] || 0) + 1;
      }
    });

    // Si asiste habitualmente (al menos 2 de los 4 días transcurridos)
    if (daysAttended >= 2) {
      let dominantCode = '1';
      if ((codeCount['4'] || 0) > (codeCount['1'] || 0)) dominantCode = '4';
      else if ((codeCount['M'] || 0) > (codeCount['1'] || 0)) dominantCode = 'M';

      let changed = false;
      const isRafael = String(row.alumno || '').toLowerCase().includes('rafael');

      // Día 7 (Miércoles 7)
      if (!as['7'] || as['7'] === '') {
        as['7'] = dominantCode;
        if (dominantCode === '4') as['7_color'] = 'Amarillo';
        changed = true;
      }

      // Día 8 (Jueves 8)
      if (!as['8'] || as['8'] === '') {
        if (isRafael) {
          as['8'] = 'F';
          as['8_nota'] = 'Se quedó en casa, amaneció con fiebre';
        } else {
          as['8'] = dominantCode;
          if (dominantCode === '4') as['8_color'] = 'Amarillo';
        }
        changed = true;
      }

      if (changed) {
        const totals = calculateRowTotals(as, row.curso);
        const pagosBs = Number(row.pagos_bs || 0);
        const isMerienda = String(row.observaciones || '').toLowerCase().includes('merienda');
        let color = '';
        if (totals.platos_vendidos > 0 || pagosBs > 0) {
          if (isMerienda) color = 'Amarillo';
          else color = (pagosBs - totals.platos_vendidos_bs) >= 0 ? 'Verde' : 'Azul';
        }

        const { error: updErr } = await sb.from('cobros').update({
          asistencias: as,
          platos_vendidos: totals.platos_vendidos,
          platos_vendidos_bs: totals.platos_vendidos_bs,
          color: color,
          updated_at: new Date().toISOString()
        }).eq('id', row.id);

        if (updErr) {
          console.error(`Error actualizando ${row.alumno}:`, updErr);
        } else {
          updatedCount++;
          const t = row.turno || 'SIN_TURNO';
          turnsCount[t] = (turnsCount[t] || 0) + 1;
        }
      }
    }
  }

  console.log(`\n======================================================`);
  console.log(`¡EXITO! Se completaron ${updatedCount} alumnos en Octubre 2026.`);
  console.log('Desglose por turno:', turnsCount);
  console.log(`======================================================\n`);
}

run().catch((e) => console.error('Error:', e));
