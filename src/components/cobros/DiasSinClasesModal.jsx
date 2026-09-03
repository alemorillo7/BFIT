import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar as CalendarIcon, 
  X, 
  Check, 
  AlertCircle, 
  Trash2, 
  Plus, 
  Save, 
  Info,
  ChevronLeft,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { 
  getNonSchoolDaysForMonth, 
  saveNonSchoolDaysForMonth, 
  DEFAULT_NON_SCHOOL_DAYS 
} from '../../services/calendarService';
import './DiasSinClasesModal.css';

export default function DiasSinClasesModal({
  isOpen,
  onClose,
  currentMonth,
  monthsList,
  onCalendarSaved
}) {
  const [selectedMonth, setSelectedMonth] = useState(currentMonth || '2026-09');
  const [nonSchoolDays, setNonSchoolDays] = useState([]);
  const [editingReasonDay, setEditingReasonDay] = useState(null);
  const [customReason, setCustomReason] = useState('');
  const [syncToObservaciones, setSyncToObservaciones] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Sync state whenever modal opens or month changes
  useEffect(() => {
    if (isOpen) {
      const initialDays = getNonSchoolDaysForMonth(selectedMonth);
      setNonSchoolDays([...initialDays]);
      setSavedSuccess(false);
      setEditingReasonDay(null);
    }
  }, [isOpen, selectedMonth]);

  // Compute calendar grid for the selected month
  const calendarGrid = useMemo(() => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    const firstDayDate = new Date(year, month - 1, 1);
    // Sunday = 0, Monday = 1... convert to Monday = 0, Sunday = 6
    let startingDay = firstDayDate.getDay() - 1;
    if (startingDay < 0) startingDay = 6;

    const daysInMonth = new Date(year, month, 0).getDate();
    const days = [];

    // Empty cells before the 1st
    for (let i = 0; i < startingDay; i++) {
      days.push({ empty: true, key: `empty-${i}` });
    }

    const nonSchoolMap = new Map(nonSchoolDays.map(d => [Number(d.day), d.reason || 'Día sin clases']));

    // Real days
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isNonSchool = nonSchoolMap.has(day);
      const reason = nonSchoolMap.get(day) || '';

      days.push({
        empty: false,
        day,
        isWeekend,
        isNonSchool,
        reason,
        dayOfWeek,
        key: `day-${day}`
      });
    }

    return days;
  }, [selectedMonth, nonSchoolDays]);

  // Calculate working days stats
  const stats = useMemo(() => {
    const totalDaysInMonth = calendarGrid.filter(d => !d.empty).length;
    const weekendDaysCount = calendarGrid.filter(d => !d.empty && d.isWeekend).length;
    const nonSchoolWeekdays = nonSchoolDays.length;
    const workingDaysCount = totalDaysInMonth - weekendDaysCount - nonSchoolWeekdays;

    return {
      totalDaysInMonth,
      weekendDaysCount,
      nonSchoolWeekdays,
      workingDaysCount: Math.max(0, workingDaysCount)
    };
  }, [calendarGrid, nonSchoolDays]);

  const handleToggleDay = (dayNum, isWeekend) => {
    if (isWeekend) return; // Weekends are naturally non-working

    const existingIdx = nonSchoolDays.findIndex(d => Number(d.day) === dayNum);
    if (existingIdx >= 0) {
      // Remove day
      const updated = nonSchoolDays.filter((_, idx) => idx !== existingIdx);
      setNonSchoolDays(updated);
      if (editingReasonDay === dayNum) setEditingReasonDay(null);
    } else {
      // Add day
      const updated = [...nonSchoolDays, { day: dayNum, reason: 'Día sin clases / Feriado' }];
      updated.sort((a, b) => a.day - b.day);
      setNonSchoolDays(updated);
      setEditingReasonDay(dayNum);
      setCustomReason('Día sin clases / Feriado');
    }
  };

  const handleUpdateReason = (dayNum, reason) => {
    const updated = nonSchoolDays.map(d => {
      if (Number(d.day) === dayNum) {
        return { ...d, reason: reason.trim() || 'Día sin clases' };
      }
      return d;
    });
    setNonSchoolDays(updated);
    setEditingReasonDay(null);
  };

  const handleRemoveNonSchoolDay = (dayNum) => {
    setNonSchoolDays(prev => prev.filter(d => Number(d.day) !== dayNum));
    if (editingReasonDay === dayNum) setEditingReasonDay(null);
  };

  const handleResetToDefaults = () => {
    const defaults = DEFAULT_NON_SCHOOL_DAYS[selectedMonth] || [];
    setNonSchoolDays([...defaults]);
    setEditingReasonDay(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveNonSchoolDaysForMonth(selectedMonth, nonSchoolDays, syncToObservaciones);
      setSavedSuccess(true);
      if (onCalendarSaved) {
        onCalendarSaved(selectedMonth, nonSchoolDays);
      }
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 700);
    } catch (err) {
      console.error('Error saving calendar non-school days:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="dias-modal-backdrop" onClick={onClose}>
      <div className="dias-modal-card animate-fade-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="dias-modal-header">
          <div className="dias-header-left">
            <div className="dias-header-icon">
              <CalendarIcon size={20} />
            </div>
            <div>
              <h3 className="dias-modal-title">Configurar Días Sin Clases / Feriados</h3>
              <p className="dias-modal-subtitle">
                Haz clic sobre cualquier día para marcarlo o desmarcarlo en rojo como <strong>Día Sin Clases</strong>.
              </p>
            </div>
          </div>
          <button className="btn-close-modal" onClick={onClose} title="Cerrar">
            <X size={20} />
          </button>
        </div>

        {/* Month Selector Bar */}
        <div className="dias-month-picker-bar">
          <div className="month-picker-left">
            <label className="picker-label">Mes a configurar:</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="dias-select-month"
            >
              {monthsList.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div className="month-picker-stats">
            <span className="stat-badge stat-badge--working">
              <strong>{stats.workingDaysCount}</strong> Días con Clases (Cobro)
            </span>
            <span className="stat-badge stat-badge--noschool">
              <strong>{stats.nonSchoolWeekdays}</strong> Días Sin Clases
            </span>
          </div>
        </div>

        {/* Interactive Calendar View */}
        <div className="dias-calendar-wrapper">
          <div className="dias-weekdays-header">
            <span>Lun</span>
            <span>Mar</span>
            <span>Mié</span>
            <span>Jue</span>
            <span>Vie</span>
            <span className="weekend-col">Sáb</span>
            <span className="weekend-col">Dom</span>
          </div>

          <div className="dias-days-grid">
            {calendarGrid.map((item) => {
              if (item.empty) {
                return <div key={item.key} className="calendar-cell cell-empty" />;
              }

              const { day, isWeekend, isNonSchool, reason } = item;

              return (
                <div
                  key={item.key}
                  className={`calendar-cell ${isWeekend ? 'cell-weekend' : 'cell-weekday'} ${isNonSchool ? 'cell-noschool' : 'cell-school'}`}
                  onClick={() => handleToggleDay(day, isWeekend)}
                  title={isWeekend ? 'Fin de semana' : isNonSchool ? `Sin Clases: ${reason} (Clic para desmarcar)` : 'Día de clases normal (Clic para marcar sin clases)'}
                >
                  <div className="cell-top">
                    <span className="day-number">{day}</span>
                    {isNonSchool && <span className="noschool-dot" />}
                  </div>

                  <div className="cell-status-label">
                    {isWeekend ? (
                      <span className="tag-weekend">Finde</span>
                    ) : isNonSchool ? (
                      <span className="tag-noschool">🔴 Sin Clases</span>
                    ) : (
                      <span className="tag-school">✓ Clases</span>
                    )}
                  </div>

                  {isNonSchool && reason && (
                    <div className="cell-reason" title={reason}>
                      {reason}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Reason Quick-Edit Drawer if a day is selected */}
        {editingReasonDay && (
          <div className="reason-edit-drawer animate-fade-in">
            <div className="drawer-header">
              <span className="drawer-title">Motivo para el día {editingReasonDay}:</span>
              <button className="drawer-close" onClick={() => setEditingReasonDay(null)}>
                <X size={14} />
              </button>
            </div>
            <div className="drawer-body">
              <input
                type="text"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Ej. Feriado departamental, Día del Maestro, Receso escolar..."
                className="drawer-input"
                autoFocus
              />
              <div className="drawer-quick-tags">
                <button type="button" onClick={() => setCustomReason('Feriado Nacional / Departamental')}>Feriado</button>
                <button type="button" onClick={() => setCustomReason('Receso Escolar / Primavera')}>Receso Escolar</button>
                <button type="button" onClick={() => setCustomReason('Día del Maestro')}>Día del Maestro</button>
                <button type="button" onClick={() => setCustomReason('Día del Estudiante')}>Día del Estudiante</button>
                <button type="button" onClick={() => setCustomReason('Sin clases por evento escolar')}>Evento Escolar</button>
              </div>
              <button 
                className="btn btn-sm btn-primary drawer-save-btn"
                onClick={() => handleUpdateReason(editingReasonDay, customReason)}
              >
                Guardar Motivo
              </button>
            </div>
          </div>
        )}

        {/* Selected Non-School Days List */}
        <div className="non-school-summary-box">
          <div className="summary-box-title">
            <Info size={16} className="text-primary" />
            <span>Lista de Días Sin Clases configurados para este mes:</span>
          </div>

          {nonSchoolDays.length === 0 ? (
            <p className="no-days-msg">No hay días sin clases marcados en este mes (todos los días hábiles son de cobro normal).</p>
          ) : (
            <div className="non-school-chips-list">
              {nonSchoolDays.map((d) => (
                <div key={d.day} className="non-school-chip">
                  <span className="chip-day">Día {d.day}</span>
                  <span 
                    className="chip-reason"
                    onClick={() => {
                      setEditingReasonDay(d.day);
                      setCustomReason(d.reason || '');
                    }}
                    title="Clic para editar motivo"
                  >
                    {d.reason || 'Día sin clases'}
                  </span>
                  <button 
                    type="button" 
                    className="chip-remove" 
                    onClick={() => handleRemoveNonSchoolDay(d.day)}
                    title="Eliminar este día sin clases"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Global Sync Notice */}
        <div className="dias-sync-checkbox-row">
          <label className="sync-checkbox-label">
            <input
              type="checkbox"
              checked={syncToObservaciones}
              onChange={(e) => setSyncToObservaciones(e.target.checked)}
              className="sync-checkbox"
            />
            <span>
              <strong>Sincronizar automáticamente con el apartado "Observaciones"</strong> (para que el Bot de IA / WhatsApp sepa que no hay clases en estas fechas y avise a los padres).
            </span>
          </label>
        </div>

        {/* Footer Actions */}
        <div className="dias-modal-footer">
          <button 
            type="button" 
            className="btn btn-outline btn-reset-defaults"
            onClick={handleResetToDefaults}
            title="Restablecer feriados por defecto"
          >
            Restablecer Feriados Iniciales
          </button>

          <div className="footer-right-buttons">
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cancelar
            </button>
            <button 
              type="button" 
              className="btn btn-primary btn-save-calendar"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <span>Guardando...</span>
              ) : savedSuccess ? (
                <>
                  <Check size={16} />
                  <span>¡Aplicado con Éxito!</span>
                </>
              ) : (
                <>
                  <Save size={16} />
                  <span>Guardar y Aplicar Calendario</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
