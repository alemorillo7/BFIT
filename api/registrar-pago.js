import { supabaseCobrosAdmin } from './_lib/supabaseCobros.js';
import { badRequest, json, methodNotAllowed, withErrorHandling } from './_lib/http.js';

export const config = { runtime: 'edge' };

// Word-based tokenization for fuzzy matching
const getWords = (name) => {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9 ]/g, " ") // keep only alphanumeric and space
    .split(/\s+/)
    .filter(w => w.length >= 3 && !['del', 'las', 'los', 'pre', 'kin', 'kinder'].includes(w));
};

export default withErrorHandling(async (request) => {
  // Support both GET and POST for ease of integration in n8n
  if (request.method !== 'GET' && request.method !== 'POST') {
    return methodNotAllowed();
  }

  let nombre;
  let mes;
  let saldoPara;
  let monto;

  if (request.method === 'GET') {
    const url = new URL(request.url);
    nombre = url.searchParams.get('nombre') || url.searchParams.get('alumno');
    mes = url.searchParams.get('mes');
    saldoPara = url.searchParams.get('saldo_para') || 'Almuerzo';
    monto = url.searchParams.get('monto') || url.searchParams.get('monto_declarado') || '0';
  } else {
    // POST request
    try {
      const body = await request.json();
      nombre = body.nombre || body.alumno;
      mes = body.mes;
      saldoPara = body.saldo_para || 'Almuerzo';
      monto = body.monto || body.monto_declarado || 0;
    } catch {
      return badRequest('Cuerpo de petición JSON inválido.');
    }
  }

  if (!nombre) {
    return badRequest('Debe proporcionar el parámetro "nombre" o "alumno".');
  }

  // Retrieve all records to do fuzzy matching
  const { data: allRecords, error: fetchErr } = await supabaseCobrosAdmin
    .from('cobros')
    .select('*');

  if (fetchErr) {
    throw fetchErr;
  }

  // Determine target month (default to most recent month in database if not specified)
  const targetMes = mes || '2026-08';
  const filteredRecords = allRecords.filter(r => r.mes === targetMes);

  const sheetWords = getWords(nombre);
  let bestMatch = null;
  let maxMatches = 0;

  filteredRecords.forEach(record => {
    const dbWords = getWords(record.alumno);
    let matches = 0;
    sheetWords.forEach(sWord => {
      dbWords.forEach(dWord => {
        if (sWord === dWord) {
          matches++;
        } else if (sWord.length >= 4 && dWord.length >= 4) {
          if (sWord.startsWith(dWord) || dWord.startsWith(sWord)) {
            matches++;
          }
        }
      });
    });

    if (matches > maxMatches) {
      maxMatches = matches;
      bestMatch = record;
    }
  });

  if (!bestMatch || maxMatches < 2) {
    return json({
      success: false,
      message: `No se encontró ningún alumno en Cobros (${targetMes}) que coincida con "${nombre}".`
    }, 404);
  }

  const montoNum = Number(monto || 0);
  const updateData = {
    updated_at: new Date().toISOString()
  };

  if (String(saldoPara).toLowerCase() === 'almuerzo') {
    const nuevosPagos = Number(bestMatch.pagos_bs || 0) + montoNum;
    const nuevoSaldo = nuevosPagos - Number(bestMatch.platos_vendidos_bs || 0);

    updateData.pagos_bs = nuevosPagos;
    // Set color dynamically: Green (Verde) if balance is >= 0, otherwise Blue (Azul)
    updateData.color = nuevoSaldo >= 0 ? 'Verde' : 'Azul';
  } else {
    const nuevoSaldoMerienda = Number(bestMatch.saldo_merienditas || 0) + montoNum;
    updateData.saldo_merienditas = nuevoSaldoMerienda;
  }

  const { data: updated, error: updateErr } = await supabaseCobrosAdmin
    .from('cobros')
    .update(updateData)
    .eq('id', bestMatch.id)
    .select();

  if (updateErr) {
    throw updateErr;
  }

  return json({
    success: true,
    message: `Pago registrado con éxito en Cobros para el mes ${targetMes}.`,
    original_query: nombre,
    match: {
      id: bestMatch.id,
      alumno: bestMatch.alumno,
      curso: bestMatch.curso,
      turno: bestMatch.turno,
      mes: bestMatch.mes,
      pagos_bs: updated[0].pagos_bs,
      saldo_merienditas: updated[0].saldo_merienditas,
      nuevo_color: updated[0].color
    }
  });
});
