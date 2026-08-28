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

  // Create query to search for the student
  let query = supabaseCobrosAdmin
    .from('cobros')
    .select('*')
    .ilike('alumno', `%${nombre.trim()}%`);

  // Filter by month if provided
  if (mes) {
    query = query.eq('mes', mes);
  } else {
    // Sort by month descending so the caller gets the most recent records first
    query = query.order('mes', { ascending: false });
  }

  const { data: records, error } = await query;

  if (error) {
    throw error;
  }

  if (!records || records.length === 0) {
    return json({
      success: false,
      message: `No se encontró ningún registro de cobros para "${nombre}"` + (mes ? ` en el mes ${mes}.` : '.')
    }, 404);
  }

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

    // Default balance calculation: negative of consumed plates (debt).
    // Can be easily modified once the user provides their custom rules.
    const saldoBs = -Number(record.platos_vendidos_bs || 0);

    return {
      id: record.id,
      alumno: record.alumno,
      curso: record.curso,
      mes: record.mes,
      fecha_inicio: record.fecha_inicio || null,
      fecha_fin: record.fecha_fin || null,
      observaciones: record.observaciones || null,
      platos_vendidos: record.platos_vendidos || 0,
      platos_vendidos_bs: record.platos_vendidos_bs || 0,
      dias_consumidos: diasConsumidos, // e.g. ["3", "10", "13"]
      saldo_bs: saldoBs,
      color: record.color || null,
      info_saldo: saldoBs < 0 
        ? `Tiene un saldo en contra de ${Math.abs(saldoBs)} Bs. por comidas consumidas en ${record.mes}.`
        : `Tiene un saldo a favor de ${saldoBs} Bs. en ${record.mes}.`
    };
  });

  return json({
    success: true,
    query: nombre,
    results: formattedResults
  });
});
