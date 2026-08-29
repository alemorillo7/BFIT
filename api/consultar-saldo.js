import { supabaseCobrosAdmin } from './_lib/supabaseCobros.js';
import { badRequest, json, methodNotAllowed, withErrorHandling } from './_lib/http.js';

export const config = { runtime: 'edge' };

export default withErrorHandling(async (request) => {
  if (request.method !== 'GET') {
    return methodNotAllowed();
  }

  const url = new URL(request.url);
  const searchParams = url.searchParams;
  const nombre = searchParams.get('nombre') || searchParams.get('alumno');
  const mes = searchParams.get('mes'); // e.g., '2026-08'

  if (!nombre) {
    return badRequest('Debe proporcionar el parámetro "nombre" o "alumno" para realizar la consulta.');
  }

  // Retrieve all records to do fuzzy matching
  const { data: allRecords, error } = await supabaseCobrosAdmin
    .from('cobros')
    .select('*');

  if (error) {
    throw error;
  }

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

  const targetMes = mes || '2026-08';
  const filteredRecords = allRecords.filter(r => r.mes === targetMes);

  const queryWords = getWords(nombre);
  let bestMatch = null;
  let maxMatches = 0;

  filteredRecords.forEach(record => {
    const dbWords = getWords(record.alumno);
    let matches = 0;
    queryWords.forEach(sWord => {
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
      message: `No se encontró ningún registro de cobros para "${nombre}" en el mes ${targetMes}.`
    }, 404);
  }

  const records = [bestMatch];

  // Format the results dynamically from the JSONB asistencias object
  const formattedResults = records.map(record => {
    const asistencias = record.asistencias || {};
    
    // Extract the calendar days that have active meals (value is not '0')
    const diasConsumidos = Object.keys(asistencias)
      .filter(dayKey => {
        const val = String(asistencias[dayKey]).trim();
        return val && val !== '0';
      })
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10)); // Sort numerically

    // Balance calculation based on color rules:
    // - Azul (Blue): Pending debt (saldo en contra) = -platos_vendidos_bs
    // - Verde (Green): Credit in favor (saldo a favor / prepaid)
    // - Amarillo (Yellow) / FFF2CC: Almuerzo + Merienda (paid/neutral)
    // - None/Other: Neutral (paid/no debt)
    let saldoBs;
    let infoSaldo;
    const colorNorm = String(record.color || '').toUpperCase();

    if (colorNorm === 'AZUL') {
      saldoBs = -Number(record.platos_vendidos_bs || 0);
      infoSaldo = record.platos_vendidos === 0
        ? `Tiene saldo al día en ${record.mes}. (No registra consumos).`
        : `Tiene un saldo en contra de ${Math.abs(saldoBs)} Bs. por comidas consumidas no pagadas en ${record.mes}.`;
    } else if (colorNorm === 'VERDE') {
      saldoBs = 0; // Prepaid/credit in favor
      infoSaldo = record.platos_vendidos === 0
        ? `Tiene crédito a favor (Al día) en ${record.mes}. (No registra consumos).`
        : `Tiene crédito a favor (Todo pagado / Al día) en ${record.mes}.`;
    } else if (colorNorm === 'AMARILLO' || colorNorm === 'FFF2CC') {
      saldoBs = 0;
      infoSaldo = record.platos_vendidos === 0
        ? `Tiene saldo al día en ${record.mes} (Almuerzo + Merienda). No registra consumos.`
        : `Tiene saldo al día en ${record.mes} (Consume almuerzo + merienda).`;
    } else {
      saldoBs = 0;
      infoSaldo = record.platos_vendidos === 0
        ? `Tiene saldo al día en ${record.mes}. (No registra consumos).`
        : `Tiene saldo al día (Sin deudas pendientes) en ${record.mes}.`;
    }

    return {
      id: record.id,
      alumno: record.alumno,
      curso: record.curso,
      mes: record.mes,
      turno: record.turno,
      fecha_inicio: record.fecha_inicio || null,
      fecha_fin: record.fecha_fin || null,
      observaciones: record.observaciones || null,
      platos_vendidos: record.platos_vendidos || 0,
      platos_vendidos_bs: record.platos_vendidos_bs || 0,
      dias_consumidos: diasConsumidos, // e.g. ["3", "10", "13"]
      saldo_bs: saldoBs,
      color: record.color || null,
      info_saldo: infoSaldo
    };
  });

  return json({
    success: true,
    query: nombre,
    results: formattedResults
  });
});
