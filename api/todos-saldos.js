import { supabaseCobrosAdmin } from './_lib/supabaseCobros.js';
import { json, methodNotAllowed, withErrorHandling } from './_lib/http.js';
import { courseSupportsSnack, getAttendanceConsumption, isAttendanceDayKey, SNACK_PRICE_BS } from '../shared/attendance.js';

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
    
    // Extract only actual day cells with a lunch or snack; notes are JSON keys too.
    const diasConsumidos = Object.keys(asistencias)
      .filter(dayKey => {
        if (!isAttendanceDayKey(dayKey)) return false;
        const consumption = getAttendanceConsumption(asistencias[dayKey]);
        return consumption.lunches > 0 || consumption.snacks > 0;
      })
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

    // Balance rules:
    // - Azul (Blue): Pending debt = -platos_vendidos_bs
    // - Verde (Green): Prepaid / Credit in favor
    // - Amarillo (Yellow) / FFF2CC: Almuerzo + Merienda
    // - Other: Neutral (paid/no debt)
    const pagosBs = Number(record.pagos_bs || 0);
    const platosVendidosBs = Number(record.platos_vendidos_bs || 0);
    const saldoBs = pagosBs - platosVendidosBs;

    // Calculate meriendas: days with '4' (Almuerzo+Merienda) or 'M' (Solo Merienda)
    const diasMerienda = courseSupportsSnack(record.curso)
      ? Object.keys(asistencias).reduce((total, dayKey) => (
        isAttendanceDayKey(dayKey) ? total + getAttendanceConsumption(asistencias[dayKey]).snacks : total
      ), 0)
      : 0;
    const pagosMerienditas = courseSupportsSnack(record.curso) ? Number(record.saldo_merienditas || 0) : 0;
    const costoMerienditas = diasMerienda * SNACK_PRICE_BS;
    const saldoMerienditasNeto = pagosMerienditas - costoMerienditas;

    let infoSaldo;
    if (saldoBs > 0) {
      infoSaldo = `Tiene crédito a favor de ${saldoBs} Bs. para almuerzos en ${record.mes}.`;
    } else if (saldoBs < 0) {
      infoSaldo = `Tiene un saldo en contra de ${Math.abs(saldoBs)} Bs. por almuerzos no pagados en ${record.mes}.`;
    } else {
      infoSaldo = `Tiene saldo al día en almuerzos (0 Bs) en ${record.mes}.`;
    }

    if (diasMerienda > 0 || pagosMerienditas > 0) {
      if (saldoMerienditasNeto > 0) {
        infoSaldo += ` Saldo a favor en meriendas: ${saldoMerienditasNeto} Bs.`;
      } else if (saldoMerienditasNeto < 0) {
        infoSaldo += ` Saldo en contra en meriendas: ${Math.abs(saldoMerienditasNeto)} Bs.`;
      } else {
        infoSaldo += ` Saldo al día en meriendas (0 Bs).`;
      }
    }

    return {
      id: record.id,
      alumno: record.alumno,
      curso: record.curso,
      mes: record.mes,
      turno: record.turno,
      platos_vendidos: record.platos_vendidos || 0,
      platos_vendidos_bs: record.platos_vendidos_bs || 0,
      pagos_bs: pagosBs,
      saldo_merienditas: saldoMerienditasNeto,
      pagos_merienditas: pagosMerienditas,
      meriendas_consumidas: diasMerienda,
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
