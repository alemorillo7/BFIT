import { supabaseCobrosAdmin } from './_lib/supabaseCobros.js';
import { json, methodNotAllowed, withErrorHandling } from './_lib/http.js';

export const config = { runtime: 'edge' };

export default withErrorHandling(async (request) => {
  if (request.method !== 'GET') {
    return methodNotAllowed();
  }

  const url = new URL(request.url);
  const searchParams = url.searchParams;
  const mes = searchParams.get('mes'); // e.g. '2026-08'
  const turno = searchParams.get('turno'); // e.g. '11:50'

  let query = supabaseCobrosAdmin
    .from('cobros')
    .select('*');

  // Filter by month if provided
  if (mes) {
    query = query.eq('mes', mes);
  }

  // Filter by turn if provided
  if (turno) {
    query = query.eq('turno', turno);
  }

  // Order by student name alphabetically
  query = query.order('alumno', { ascending: true });

  const { data: records, error } = await query;

  if (error) {
    throw error;
  }

  // Format results using the same color-based balance rules
  const formattedResults = (records || []).map(record => {
    const asistencias = record.asistencias || {};
    
    // Extract calendar days consumed
    const diasConsumidos = Object.keys(asistencias)
      .filter(dayKey => {
        const val = String(asistencias[dayKey]).trim();
        return val && val !== '0';
      })
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

    // Balance rules:
    // - Azul (Blue): Pending debt = -platos_vendidos_bs
    // - Verde (Green): Prepaid / Credit in favor
    // - Amarillo (Yellow) / FFF2CC: Almuerzo + Merienda
    // - Other: Neutral (paid/no debt)
    let saldoBs;
    let infoSaldo;
    const colorNorm = String(record.color || '').toUpperCase();

    if (colorNorm === 'AZUL') {
      saldoBs = -Number(record.platos_vendidos_bs || 0);
      infoSaldo = record.platos_vendidos === 0
        ? `Tiene saldo al día en ${record.mes}. (No registra consumos).`
        : `Tiene un saldo en contra de ${Math.abs(saldoBs)} Bs. por comidas consumidas no pagadas en ${record.mes}.`;
    } else if (colorNorm === 'VERDE') {
      saldoBs = 0;
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
      platos_vendidos: record.platos_vendidos || 0,
      platos_vendidos_bs: record.platos_vendidos_bs || 0,
      dias_consumidos: diasConsumidos,
      saldo_bs: saldoBs,
      color: record.color || null,
      info_saldo: infoSaldo
    };
  });

  return json({
    success: true,
    total_records: formattedResults.length,
    results: formattedResults
  });
});
