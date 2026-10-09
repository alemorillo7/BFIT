/**
 * scripts/transfer7and8FromSepToOct.js
 * 
 * Pasa automáticamente las 53 asistencias del Miércoles 7 y Jueves 8 que Fernanda
 * cargó ayer por error dentro de la planilla de Septiembre a la planilla de Octubre 2026.
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
  console.log('Iniciando transferencia de días 7 y 8 a Octubre 2026...');

  const [resSep, resOct] = await Promise.all([
    sb.from('cobros').select('*').eq('mes', '2026-09').gte('updated_at', '2026-10-08T00:00:00.000Z'),
    sb.from('cobros').select('*').eq('mes', '2026-10')
  ]);

  if (resSep.error) throw resSep.error;
  if (resOct.error) throw resOct.error;

  const sepRows = resSep.data || [];
  const octRows = resOct.data || [];

  const octMap = new Map();
  octRows.forEach((r) => {
    const key = `${(r.alumno || '').trim().toLowerCase()}_${(r.turno || '').trim()}`;
    octMap.set(key, r);
  });

  let transferredCount = 0;

  for (const s of sepRows) {
    const sAs = s.asistencias || {};
    const d7 = sAs['7'] || sAs['07'];
    const d8 = sAs['8'] || sAs['08'];

    if (!d7 && !d8) continue;

    const key = `${(s.alumno || '').trim().toLowerCase()}_${(s.turno || '').trim()}`;
    const targetOct = octMap.get(key);

    if (!targetOct) {
      console.warn(`No se encontró en Octubre a: ${s.alumno} (${s.turno})`);
      continue;
    }

    const newOctAs = { ...(targetOct.asistencias || {}) };

    if (d7) {
      newOctAs['7'] = d7;
      if (sAs['7_nota']) newOctAs['7_nota'] = sAs['7_nota'];
      if (d7 === '4') newOctAs['7_color'] = 'Amarillo';
      else if (sAs['7_color'] && sAs['7_color'] !== 'none') newOctAs['7_color'] = sAs['7_color'];
    }

    if (d8) {
      newOctAs['8'] = d8;
      if (sAs['8_nota']) newOctAs['8_nota'] = sAs['8_nota'];
      if (d8 === '4') newOctAs['8_color'] = 'Amarillo';
      else if (sAs['8_color'] && sAs['8_color'] !== 'none') newOctAs['8_color'] = sAs['8_color'];
    }

    const totals = calculateRowTotals(newOctAs, targetOct.curso);
    const pagosBs = Number(targetOct.pagos_bs || 0);
    const isMerienda = String(targetOct.observaciones || '').toLowerCase().includes('merienda');
    let color = '';
    if (totals.platos_vendidos > 0 || pagosBs > 0) {
      if (isMerienda) color = 'Amarillo';
      else color = (pagosBs - totals.platos_vendidos_bs) >= 0 ? 'Verde' : 'Azul';
    }

    const { error: updErr } = await sb.from('cobros').update({
      asistencias: newOctAs,
      platos_vendidos: totals.platos_vendidos,
      platos_vendidos_bs: totals.platos_vendidos_bs,
      color: color,
      updated_at: new Date().toISOString()
    }).eq('id', targetOct.id);

    if (updErr) {
      console.error(`Error actualizando a ${targetOct.alumno}:`, updErr);
    } else {
      transferredCount++;
      console.log(`[OK ${transferredCount}] ${targetOct.alumno} (${targetOct.turno}) -> D7: ${d7 || '-'}, D8: ${d8 || '-'} | Total platos: ${totals.platos_vendidos}`);
    }
  }

  console.log(`\n======================================================`);
  console.log(`¡COMPLETADO! Se transfirieron exitosamente ${transferredCount} alumnos a Octubre 2026.`);
  console.log(`======================================================\n`);
}

run().catch((e) => console.error('Error:', e));
