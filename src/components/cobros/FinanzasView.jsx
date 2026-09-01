import React, { useMemo, useState } from 'react';
import { 
  TrendingUp, 
  DollarSign, 
  AlertTriangle, 
  Calendar, 
  Clock, 
  PieChart, 
  ArrowUpRight, 
  CheckCircle2, 
  UserX,
  Copy,
  Check
} from 'lucide-react';
import './FinanzasView.css';

export default function FinanzasView({ allMonthData, selectedMonth, monthLabel, turnsList, workingDays, getPricePerPlate, onSettleStudent }) {
  const [selectedTurnFilter, setSelectedTurnFilter] = useState('ALL');
  const [copiedId, setCopiedId] = useState(null);

  // Financial KPIs Calculations
  const metrics = useMemo(() => {
    const totalWorkingDays = workingDays.length;
    let totalAlumnos = allMonthData.length;
    let totalPlatosVendidos = 0;
    let totalFacturadoBs = 0;
    let totalCobradoBs = 0;
    let totalDeudaBs = 0;
    let totalEstimadoMesCompletoBs = 0;

    const inDebtStudents = [];
    const dailyPlates = {};
    workingDays.forEach(d => {
      dailyPlates[d.key] = { label: d.label, count: 0, bs: 0 };
    });

    allMonthData.forEach(r => {
      const price = getPricePerPlate(r.curso);
      const platos = Number(r.platos_vendidos || 0);
      const facturado = Number(r.platos_vendidos_bs || 0);
      const cobrado = Number(r.pagos_bs || 0);
      const net = cobrado - facturado;

      totalPlatosVendidos += platos;
      totalFacturadoBs += facturado;
      totalCobradoBs += cobrado;
      totalEstimadoMesCompletoBs += (totalWorkingDays * price);

      if (net < 0) {
        totalDeudaBs += Math.abs(net);
        inDebtStudents.push({
          id: r.id,
          alumno: r.alumno,
          curso: r.curso,
          turno: r.turno,
          observaciones: r.observaciones,
          platos_vendidos: platos,
          platos_vendidos_bs: facturado,
          pagos_bs: cobrado,
          deuda: Math.abs(net)
        });
      }

      // Compute daily consumption
      if (r.asistencias) {
        Object.entries(r.asistencias).forEach(([dayKey, val]) => {
          const sVal = String(val || '').trim().toUpperCase();
          if (sVal && sVal !== '0' && sVal !== 'F' && dailyPlates[dayKey]) {
            dailyPlates[dayKey].count += 1;
            dailyPlates[dayKey].bs += price;
          }
        });
      }
    });

    inDebtStudents.sort((a, b) => b.deuda - a.deuda);

    const collectionRate = totalFacturadoBs > 0 
      ? Math.min(100, Math.round((totalCobradoBs / totalFacturadoBs) * 100))
      : 100;

    return {
      totalAlumnos,
      totalPlatosVendidos,
      totalFacturadoBs,
      totalCobradoBs,
      totalDeudaBs,
      totalEstimadoMesCompletoBs,
      collectionRate,
      inDebtStudents,
      dailyPlates: Object.values(dailyPlates)
    };
  }, [allMonthData, workingDays, getPricePerPlate]);

  // Turn Breakdown
  const turnBreakdown = useMemo(() => {
    const totalWorkingDays = workingDays.length;
    return turnsList.map(turn => {
      const turnRecords = allMonthData.filter(r => r.turno === turn.value);
      const count = turnRecords.length;
      const platos = turnRecords.reduce((sum, r) => sum + Number(r.platos_vendidos || 0), 0);
      const facturado = turnRecords.reduce((sum, r) => sum + Number(r.platos_vendidos_bs || 0), 0);
      const cobrado = turnRecords.reduce((sum, r) => sum + Number(r.pagos_bs || 0), 0);
      const deuda = turnRecords.reduce((sum, r) => {
        const net = Number(r.pagos_bs || 0) - Number(r.platos_vendidos_bs || 0);
        return net < 0 ? sum + Math.abs(net) : sum;
      }, 0);

      const estimado = turnRecords.reduce((sum, r) => {
        return sum + (totalWorkingDays * getPricePerPlate(r.curso));
      }, 0);

      const rate = facturado > 0 ? Math.min(100, Math.round((cobrado / facturado) * 100)) : 100;

      return {
        ...turn,
        count,
        platos,
        facturado,
        cobrado,
        deuda,
        estimado,
        rate
      };
    });
  }, [allMonthData, turnsList, workingDays, getPricePerPlate]);

  // Filtered debt list
  const filteredDebtStudents = useMemo(() => {
    if (selectedTurnFilter === 'ALL') return metrics.inDebtStudents;
    return metrics.inDebtStudents.filter(s => s.turno === selectedTurnFilter);
  }, [metrics.inDebtStudents, selectedTurnFilter]);

  // Max daily count for chart scaling
  const maxDailyCount = useMemo(() => {
    const counts = metrics.dailyPlates.map(d => d.count);
    return Math.max(...counts, 10);
  }, [metrics.dailyPlates]);

  const copyDebtInfo = (student) => {
    const text = `Hola! Te escribimos de B·FIT SCIS. El alumno ${student.alumno} (${student.curso} - Turno ${student.turno}) tiene un saldo pendiente de ${student.deuda} Bs correspondiente a sus consumos de ${monthLabel}.`;
    navigator.clipboard.writeText(text);
    setCopiedId(student.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="finanzas-container animate-fade-in">
      {/* 1. KPI Cards Grid */}
      <div className="kpi-grid">
        <div className="kpi-card kpi-card--primary">
          <div className="kpi-header">
            <span className="kpi-title">Cobros Recibidos</span>
            <div className="kpi-icon-badge bg-emerald"><DollarSign size={20} /></div>
          </div>
          <div className="kpi-value text-emerald">{metrics.totalCobradoBs.toLocaleString()} <span className="kpi-unit">Bs</span></div>
          <div className="kpi-footer">
            <span>Pagos registrados en {monthLabel}</span>
          </div>
        </div>

        <div className="kpi-card kpi-card--info">
          <div className="kpi-header">
            <span className="kpi-title">Consumo Facturado</span>
            <div className="kpi-icon-badge bg-blue"><TrendingUp size={20} /></div>
          </div>
          <div className="kpi-value text-blue">{metrics.totalFacturadoBs.toLocaleString()} <span className="kpi-unit">Bs</span></div>
          <div className="kpi-footer">
            <span>{metrics.totalPlatosVendidos} platos consumidos</span>
          </div>
        </div>

        <div className="kpi-card kpi-card--danger">
          <div className="kpi-header">
            <span className="kpi-title">Saldo Pendiente (Deuda)</span>
            <div className="kpi-icon-badge bg-red"><AlertTriangle size={20} /></div>
          </div>
          <div className="kpi-value text-red">{metrics.totalDeudaBs.toLocaleString()} <span className="kpi-unit">Bs</span></div>
          <div className="kpi-footer">
            <span>{metrics.inDebtStudents.length} alumnos con saldo en contra</span>
          </div>
        </div>

        <div className="kpi-card kpi-card--warning">
          <div className="kpi-header">
            <span className="kpi-title">Ingreso Estimado Mes</span>
            <div className="kpi-icon-badge bg-amber"><PieChart size={20} /></div>
          </div>
          <div className="kpi-value text-amber">{metrics.totalEstimadoMesCompletoBs.toLocaleString()} <span className="kpi-unit">Bs</span></div>
          <div className="kpi-footer">
            <span>Proyección 100% asistencia ({workingDays.length} días)</span>
          </div>
        </div>
      </div>

      {/* 2. Turn Breakdown Table */}
      <div className="finanzas-section premium-card">
        <div className="section-header">
          <div className="section-title">
            <Clock size={18} className="text-primary" />
            <h2>Rendimiento Financiero por Turno</h2>
          </div>
          <span className="section-badge">{allMonthData.length} Alumnos en Total</span>
        </div>

        <div className="table-responsive">
          <table className="finanzas-table">
            <thead>
              <tr>
                <th>Turno</th>
                <th className="text-center">Alumnos</th>
                <th className="text-center">Platos</th>
                <th className="text-right">Consumo (Bs)</th>
                <th className="text-right">Cobrado (Bs)</th>
                <th className="text-right">Pendiente (Bs)</th>
                <th className="text-right">Proyección Mes (Bs)</th>
                <th className="text-center">% Recaudación</th>
              </tr>
            </thead>
            <tbody>
              {turnBreakdown.map(t => (
                <tr key={t.value}>
                  <td className="font-semibold text-primary">{t.label}</td>
                  <td className="text-center font-medium">{t.count}</td>
                  <td className="text-center font-medium">{t.platos}</td>
                  <td className="text-right text-blue font-semibold">{t.facturado.toLocaleString()} Bs</td>
                  <td className="text-right text-emerald font-semibold">{t.cobrado.toLocaleString()} Bs</td>
                  <td className="text-right">
                    {t.deuda > 0 ? (
                      <span className="badge-deuda font-semibold">-{t.deuda.toLocaleString()} Bs</span>
                    ) : (
                      <span className="text-emerald font-semibold">0 Bs ✓</span>
                    )}
                  </td>
                  <td className="text-right text-muted">{t.estimado.toLocaleString()} Bs</td>
                  <td className="text-center">
                    <div className="progress-bar-container">
                      <div 
                        className={`progress-bar-fill ${t.rate >= 90 ? 'bg-emerald' : t.rate >= 60 ? 'bg-amber' : 'bg-red'}`} 
                        style={{ width: `${t.rate}%` }} 
                      />
                      <span className="progress-text">{t.rate}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Daily Consumption Activity Chart */}
      <div className="finanzas-section premium-card">
        <div className="section-header">
          <div className="section-title">
            <Calendar size={18} className="text-primary" />
            <h2>Consumo Diario de Almuerzos en {monthLabel}</h2>
          </div>
          <span className="section-badge">{workingDays.length} Días Hábiles</span>
        </div>

        <div className="daily-chart-container">
          <div className="daily-bars-grid">
            {metrics.dailyPlates.map((d, i) => {
              const heightPercent = maxDailyCount > 0 ? Math.round((d.count / maxDailyCount) * 100) : 0;
              return (
                <div key={i} className="daily-bar-item" title={`${d.label}: ${d.count} almuerzos (${d.bs} Bs)`}>
                  <span className="bar-count">{d.count > 0 ? d.count : ''}</span>
                  <div className="bar-track">
                    <div 
                      className={`bar-fill ${d.count > 0 ? 'bar-fill--active' : 'bar-fill--empty'}`} 
                      style={{ height: `${Math.max(heightPercent, 4)}%` }} 
                    />
                  </div>
                  <span className="bar-day-label">{d.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4. Pending Debt Management List */}
      <div className="finanzas-section premium-card">
        <div className="section-header">
          <div className="section-title">
            <UserX size={18} className="text-red" />
            <h2>Alumnos con Saldo Pendiente por Cobrar</h2>
          </div>
          <div className="filter-turn-tabs">
            <button 
              className={`turn-tab-btn ${selectedTurnFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setSelectedTurnFilter('ALL')}
            >
              Todos ({metrics.inDebtStudents.length})
            </button>
            {turnsList.map(t => {
              const count = metrics.inDebtStudents.filter(s => s.turno === t.value).length;
              return (
                <button 
                  key={t.value} 
                  className={`turn-tab-btn ${selectedTurnFilter === t.value ? 'active' : ''}`}
                  onClick={() => setSelectedTurnFilter(t.value)}
                >
                  {t.value} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {filteredDebtStudents.length === 0 ? (
          <div className="no-debt-message">
            <CheckCircle2 size={36} className="text-emerald" />
            <p>¡Excelente! No hay alumnos con saldo pendiente en este turno.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="finanzas-table">
              <thead>
                <tr>
                  <th>Alumno</th>
                  <th>Curso</th>
                  <th>Turno</th>
                  <th className="text-center">Platos Consumidos</th>
                  <th className="text-right">Consumo (Bs)</th>
                  <th className="text-right">Pagos Realizados (Bs)</th>
                  <th className="text-right">Deuda Pendiente</th>
                  <th className="text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredDebtStudents.map(student => (
                  <tr key={student.id}>
                    <td className="font-semibold">{student.alumno}</td>
                    <td><span className="badge-course">{student.curso}</span></td>
                    <td className="text-muted font-medium">{student.turno}</td>
                    <td className="text-center">{student.platos_vendidos}</td>
                    <td className="text-right">{student.platos_vendidos_bs} Bs</td>
                    <td className="text-right text-emerald">{student.pagos_bs} Bs</td>
                    <td className="text-right font-bold text-red">-{student.deuda} Bs</td>
                    <td className="text-center">
                      <div className="action-buttons-cell">
                        <button 
                          className="btn-action-sm btn-copy-debt"
                          onClick={() => copyDebtInfo(student)}
                          title="Copiar mensaje de aviso para WhatsApp"
                        >
                          {copiedId === student.id ? <Check size={14} className="text-emerald" /> : <Copy size={14} />}
                          <span>{copiedId === student.id ? 'Copiado' : 'Aviso'}</span>
                        </button>
                        {onSettleStudent && (
                          <button 
                            className="btn-action-sm btn-settle-debt"
                            onClick={() => onSettleStudent(student.id)}
                            title="Marcar al día (igualar pago a platos consumidos)"
                          >
                            <span>Saldar</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

