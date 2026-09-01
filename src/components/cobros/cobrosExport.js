import * as XLSX from 'xlsx';

/**
 * Exports all turns and a general financial summary for the selected month to an .xlsx file.
 * @param {Array} allMonthData - All records from cobros for the selected month.
 * @param {string} selectedMonth - e.g. "2026-08"
 * @param {Array} workingDays - Array of working days objects { key, label, dayNum }
 * @param {Array} turnsList - List of turns { value, label }
 * @param {string} monthLabel - e.g. "Agosto 2026"
 */
export const exportFullExcelWorkbook = (allMonthData, selectedMonth, workingDays, turnsList, monthLabel) => {
  const wb = XLSX.utils.book_new();

  // 1. Sheet: RESUMEN GENERAL (Para la Contadora)
  const summaryRows = [
    ['B-FIT - REPORTE CONSOLIDADO DE COBROS Y VENTAS'],
    [`Mes: ${monthLabel}`, `Fecha de Generación: ${new Date().toLocaleDateString('es-BO')}`],
    [],
    ['TURNO', 'CURSOS', 'CANT. ALUMNOS', 'PLATOS VENDIDOS', 'TOTAL VENTAS (BS)', 'TOTAL PAGOS (BS)', 'SALDO PENDIENTE (BS)', 'ESTADO']
  ];

  let grandTotalAlumnos = 0;
  let grandTotalPlatos = 0;
  let grandTotalVentasBs = 0;
  let grandTotalPagosBs = 0;
  let grandTotalDeudaBs = 0;

  turnsList.forEach(turn => {
    const turnData = allMonthData.filter(r => r.turno === turn.value);
    const alumnosCount = turnData.length;
    const platos = turnData.reduce((sum, r) => sum + Number(r.platos_vendidos || 0), 0);
    const ventasBs = turnData.reduce((sum, r) => sum + Number(r.platos_vendidos_bs || 0), 0);
    const pagosBs = turnData.reduce((sum, r) => sum + Number(r.pagos_bs || 0), 0);
    const deudaBs = turnData.reduce((sum, r) => {
      const net = Number(r.pagos_bs || 0) - Number(r.platos_vendidos_bs || 0);
      return net < 0 ? sum + Math.abs(net) : sum;
    }, 0);

    const cursosList = [...new Set(turnData.map(r => r.curso).filter(Boolean))].join(', ');

    grandTotalAlumnos += alumnosCount;
    grandTotalPlatos += platos;
    grandTotalVentasBs += ventasBs;
    grandTotalPagosBs += pagosBs;
    grandTotalDeudaBs += deudaBs;

    summaryRows.push([
      turn.label,
      cursosList || '-',
      alumnosCount,
      platos,
      ventasBs,
      pagosBs,
      deudaBs,
      deudaBs > 0 ? 'Con Saldos Pendientes' : 'Al Día'
    ]);
  });

  // Grand totals row
  summaryRows.push([]);
  summaryRows.push([
    'TOTAL GENERAL',
    'TODOS LOS CURSOS',
    grandTotalAlumnos,
    grandTotalPlatos,
    grandTotalVentasBs,
    grandTotalPagosBs,
    grandTotalDeudaBs,
    grandTotalDeudaBs > 0 ? `Deuda Total: ${grandTotalDeudaBs} Bs` : 'Todo al día'
  ]);

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  // Column width styling
  wsSummary['!cols'] = [
    { wch: 18 },
    { wch: 25 },
    { wch: 15 },
    { wch: 18 },
    { wch: 20 },
    { wch: 20 },
    { wch: 22 },
    { wch: 24 }
  ];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen General');

  // 2. Sheets for Each Turn (11:50, 11:25, 12:00, 12:40, 13:05)
  turnsList.forEach(turn => {
    const turnData = allMonthData
      .filter(r => r.turno === turn.value)
      .sort((a, b) => String(a.alumno).localeCompare(String(b.alumno)));

    const sheetName = `Turno_${turn.value.replace(':', '_')}`;

    // Table Header
    const headers = [
      'Nro.',
      'ALUMNO',
      'CURSO',
      'TURNO',
      'FECHA INICIO',
      'FECHA FIN',
      'OBSERVACIONES'
    ];

    // Add days headers
    workingDays.forEach(d => {
      headers.push(d.label);
    });

    // Calculated totals headers
    headers.push(
      'PLATOS VENDIDOS',
      'IMPORTE (BS)',
      'PAGOS (BS)',
      'SALDO ALMUERZO (BS)',
      'SALDO MERIENDA (BS)',
      'ESTADO / COLOR'
    );

    const rows = [headers];

    turnData.forEach((row, idx) => {
      const dataRow = [
        idx + 1,
        row.alumno || '',
        row.curso || '',
        row.turno || '',
        row.fecha_inicio || '',
        row.fecha_fin || '',
        row.observaciones || ''
      ];

      // Day attendance values
      workingDays.forEach(d => {
        const val = row.asistencias && row.asistencias[d.key] !== undefined ? row.asistencias[d.key] : '';
        dataRow.push(val);
      });

      const netBalance = Number(row.pagos_bs || 0) - Number(row.platos_vendidos_bs || 0);

      dataRow.push(
        row.platos_vendidos || 0,
        row.platos_vendidos_bs || 0,
        row.pagos_bs || 0,
        netBalance,
        row.saldo_merienditas || 0,
        row.color || (netBalance >= 0 ? 'Verde (Al día)' : 'Azul (Debe)')
      );

      rows.push(dataRow);
    });

    // Add footer totals
    if (turnData.length > 0) {
      const footerRow = ['TOTALES', '', '', '', '', '', ''];
      workingDays.forEach(() => footerRow.push(''));

      const sumPlatos = turnData.reduce((acc, r) => acc + Number(r.platos_vendidos || 0), 0);
      const sumVentasBs = turnData.reduce((acc, r) => acc + Number(r.platos_vendidos_bs || 0), 0);
      const sumPagosBs = turnData.reduce((acc, r) => acc + Number(r.pagos_bs || 0), 0);
      const sumNet = sumPagosBs - sumVentasBs;
      const sumMeriendas = turnData.reduce((acc, r) => acc + Number(r.saldo_merienditas || 0), 0);

      footerRow.push(sumPlatos, sumVentasBs, sumPagosBs, sumNet, sumMeriendas, '');
      rows.push([]);
      rows.push(footerRow);
    }

    const wsTurn = XLSX.utils.aoa_to_sheet(rows);

    // Auto-calculate column widths
    wsTurn['!cols'] = [
      { wch: 6 },
      { wch: 32 },
      { wch: 10 },
      { wch: 8 },
      { wch: 12 },
      { wch: 12 },
      { wch: 28 },
      ...workingDays.map(() => ({ wch: 6 })),
      { wch: 16 },
      { wch: 14 },
      { wch: 14 },
      { wch: 18 },
      { wch: 18 },
      { wch: 16 }
    ];

    XLSX.utils.book_append_sheet(wb, wsTurn, sheetName);
  });

  // 3. Download the Excel file
  const fileName = `Planilla_Cobros_BFIT_${selectedMonth}_Completo.xlsx`;
  XLSX.writeFile(wb, fileName);
};
