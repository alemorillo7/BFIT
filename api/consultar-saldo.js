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

  if (!nombre) {
    return badRequest('Debe proporcionar el parámetro "nombre" o "alumno" para realizar la consulta.');
  }

  // Search for the student in the cobros table using ilike
  const { data: records, error } = await supabaseCobrosAdmin
    .from('cobros')
    .select('*')
    .ilike('alumno', `%${nombre.trim()}%`);

  if (error) {
    throw error;
  }

  if (!records || records.length === 0) {
    return json({
      success: false,
      message: `No se encontró ningún alumno que coincida con "${nombre}".`
    }, 404);
  }

  // Format the results for the external consumer
  const formattedResults = records.map(record => {
    // Determine which days were consumed (cells with values other than 0 and null)
    const diasConsumidos = [];
    const dayKeys = [
      'd3', 'd4', 'd5', 'd10', 'd11', 'd12', 'd13', 'd14', 'd17', 'd18', 'd19', 'd20', 'd21', 'd24', 'd25', 'd26', 'd27', 'd28', 'd31'
    ];
    const dayLabels = {
      d3: '3', d4: '4', d5: '5', d10: '10', d11: '11', d12: '12', d13: '13', d14: '14', d17: '17', d18: '18', d19: '19', d20: '20', d21: '21', d24: '24', d25: '25', d26: '26', d27: '27', d28: '28', d31: '31'
    };

    dayKeys.forEach(k => {
      const val = String(record[k] || '').trim();
      if (val && val !== '0') {
        diasConsumidos.push(dayLabels[k]);
      }
    });

    // Default balance rules: currently set to negative of consumed plates (debt), 
    // to be adjusted once the user provides the final balance logic.
    const saldoBs = -Number(record.platos_vendidos_bs || 0);

    return {
      id: record.id,
      alumno: record.alumno,
      curso: record.curso,
      fecha_inicio: record.fecha_inicio || null,
      fecha_fin: record.fecha_fin || null,
      observaciones: record.observaciones || null,
      platos_vendidos: record.platos_vendidos || 0,
      platos_vendidos_bs: record.platos_vendidos_bs || 0,
      dias_consumidos: diasConsumidos,
      saldo_bs: saldoBs,
      color: record.color || null,
      info_saldo: saldoBs < 0 
        ? `Tiene un saldo en contra de ${Math.abs(saldoBs)} Bs. por comidas consumidas.`
        : `Tiene un saldo a favor de ${saldoBs} Bs.`
    };
  });

  return json({
    success: true,
    query: nombre,
    results: formattedResults
  });
});
