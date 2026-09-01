import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabaseCobros } from '../lib/supabaseCobrosClient';
import { 
  Search, 
  Plus, 
  Trash2, 
  Download, 
  AlertCircle, 
  Loader2, 
  Filter, 
  Calendar, 
  RefreshCw, 
  Clock, 
  CheckCheck, 
  Coins,
  FileSpreadsheet,
  TrendingUp,
  UploadCloud,
  Table as TableIcon,
  Info
} from 'lucide-react';
import * as Papa from 'papaparse';
import { fetchSheetData, sendWebhookMutation } from '../services/dataService';
import { exportFullExcelWorkbook } from '../components/cobros/cobrosExport';
import FinanzasView from '../components/cobros/FinanzasView';
import ImportarExcelView from '../components/cobros/ImportarExcelView';
import './CobrosView.css';

const monthsList = [
  { value: '2026-08', label: 'Agosto 2026' },
  { value: '2026-09', label: 'Septiembre 2026' },
  { value: '2026-10', label: 'Octubre 2026' },
  { value: '2026-11', label: 'Noviembre 2026' },
  { value: '2026-12', label: 'Diciembre 2026' },
  { value: '2027-01', label: 'Enero 2027' },
  { value: '2027-02', label: 'Febrero 2027' },
  { value: '2027-03', label: 'Marzo 2027' },
  { value: '2027-04', label: 'Abril 2027' },
  { value: '2027-05', label: 'Mayo 2027' }
];

const turnsList = [
  { value: '11:50', label: 'Turno 11:50' },
  { value: '11:25', label: 'Turno 11:25' },
  { value: '12:00', label: 'Turno 12:00' },
  { value: '12:40', label: 'Turno 12:40' },
  { value: '13:05', label: 'Turno 13:05' }
];

const colorOptions = [
  { value: '', label: 'Sin color' },
  { value: 'FFF2CC', label: 'Amarillo Excel' },
  { value: 'Verde', label: 'Verde' },
  { value: 'Azul', label: 'Azul' },
  { value: 'Amarillo', label: 'Amarillo' },
  { value: 'Naranja', label: 'Naranja' }
];

// Helper to generate Monday-Friday weekdays for a given 'YYYY-MM'
const getWorkingDaysOfMonth = (yearMonth) => {
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  
  const date = new Date(year, month - 1, 1);
  const days = [];
  const dayNames = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  
  while (date.getMonth() === month - 1) {
    const dayOfWeek = date.getDay();
    // Exclude weekends (Saturday = 6, Sunday = 0)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const dayNum = date.getDate();
      days.push({
        key: String(dayNum), // e.g. "3"
        label: `${dayNames[dayOfWeek]} ${dayNum}`, // e.g. "L 3"
        dayNum: dayNum
      });
    }
    date.setDate(date.getDate() + 1);
  }
  
  // Specific override for August 2026 to skip Aug 6 & Aug 7 holidays, matching the original Excel layout
  if (yearMonth === '2026-08') {
    return days.filter(d => d.dayNum !== 6 && d.dayNum !== 7);
  }
  
  // Specific override for September 2026: skip Wed 2, Fri 18, and Mon 21 - Fri 25 (recess/holidays)
  if (yearMonth === '2026-09') {
    return days.filter(d => d.dayNum !== 2 && d.dayNum !== 18 && !(d.dayNum >= 21 && d.dayNum <= 25));
  }
  
  return days;
};

// Global non-school days & month observations helper
const getMonthGlobalNotice = (yearMonth, workingDaysCount) => {
  if (yearMonth === '2026-09') {
    return {
      title: 'Observación Global de Septiembre 2026',
      text: 'Días sin clases: Miércoles 2, Viernes 18, y Semana de Primavera / Receso (21 al 25 Sep). Total: 15 días hábiles de cobro.',
      type: 'info'
    };
  }
  if (yearMonth === '2026-08') {
    return {
      title: 'Observación Global de Agosto 2026',
      text: 'Días sin clases: Jueves 6 y Viernes 7 de Agosto (Feriados Patrios). Total: 19 días hábiles de cobro.',
      type: 'info'
    };
  }
  return {
    title: 'Días Hábiles del Mes',
    text: `Total de días hábiles de cobro (Lunes a Viernes): ${workingDaysCount} días.`,
    type: 'default'
  };
};

export default function CobrosView() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('planilla'); // 'planilla' | 'finanzas' | 'importar'
  const [selectedMonth, setSelectedMonth] = useState('2026-08');
  const [selectedTurn, setSelectedTurn] = useState('11:50');
  const [searchTerm, setSearchTerm] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [savingRows, setSavingRows] = useState(new Set());
  const [errorMessage, setErrorMessage] = useState(null);
  const [syncingAbsences, setSyncingAbsences] = useState(false);
  const lastSyncedMonthRef = useRef('');
  
  // Get active day columns for the selected month
  const currentMonthDays = useMemo(() => {
    return getWorkingDaysOfMonth(selectedMonth);
  }, [selectedMonth]);

  // Load data for the selected month
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const { data: cobrosData, error } = await supabaseCobros
        .from('cobros')
        .select('*')
        .eq('mes', selectedMonth)
        .order('alumno', { ascending: true })
        .limit(5000);
        
      if (error) throw error;
      setData(cobrosData || []);
    } catch (err) {
      console.error('Error loading cobros:', err);
      setErrorMessage('Error al cargar datos de Cobros desde Supabase.');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);


  // Compute pricing based on course name
  const getPricePerPlate = (course) => {
    const norm = String(course || '').toUpperCase();
    if (norm.endsWith('S') || norm.includes('SECUNDARIA')) {
      return 35; // Secondary price
    }
    return 32; // Kinder / Primary price
  };

  // Calculate totals for a row
  const calculateRowTotals = useCallback((asistencias, course) => {
    let plates = 0;
    const currentDaysKeys = currentMonthDays.map(d => d.key);
    
    Object.keys(asistencias || {}).forEach(dayKey => {
      // Only count days that actually belong to the current month's columns
      if (currentDaysKeys.includes(dayKey)) {
        const val = String(asistencias[dayKey] || '').trim().toUpperCase();
        if (val && val !== '0' && val !== 'F') {
          plates += 1;
        }
      }
    });
    
    const price = getPricePerPlate(course);
    return {
      platos_vendidos: plates,
      platos_vendidos_bs: plates * price
    };
  }, [currentMonthDays]);

  // Handle cell changes and auto-save
  const handleCellChange = async (rowId, key, value) => {
    const rowIndex = data.findIndex(r => r.id === rowId);
    if (rowIndex === -1) return;
    
    const oldRow = data[rowIndex];
    let updatedRow = { ...oldRow };

    const isMerienda = (obs) => String(obs || '').toLowerCase().includes('merienda');

    if (key === 'alumno' || key === 'curso' || key === 'turno' || key === 'fecha_inicio' || key === 'fecha_fin' || key === 'observaciones' || key === 'pagos_bs' || key === 'saldo_merienditas') {
      if (key === 'pagos_bs' || key === 'saldo_merienditas') {
        const numVal = Number(value || 0);
        updatedRow[key] = numVal;
        if (key === 'pagos_bs') {
          const net = numVal - Number(updatedRow.platos_vendidos_bs || 0);
          updatedRow.color = isMerienda(updatedRow.observaciones) ? 'Amarillo' : (net >= 0 ? 'Verde' : 'Azul');
        }
      } else {
        updatedRow[key] = value;
        if (key === 'observaciones') {
          if (isMerienda(value)) {
            updatedRow.color = 'Amarillo';
          } else {
            const net = Number(updatedRow.pagos_bs || 0) - Number(updatedRow.platos_vendidos_bs || 0);
            updatedRow.color = net >= 0 ? 'Verde' : 'Azul';
          }
        } else if (key === 'curso') {
          const totals = calculateRowTotals(updatedRow.asistencias, value);
          updatedRow = { ...updatedRow, ...totals };
          const net = Number(updatedRow.pagos_bs || 0) - totals.platos_vendidos_bs;
          updatedRow.color = isMerienda(updatedRow.observaciones) ? 'Amarillo' : (net >= 0 ? 'Verde' : 'Azul');
        }
      }
    } else {
      // It is a day cell change
      const newAsistencias = { ...(oldRow.asistencias || {}) };
      const cleanedVal = String(value || '').trim();
      const oldDayVal = String(newAsistencias[key] || '').trim().toUpperCase();
      const newDayVal = cleanedVal.toUpperCase();
      
      if (cleanedVal === '') {
        delete newAsistencias[key];
      } else {
        newAsistencias[key] = cleanedVal;
      }
      
      updatedRow.asistencias = newAsistencias;
      const totals = calculateRowTotals(newAsistencias, updatedRow.curso);
      updatedRow = { ...updatedRow, ...totals };
      const net = Number(updatedRow.pagos_bs || 0) - totals.platos_vendidos_bs;
      updatedRow.color = isMerienda(updatedRow.observaciones) ? 'Amarillo' : (net >= 0 ? 'Verde' : 'Azul');

      // Real-time two-way synchronization of absences (Faltas) with Google Sheets
      const formattedDate = `${selectedMonth}-${String(key).padStart(2, '0')}`;
      if (oldDayVal === 'F' && newDayVal !== 'F') {
        // Removed a lack notice -> Trigger BAJA mutation to delete from Google Sheets
        console.log(`Manually removed falta for ${updatedRow.alumno} on ${formattedDate}. Sending BAJA mutation to n8n webhook...`);
        sendWebhookMutation('Observaciones', 'BAJA', {
          alumno: updatedRow.alumno,
          fecha: formattedDate
        }).catch(err => console.error('Error sending mutation BAJA:', err));
      } else if (oldDayVal !== 'F' && newDayVal === 'F') {
        // Added a lack notice -> Trigger ALTA mutation to add to Google Sheets
        console.log(`Manually added falta for ${updatedRow.alumno} on ${formattedDate}. Sending ALTA mutation to n8n webhook...`);
        sendWebhookMutation('Observaciones', 'ALTA', {
          alumno: updatedRow.alumno,
          fecha: formattedDate,
          motivo_de_falta: 'Falta registrada manualmente en panel de Cobros.'
        }).catch(err => console.error('Error sending mutation ALTA:', err));
      }
    }
    
    // Optimistic UI update
    const newData = [...data];
    newData[rowIndex] = updatedRow;
    setData(newData);
    
    setSavingRows(prev => {
      const next = new Set(prev);
      next.add(rowId);
      return next;
    });

    try {
      const { error } = await supabaseCobros
        .from('cobros')
        .update({
          alumno: updatedRow.alumno,
          curso: updatedRow.curso,
          turno: updatedRow.turno,
          fecha_inicio: updatedRow.fecha_inicio,
          fecha_fin: updatedRow.fecha_fin,
          observaciones: updatedRow.observaciones,
          asistencias: updatedRow.asistencias,
          platos_vendidos: updatedRow.platos_vendidos,
          platos_vendidos_bs: updatedRow.platos_vendidos_bs,
          pagos_bs: updatedRow.pagos_bs,
          saldo_merienditas: updatedRow.saldo_merienditas,
          color: updatedRow.color
        })
        .eq('id', rowId);
        
      if (error) throw error;
    } catch (err) {
      console.error('Error updating row:', err);
      const revertedData = [...data];
      revertedData[rowIndex] = oldRow;
      setData(revertedData);
      alert('Error al guardar los cambios en la base de datos.');
    } finally {
      setSavingRows(prev => {
        const next = new Set(prev);
        next.delete(rowId);
        return next;
      });
    }
  };

  // Change row color
  const handleColorChange = async (rowId, colorValue) => {
    const rowIndex = data.findIndex(r => r.id === rowId);
    if (rowIndex === -1) return;

    const oldRow = data[rowIndex];
    const updatedRow = { ...oldRow, color: colorValue };

    const newData = [...data];
    newData[rowIndex] = updatedRow;
    setData(newData);

    setSavingRows(prev => {
      const next = new Set(prev);
      next.add(rowId);
      return next;
    });

    try {
      const { error } = await supabaseCobros
        .from('cobros')
        .update({ color: colorValue })
        .eq('id', rowId);

      if (error) throw error;
    } catch (err) {
      console.error('Error updating color:', err);
      const revertedData = [...data];
      revertedData[rowIndex] = oldRow;
      setData(revertedData);
      alert('Error al actualizar el color de la fila.');
    } finally {
      setSavingRows(prev => {
        const next = new Set(prev);
        next.delete(rowId);
        return next;
      });
    }
  };

  // Add new empty student row
  const handleAddRow = async () => {
    const newRecord = {
      alumno: 'NUEVO ALUMNO',
      curso: 'KINDER A',
      fecha_inicio: null,
      fecha_fin: null,
      observaciones: null,
      mes: selectedMonth,
      turno: selectedTurn,
      asistencias: {},
      platos_vendidos: 0,
      platos_vendidos_bs: 0,
      color: null
    };

    try {
      setLoading(true);
      const { data: inserted, error } = await supabaseCobros
        .from('cobros')
        .insert(newRecord)
        .select();

      if (error) throw error;
      if (inserted && inserted.length > 0) {
        setData(prev => [...prev, inserted[0]]);
      }
    } catch (err) {
      console.error('Error inserting row:', err);
      alert('Error al agregar un nuevo registro a la base de datos.');
    } finally {
      setLoading(false);
    }
  };

  // Quick action: Settle a single student's debt (set pagos_bs = platos_vendidos_bs -> saldo 0 Bs, Verde)
  const handleSettleStudentDebt = async (rowId) => {
    const rowIndex = data.findIndex(r => r.id === rowId);
    if (rowIndex === -1) return;

    const row = data[rowIndex];
    const amountToSettle = Number(row.platos_vendidos_bs || 0);

    const updatedRow = {
      ...row,
      pagos_bs: amountToSettle,
      color: 'Verde'
    };

    const newData = [...data];
    newData[rowIndex] = updatedRow;
    setData(newData);

    setSavingRows(prev => {
      const next = new Set(prev);
      next.add(rowId);
      return next;
    });

    try {
      const { error } = await supabaseCobros
        .from('cobros')
        .update({
          pagos_bs: amountToSettle,
          color: 'Verde',
          updated_at: new Date().toISOString()
        })
        .eq('id', rowId);

      if (error) throw error;
    } catch (err) {
      console.error('Error settling student debt:', err);
      const reverted = [...data];
      reverted[rowIndex] = row;
      setData(reverted);
      alert('Error al saldar la cuenta del alumno.');
    } finally {
      setSavingRows(prev => {
        const next = new Set(prev);
        next.delete(rowId);
        return next;
      });
    }
  };

  // Quick action: Set full month payment for a single student
  const handleSetFullMonthPayment = async (rowId) => {
    const rowIndex = data.findIndex(r => r.id === rowId);
    if (rowIndex === -1) return;

    const row = data[rowIndex];
    const workingDaysCount = currentMonthDays.length;
    const pricePerPlate = getPricePerPlate(row.curso);
    const fullMonthAmount = workingDaysCount * pricePerPlate;

    const updatedRow = {
      ...row,
      pagos_bs: fullMonthAmount,
      color: 'Verde'
    };

    const newData = [...data];
    newData[rowIndex] = updatedRow;
    setData(newData);

    setSavingRows(prev => {
      const next = new Set(prev);
      next.add(rowId);
      return next;
    });

    try {
      const { error } = await supabaseCobros
        .from('cobros')
        .update({
          pagos_bs: fullMonthAmount,
          color: 'Verde',
          updated_at: new Date().toISOString()
        })
        .eq('id', rowId);

      if (error) throw error;
    } catch (err) {
      console.error('Error setting full month payment:', err);
      const reverted = [...data];
      reverted[rowIndex] = row;
      setData(reverted);
      alert('Error al registrar el pago del mes completo.');
    } finally {
      setSavingRows(prev => {
        const next = new Set(prev);
        next.delete(rowId);
        return next;
      });
    }
  };

  // Global action: Settle all students with pending debt in the current turn
  const handleSettleAllCurrentTurn = async () => {
    const turnStudentsInDebt = data.filter(r => 
      r.turno === selectedTurn && (Number(r.pagos_bs || 0) < Number(r.platos_vendidos_bs || 0))
    );

    if (turnStudentsInDebt.length === 0) {
      alert(`Todos los alumnos del Turno ${selectedTurn} ya se encuentran al día o con saldo a favor.`);
      return;
    }

    if (!window.confirm(`¿Deseas saldar a los ${turnStudentsInDebt.length} alumnos con saldo pendiente en el Turno ${selectedTurn}? Sus pagos se igualarán a sus consumos actuales (saldo 0 Bs / Al día).`)) {
      return;
    }

    try {
      setLoading(true);
      const updatedRows = [];

      for (const st of turnStudentsInDebt) {
        const amount = Number(st.platos_vendidos_bs || 0);
        const { error } = await supabaseCobros
          .from('cobros')
          .update({
            pagos_bs: amount,
            color: 'Verde',
            updated_at: new Date().toISOString()
          })
          .eq('id', st.id);

        if (error) throw error;
        updatedRows.push({ ...st, pagos_bs: amount, color: 'Verde' });
      }

      setData(prev => prev.map(item => {
        const match = updatedRows.find(u => u.id === item.id);
        return match ? match : item;
      }));

      alert(`¡Se saldaron exitosamente ${updatedRows.length} alumnos del Turno ${selectedTurn}!`);
    } catch (err) {
      console.error('Error settling all students:', err);
      alert('Ocurrió un error al saldar los alumnos del turno.');
    } finally {
      setLoading(false);
    }
  };

  // Global action: Set full month payment for all students in current turn
  const handleSetFullMonthAllCurrentTurn = async () => {
    const turnStudents = data.filter(r => r.turno === selectedTurn);

    if (turnStudents.length === 0) {
      alert(`No hay alumnos registrados en el Turno ${selectedTurn}.`);
      return;
    }

    const workingDaysCount = currentMonthDays.length;
    if (!window.confirm(`¿Deseas cargar el pago de MES COMPLETO (${workingDaysCount} días hábiles) a los ${turnStudents.length} alumnos del Turno ${selectedTurn}?`)) {
      return;
    }

    try {
      setLoading(true);
      const updatedRows = [];

      for (const st of turnStudents) {
        const price = getPricePerPlate(st.curso);
        const fullMonthAmount = workingDaysCount * price;

        const { error } = await supabaseCobros
          .from('cobros')
          .update({
            pagos_bs: fullMonthAmount,
            color: 'Verde',
            updated_at: new Date().toISOString()
          })
          .eq('id', st.id);

        if (error) throw error;
        updatedRows.push({ ...st, pagos_bs: fullMonthAmount, color: 'Verde' });
      }

      setData(prev => prev.map(item => {
        const match = updatedRows.find(u => u.id === item.id);
        return match ? match : item;
      }));

      alert(`¡Se cargó el pago de mes completo a ${updatedRows.length} alumnos del Turno ${selectedTurn}!`);
    } catch (err) {
      console.error('Error setting full month for all students:', err);
      alert('Ocurrió un error al cargar los pagos del mes.');
    } finally {
      setLoading(false);
    }
  };

  // Export full multi-sheet Excel workbook for the accountant
  const handleDownloadFullExcel = () => {
    if (data.length === 0) {
      alert('No hay datos cargados para exportar en este mes.');
      return;
    }
    const monthObj = monthsList.find(m => m.value === selectedMonth);
    const monthLabel = monthObj ? monthObj.label : selectedMonth;
    exportFullExcelWorkbook(data, selectedMonth, currentMonthDays, turnsList, monthLabel);
  };

  // Initialize all turns for a new month with previous month's student records
  const handleInitializeMonth = async () => {
    const monthLabel = monthsList.find(m => m.value === selectedMonth)?.label;
    const workingDaysCount = currentMonthDays.length;
    
    if (!window.confirm(`¿Deseas inicializar el mes de ${monthLabel} para TODOS LOS TURNOS (11:50, 11:25, 12:00, 12:40 y 13:05) con los alumnos del último mes registrado?`)) {
      return;
    }

    const prepayMonth = window.confirm(`¿Deseas que los alumnos inicien con el pago del MES COMPLETO (${workingDaysCount} días hábiles) precargado en Verde?\n\n- Aceptar (OK): Precargar pago del mes completo\n- Cancelar: Iniciar con pagos en 0 Bs`);

    try {
      setLoading(true);
      
      // Query the database to retrieve students across ALL turns and months
      const { data: allRecords, error: fetchErr } = await supabaseCobros
        .from('cobros')
        .select('alumno, curso, turno, observaciones, color, mes')
        .limit(5000);
        
      if (fetchErr) throw fetchErr;
      
      let studentsToCopy = [];
      if (allRecords && allRecords.length > 0) {
        // Sort active months and pick the most recent one containing data
        const uniqueMonths = [...new Set(allRecords.map(r => r.mes))].sort();
        // Exclude the current selected month
        const previousMonths = uniqueMonths.filter(m => m !== selectedMonth);
        
        if (previousMonths.length > 0) {
          const latestMonthWithData = previousMonths[previousMonths.length - 1];
          const latestRecords = allRecords.filter(r => r.mes === latestMonthWithData);
          
          // Exclude any student/turn that already exists in the selected month
          const existingInSelectedMonth = allRecords.filter(r => r.mes === selectedMonth);
          const existingKeys = new Set(existingInSelectedMonth.map(r => `${String(r.alumno).trim().toLowerCase()}_${r.turno}`));
          
          studentsToCopy = latestRecords
            .filter(r => !existingKeys.has(`${String(r.alumno).trim().toLowerCase()}_${r.turno}`))
            .map(r => ({
              alumno: r.alumno,
              curso: r.curso,
              turno: r.turno,
              observaciones: r.observaciones || null,
              color: r.color
            }));
        }
      }
      
      if (studentsToCopy.length === 0) {
        alert("No se encontraron registros de meses anteriores en la base de datos o todos los alumnos ya fueron importados.");
        return;
      }
      
      // Create empty records for the selected month across all turns
      const newRecords = studentsToCopy.map(s => {
        const isMerienda = String(s.observaciones || '').toLowerCase().includes('merienda');
        const price = getPricePerPlate(s.curso);
        const pagosBs = prepayMonth ? (workingDaysCount * price) : 0;
        const color = isMerienda ? 'Amarillo' : (prepayMonth ? 'Verde' : null);
        
        return {
          alumno: s.alumno,
          curso: s.curso,
          turno: s.turno,
          observaciones: s.observaciones,
          color: color,
          mes: selectedMonth,
          asistencias: {},
          platos_vendidos: 0,
          platos_vendidos_bs: 0,
          pagos_bs: pagosBs,
          saldo_merienditas: 0
        };
      });
      
      const { data: inserted, error: insertErr } = await supabaseCobros
        .from('cobros')
        .insert(newRecords)
        .select();
        
      if (insertErr) throw insertErr;
      
      // Reload current month data
      await loadData();
      alert(`¡Mes de ${monthLabel} inicializado exitosamente para TODOS LOS TURNOS (${inserted.length} alumnos importados en total)!`);
    } catch (err) {
      console.error('Error initializing month:', err);
      alert('Error al inicializar el nuevo mes.');
    } finally {
      setLoading(false);
    }
  };

  // Delete row
  const handleDeleteRow = async (rowId, alumnoName) => {
    if (!window.confirm(`¿Estás seguro de eliminar el registro de Cobros de "${alumnoName}" para este mes y turno?`)) {
      return;
    }

    try {
      setSavingRows(prev => {
        const next = new Set(prev);
        next.add(rowId);
        return next;
      });

      const { error } = await supabaseCobros
        .from('cobros')
        .delete()
        .eq('id', rowId);

      if (error) throw error;
      setData(prev => prev.filter(r => r.id !== rowId));
    } catch (err) {
      console.error('Error deleting row:', err);
      alert('Error al eliminar el registro de la base de datos.');
    } finally {
      setSavingRows(prev => {
        const next = new Set(prev);
        next.delete(rowId);
        return next;
      });
    }
  };

  // Sincronizar faltas desde el sistema (Google Sheets: Observaciones) para todos los turnos
  const syncAbsencesGlobally = useCallback(async (targetMonth, isSilent = true) => {
    try {
      if (syncingAbsences) return;
      setSyncingAbsences(true);

      // 1. Fetch Observaciones sheet
      const rawAbsences = await fetchSheetData('Observaciones');
      if (!rawAbsences || rawAbsences.length === 0) {
        if (!isSilent) alert("No se encontraron registros de faltas en la planilla de Observaciones.");
        return;
      }

      // 2. Fetch ALL students for the target month from Supabase across ALL turns
      const { data: dbRecords, error: fetchErr } = await supabaseCobros
        .from('cobros')
        .select('*')
        .eq('mes', targetMonth);

      if (fetchErr) throw fetchErr;
      if (!dbRecords || dbRecords.length === 0) {
        if (!isSilent) alert("No se encontraron registros de alumnos en la base de datos.");
        return;
      }

      // Helper to parse dates like "2026-08-14" or "14/08/2026"
      const parseAbsenceDate = (dateStr) => {
        if (!dateStr) return null;
        const isoMatch = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) {
          return {
            yearMonth: `${isoMatch[1]}-${isoMatch[2]}`,
            dayNum: String(parseInt(isoMatch[3], 10))
          };
        }
        const slashesMatch = String(dateStr).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (slashesMatch) {
          return {
            yearMonth: `${slashesMatch[3]}-${slashesMatch[2].padStart(2, '0')}`,
            dayNum: String(parseInt(slashesMatch[1], 10))
          };
        }
        return null;
      };

      // Helper to check if a reason is an absence notice
      const isAbsenceReason = (reason) => {
        const norm = String(reason || '').trim().toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return /(no almuer|no asistir|no ira|no va|enferm|ausen|falta)/.test(norm);
      };

      // Helper for fuzzy word overlap comparison
      const getWords = (name) => {
        return String(name || '')
          .trim()
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9 ]/g, " ")
          .split(/\s+/)
          .filter(w => w.length >= 3 && !['del', 'las', 'los', 'pre', 'kin', 'kinder'].includes(w));
      };

      const findStudentMatch = (excelName, turn) => {
        const excelWords = getWords(excelName);
        if (excelWords.length === 0) return null;

        let bestDb = null;
        let maxOverlap = 0;

        const turnRecords = dbRecords.filter(r => r.turno === turn);
        for (const dbRec of turnRecords) {
          const dbWords = getWords(dbRec.alumno);
          let overlap = 0;
          excelWords.forEach(ew => {
            dbWords.forEach(dw => {
              if (ew === dw) {
                overlap += 2.0;
              } else if (ew.length >= 4 && dw.length >= 4 && (ew.startsWith(dw) || dw.startsWith(ew))) {
                overlap += 1.0;
              }
            });
          });
          if (overlap > maxOverlap) {
            maxOverlap = overlap;
            bestDb = dbRec;
          }
        }
        return maxOverlap >= 2.0 ? bestDb : null;
      };

      // 3. Filter absences belonging to the current month and valid reason
      const currentMonthAbsences = rawAbsences.filter(obs => {
        const dateInfo = parseAbsenceDate(obs.fecha);
        return dateInfo && dateInfo.yearMonth === targetMonth && isAbsenceReason(obs.motivo_de_falta);
      });

      // 4. Match and group updates
      let importedCount = 0;
      const studentsToUpdate = [];

      for (const obs of currentMonthAbsences) {
        // Find match in any turn
        const turns = ['11:50', '11:25', '12:00', '12:40', '13:05'];
        let match = null;
        for (const turn of turns) {
          match = findStudentMatch(obs.alumno, turn);
          if (match) break;
        }

        if (match) {
          const dateInfo = parseAbsenceDate(obs.fecha);
          const dayKey = dateInfo.dayNum;
          
          const currentAsistencias = match.asistencias || {};
          if (currentAsistencias[dayKey] !== 'F' && currentAsistencias[dayKey] !== 'f') {
            const updatedAsistencias = { ...currentAsistencias, [dayKey]: 'F' };
            const rowTotals = calculateRowTotals(updatedAsistencias, match.curso);
            const netBalance = Number(match.pagos_bs || 0) - rowTotals.platos_vendidos_bs;
            
            // Check if this student is already queued for update in this transaction
            const queuedIdx = studentsToUpdate.findIndex(s => s.id === match.id);
            if (queuedIdx !== -1) {
              studentsToUpdate[queuedIdx].asistencias[dayKey] = 'F';
              const accumTotals = calculateRowTotals(studentsToUpdate[queuedIdx].asistencias, match.curso);
              studentsToUpdate[queuedIdx].platos_vendidos = accumTotals.platos_vendidos;
              studentsToUpdate[queuedIdx].platos_vendidos_bs = accumTotals.platos_vendidos_bs;
              studentsToUpdate[queuedIdx].color = (Number(match.pagos_bs || 0) - accumTotals.platos_vendidos_bs) >= 0 ? 'Verde' : 'Azul';
            } else {
              studentsToUpdate.push({
                ...match,
                asistencias: updatedAsistencias,
                platos_vendidos: rowTotals.platos_vendidos,
                platos_vendidos_bs: rowTotals.platos_vendidos_bs,
                color: netBalance >= 0 ? 'Verde' : 'Azul'
              });
            }
            importedCount++;
          }
        }
      }

      if (studentsToUpdate.length === 0) {
        if (!isSilent) alert("Todas las faltas de Google Sheets ya se encuentran sincronizadas.");
        return;
      }

      // 5. Save updates to Supabase
      for (const updatedStudent of studentsToUpdate) {
        const { error: saveErr } = await supabaseCobros
          .from('cobros')
          .update({
            asistencias: updatedStudent.asistencias,
            platos_vendidos: updatedStudent.platos_vendidos,
            platos_vendidos_bs: updatedStudent.platos_vendidos_bs,
            color: updatedStudent.color
          })
          .eq('id', updatedStudent.id);

        if (saveErr) throw saveErr;
      }

      // 6. Refresh state of the current view if any student of the current turn was updated
      const updatedInCurrentView = studentsToUpdate.filter(s => s.turno === selectedTurn);
      if (updatedInCurrentView.length > 0) {
        // Optimistically update React view state
        setData(prev => {
          return prev.map(student => {
            const matchUpdated = updatedInCurrentView.find(u => u.id === student.id);
            return matchUpdated ? matchUpdated : student;
          });
        });
      }

      if (!isSilent) {
        alert(`Sincronización completada con éxito. Se importaron ${importedCount} faltas de asistencia en todos los turnos.`);
      }
    } catch (err) {
      console.error('Error in global absence sync:', err);
      if (!isSilent) alert('Ocurrió un error al sincronizar las faltas desde Google Sheets.');
    } finally {
      setSyncingAbsences(false);
    }
  }, [syncingAbsences, selectedTurn, calculateRowTotals]);

  // Sincronizar faltas en segundo plano de manera silenciosa cuando cambie el mes o los datos estén listos
  useEffect(() => {
    if (data.length > 0 && lastSyncedMonthRef.current !== selectedMonth) {
      lastSyncedMonthRef.current = selectedMonth;
      const timer = window.setTimeout(() => {
        syncAbsencesGlobally(selectedMonth, true);
      }, 1000); // 1s delay to run smoothly in background after initial load
      return () => window.clearTimeout(timer);
    }
  }, [selectedMonth, data.length, syncAbsencesGlobally]);

  // Export to CSV
  const handleExport = () => {
    const csvData = filteredData.map((row, index) => {
      const exportRow = {
        'Nro.': index + 1,
        'Alumno': row.alumno,
        'Curso': row.curso,
        'Turno': row.turno,
        'Fecha Inicio': row.fecha_inicio || '',
        'Fecha Fin': row.fecha_fin || '',
        'Observaciones': row.observaciones || '',
      };
      
      currentMonthDays.forEach(d => {
        exportRow[d.label] = row.asistencias?.[d.key] || '';
      });
      
      exportRow['Platos Vendidos'] = row.platos_vendidos;
      exportRow['Importe Total (Bs)'] = row.platos_vendidos_bs;
      exportRow['Pago Almuerzo (Bs)'] = row.pagos_bs || 0;
      exportRow['Saldo Almuerzo (Bs)'] = Number(row.pagos_bs || 0) - Number(row.platos_vendidos_bs || 0);
      exportRow['Saldo Merienda (Bs)'] = row.saldo_merienditas || 0;
      
      return exportRow;
    });

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Cobros_Planilla_${selectedMonth}_Turno_${selectedTurn.replace(':', '_')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtering data (Global search across all turns when searching, local turn when empty)
  const filteredData = data.filter(row => {
    const isSearching = searchTerm.trim() !== '';
    
    const matchSearch = 
      String(row.alumno).toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(row.curso).toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(row.observaciones || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(row.turno || '').toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchCourse = courseFilter === '' || 
      String(row.curso).toLowerCase().includes(courseFilter.toLowerCase());
      
    const matchTurn = isSearching || row.turno === selectedTurn;
      
    return matchSearch && matchCourse && matchTurn;
  });

  // Summary statistics for current turn
  const summaryStats = useMemo(() => {
    const turnData = data.filter(r => r.turno === selectedTurn);
    const totalStudents = turnData.length;
    const totalPlatos = turnData.reduce((acc, r) => acc + Number(r.platos_vendidos || 0), 0);
    const totalBs = turnData.reduce((acc, r) => acc + Number(r.platos_vendidos_bs || 0), 0);
    const inDebtCount = turnData.filter(r => Number(r.pagos_bs || 0) < Number(r.platos_vendidos_bs || 0)).length;
    return { totalStudents, totalPlatos, totalBs, inDebtCount };
  }, [data, selectedTurn]);

  // Unique list of courses for filter dropdown
  const uniqueCourses = useMemo(() => {
    const courses = data.map(r => String(r.curso || '').trim()).filter(Boolean);
    return [...new Set(courses)].sort();
  }, [data]);

  return (
    <div className="cobros-container">
      {/* 1. Top Navigation Sub-Tabs & Accountant Excel Export */}
      <div className="cobros-nav-tabs-bar">
        <div className="cobros-nav-tabs">
          <button 
            className={`cobros-tab-btn ${activeTab === 'planilla' ? 'active' : ''}`}
            onClick={() => setActiveTab('planilla')}
          >
            <TableIcon size={16} />
            <span>Planilla de Asistencia</span>
          </button>

          <button 
            className={`cobros-tab-btn ${activeTab === 'finanzas' ? 'active' : ''}`}
            onClick={() => setActiveTab('finanzas')}
          >
            <TrendingUp size={16} />
            <span>Finanzas e Ingresos</span>
          </button>

          <button 
            className={`cobros-tab-btn ${activeTab === 'importar' ? 'active' : ''}`}
            onClick={() => setActiveTab('importar')}
          >
            <UploadCloud size={16} />
            <span>Cargar Planilla Excel</span>
          </button>
        </div>

        <button 
          className="btn btn-export-excel-full"
          onClick={handleDownloadFullExcel}
          disabled={data.length === 0}
          title="Descarga el archivo Excel con todas las planillas de los 5 turnos y el resumen general para la contadora"
        >
          <FileSpreadsheet size={16} />
          <span>Descargar Excel Contabilidad (Todos los Turnos)</span>
        </button>
      </div>

      {/* 2. Sub-views */}
      {activeTab === 'finanzas' && (
        <FinanzasView
          allMonthData={data}
          selectedMonth={selectedMonth}
          monthLabel={monthsList.find(m => m.value === selectedMonth)?.label}
          turnsList={turnsList}
          workingDays={currentMonthDays}
          getPricePerPlate={getPricePerPlate}
          onSettleStudent={handleSettleStudentDebt}
        />
      )}

      {activeTab === 'importar' && (
        <ImportarExcelView
          monthsList={monthsList}
          selectedMonth={selectedMonth}
          turnsList={turnsList}
          getPricePerPlate={getPricePerPlate}
          calculateRowTotals={calculateRowTotals}
          onImportSuccess={loadData}
        />
      )}

      {activeTab === 'planilla' && (
        <>
          <div className="cobros-header premium-card">
            <div className="title-row">
              <div className="title-section">
                <div className="title-with-badge">
                  <h1>Planilla de Cobros</h1>
              <span className="badge-turn-indicator">
                {turnsList.find(t => t.value === selectedTurn)?.label}
              </span>
              {syncingAbsences && (
                <div className="sync-badge">
                  <Loader2 className="spinner" size={14} />
                  <span>Sincronizando faltas...</span>
                </div>
              )}
            </div>
            <p className="subtitle">Gestión e importes de comidas de alumnos</p>
          </div>

          {/* Quick summary stats chips */}
          <div className="stats-chips-container">
            <div className="stat-chip">
              <span className="stat-label">Alumnos:</span>
              <span className="stat-value">{summaryStats.totalStudents}</span>
            </div>
            <div className="stat-chip">
              <span className="stat-label">Platos:</span>
              <span className="stat-value text-primary">{summaryStats.totalPlatos}</span>
            </div>
            <div className="stat-chip">
              <span className="stat-label">Total:</span>
              <span className="stat-value text-success">{summaryStats.totalBs} Bs</span>
            </div>
            {summaryStats.inDebtCount > 0 ? (
              <div className="stat-chip stat-chip--danger" title="Alumnos con saldo negativo">
                <span className="stat-label">Pendientes:</span>
                <span className="stat-value text-danger">{summaryStats.inDebtCount}</span>
              </div>
            ) : (
              <div className="stat-chip stat-chip--success" title="Todos al día">
                <span className="stat-value text-success">Al día ✓</span>
              </div>
            )}
          </div>
        </div>

        {/* Global Month Notice Banner */}
        {(() => {
          const notice = getMonthGlobalNotice(selectedMonth, currentMonthDays.length);
          return (
            <div className="global-month-notice">
              <div className="global-notice-left">
                <Info size={16} className="notice-icon" />
                <span className="global-notice-title">{notice.title}:</span>
                <span className="global-notice-text">{notice.text}</span>
              </div>
              <span className="badge-working-days">{currentMonthDays.length} Días Hábiles</span>
            </div>
          );
        })()}

        {/* Toolbar with Filters and Actions */}
        <div className="controls-toolbar">
          <div className="filters-group">
            {/* Month Selector */}
            <div className="filter-box month-filter-box">
              <Calendar size={16} className="filter-icon" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="input select-filter month-select"
              >
                {monthsList.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            {/* Turn Selector */}
            <div className="filter-box turn-filter-box">
              <Clock size={16} className="filter-icon" />
              <select
                value={selectedTurn}
                onChange={(e) => setSelectedTurn(e.target.value)}
                className="input select-filter turn-select"
              >
                {turnsList.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="search-box">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Buscar alumno o curso..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input search-input"
              />
            </div>

            <div className="filter-box course-filter-box">
              <Filter size={16} className="filter-icon" />
              <select
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
                className="input select-filter"
              >
                <option value="">Todos los cursos</option>
                {uniqueCourses.map(course => (
                  <option key={course} value={course}>{course}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="actions-group">
            <button 
              className="btn btn-outline btn-quick-settle-all" 
              onClick={handleSettleAllCurrentTurn} 
              disabled={data.length === 0}
              title="Pone al día a todos los alumnos que tienen saldo negativo en este turno (0 Bs / Verde)"
            >
              <CheckCheck size={16} />
              <span>Saldar Turno</span>
            </button>

            <button 
              className="btn btn-outline btn-quick-month-all" 
              onClick={handleSetFullMonthAllCurrentTurn} 
              disabled={data.length === 0}
              title={`Carga el pago del mes completo (${currentMonthDays.length} días) a todos los alumnos del turno`}
            >
              <Coins size={16} />
              <span>Mes Completo</span>
            </button>

            <button className="btn btn-outline btn-export" onClick={handleExport} disabled={data.length === 0}>
              <Download size={16} />
              <span>CSV</span>
            </button>

            <button className="btn btn-primary btn-add-student" onClick={handleAddRow}>
              <Plus size={16} />
              <span>+ Alumno</span>
            </button>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="error-alert">
          <AlertCircle size={20} />
          <span>{errorMessage}</span>
          <button className="btn btn-outline btn-sm" onClick={loadData}>Reintentar</button>
        </div>
      )}

      {/* Empty month or turn initialization message */}
      {!loading && filteredData.length === 0 && (
        <div className="empty-state-card premium-card animate-fade-in">
          <Calendar size={48} className="empty-calendar-icon" />
          {data.length === 0 ? (
            <>
              <h3>No hay alumnos cargados en {monthsList.find(m => m.value === selectedMonth)?.label}</h3>
              <p>Puedes inicializar automáticamente <strong>todos los turnos (11:50, 11:25, 12:00, 12:40 y 13:05)</strong> con la lista completa de alumnos del último mes registrado con un solo clic.</p>
              <div className="empty-state-actions">
                <button className="btn btn-primary" onClick={handleInitializeMonth}>
                  <RefreshCw size={18} />
                  <span>Inicializar Todos los Turnos del Mes</span>
                </button>
                <button className="btn btn-outline" onClick={handleAddRow}>
                  <Plus size={18} />
                  <span>Agregar Alumno Manualmente</span>
                </button>
              </div>
            </>
          ) : data.filter(r => r.turno === selectedTurn).length === 0 && !searchTerm && !courseFilter ? (
            <>
              <h3>No hay alumnos registrados en el {turnsList.find(t => t.value === selectedTurn)?.label} para {monthsList.find(m => m.value === selectedMonth)?.label}</h3>
              <p>Puedes importar automáticamente a todos los alumnos que falten en este mes desde el mes anterior.</p>
              <div className="empty-state-actions">
                <button className="btn btn-primary" onClick={handleInitializeMonth}>
                  <RefreshCw size={18} />
                  <span>Importar Alumnos Faltantes</span>
                </button>
                <button className="btn btn-outline" onClick={handleAddRow}>
                  <Plus size={18} />
                  <span>Agregar Alumno Manualmente</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <h3>No se encontraron alumnos</h3>
              <p>No hay coincidencias con los filtros de búsqueda aplicados ({searchTerm || courseFilter}).</p>
              <div className="empty-state-actions">
                <button className="btn btn-outline" onClick={() => { setSearchTerm(''); setCourseFilter(''); }}>
                  Limpiar Filtros
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="table-wrapper premium-card" style={{ display: filteredData.length === 0 ? 'none' : 'block' }}>
        {loading ? (
          <div className="loading-state">
            <Loader2 className="spinner" size={40} />
            <p>Cargando registros de Cobros...</p>
          </div>
        ) : (
          <div className="excel-table-container">
            <table className="excel-table">
              <thead>
                <tr className="main-header-row">
                  <th rowSpan={2} className="col-nro">Nro.</th>
                  <th rowSpan={2} className="col-alumno">ALUMNO</th>
                  <th rowSpan={2} className="col-curso">CURSO</th>
                  <th rowSpan={2} className="col-turno">TURNO</th>
                  <th rowSpan={2} className="col-date">FECHA INICIO</th>
                  <th rowSpan={2} className="col-date">FECHA FIN</th>
                  <th rowSpan={2} className="col-obs">OBSERVACIONES</th>
                  <th colSpan={currentMonthDays.length} className="col-month-header">
                    {monthsList.find(m => m.value === selectedMonth)?.label.toUpperCase()} - {turnsList.find(t => t.value === selectedTurn)?.label.toUpperCase()}
                  </th>
                  <th rowSpan={2} className="col-total">PLATOS VENDIDOS</th>
                  <th rowSpan={2} className="col-total">PLATOS EN BS</th>
                  <th rowSpan={2} className="col-balance-input">CARGAR PAGO (BS)</th>
                  <th rowSpan={2} className="col-balance">SALDO ALMUERZO</th>
                  <th rowSpan={2} className="col-balance-input">SALDO MERIENDA (BS)</th>
                  <th rowSpan={2} className="col-color">COLOR</th>
                  <th rowSpan={2} className="col-actions">ACCIONES</th>
                </tr>
                <tr className="days-header-row">
                  {currentMonthDays.map(d => (
                    <th key={d.key} className="col-day" title={d.label}>{d.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredData.length > 0 ? (
                  filteredData.map((row, index) => {
                    const isSaving = savingRows.has(row.id);
                    const rowColorClass = row.color ? `row-color--${row.color.toLowerCase()}` : '';
                    
                    return (
                      <tr 
                        key={row.id} 
                        className={`excel-row ${rowColorClass} ${isSaving ? 'row-saving' : ''}`}
                      >
                        <td className="cell-nro text-center">{index + 1}</td>
                        <td className="cell-alumno">
                          <input
                            type="text"
                            value={row.alumno || ''}
                            onChange={(e) => {
                              const newData = [...data];
                              const idx = newData.findIndex(r => r.id === row.id);
                              newData[idx].alumno = e.target.value;
                              setData(newData);
                            }}
                            onBlur={(e) => handleCellChange(row.id, 'alumno', e.target.value)}
                            className="cell-input text-bold"
                          />
                        </td>
                        <td className="cell-curso">
                          <input
                            type="text"
                            value={row.curso || ''}
                            onChange={(e) => {
                              const newData = [...data];
                              const idx = newData.findIndex(r => r.id === row.id);
                              newData[idx].curso = e.target.value;
                              setData(newData);
                            }}
                            onBlur={(e) => handleCellChange(row.id, 'curso', e.target.value)}
                            className="cell-input text-center"
                          />
                        </td>
                        <td className="cell-turno">
                          <input
                            type="text"
                            value={row.turno || ''}
                            onChange={(e) => {
                              const newData = [...data];
                              const idx = newData.findIndex(r => r.id === row.id);
                              newData[idx].turno = e.target.value;
                              setData(newData);
                            }}
                            onBlur={(e) => handleCellChange(row.id, 'turno', e.target.value)}
                            className="cell-input text-center"
                          />
                        </td>
                        <td className="cell-date">
                          <input
                            type="text"
                            value={row.fecha_inicio || ''}
                            placeholder="-"
                            onChange={(e) => {
                              const newData = [...data];
                              const idx = newData.findIndex(r => r.id === row.id);
                              newData[idx].fecha_inicio = e.target.value;
                              setData(newData);
                            }}
                            onBlur={(e) => handleCellChange(row.id, 'fecha_inicio', e.target.value)}
                            className="cell-input text-center"
                          />
                        </td>
                        <td className="cell-date">
                          <input
                            type="text"
                            value={row.fecha_fin || ''}
                            placeholder="-"
                            onChange={(e) => {
                              const newData = [...data];
                              const idx = newData.findIndex(r => r.id === row.id);
                              newData[idx].fecha_fin = e.target.value;
                              setData(newData);
                            }}
                            onBlur={(e) => handleCellChange(row.id, 'fecha_fin', e.target.value)}
                            className="cell-input text-center"
                          />
                        </td>
                        <td className="cell-obs">
                          <input
                            type="text"
                            value={row.observaciones || ''}
                            placeholder="-"
                            onChange={(e) => {
                              const newData = [...data];
                              const idx = newData.findIndex(r => r.id === row.id);
                              newData[idx].observaciones = e.target.value;
                              setData(newData);
                            }}
                            onBlur={(e) => handleCellChange(row.id, 'observaciones', e.target.value)}
                            className="cell-input"
                          />
                        </td>
                        
                        {/* Dynamic Day Columns */}
                        {currentMonthDays.map(d => {
                          const val = row.asistencias?.[d.key] || '';
                          const isFalta = val.toUpperCase() === 'F';
                          return (
                            <td key={d.key} className="cell-day">
                              <input
                                type="text"
                                value={val}
                                onChange={(e) => {
                                  const newData = [...data];
                                  const idx = newData.findIndex(r => r.id === row.id);
                                  if (!newData[idx].asistencias) {
                                    newData[idx].asistencias = {};
                                  }
                                  newData[idx].asistencias[d.key] = e.target.value;
                                  setData(newData);
                                }}
                                onBlur={(e) => handleCellChange(row.id, d.key, e.target.value)}
                                className={`cell-day-input text-center ${isFalta ? 'cell-day-input--falta' : ''}`}
                                maxLength={10}
                              />
                            </td>
                          );
                        })}
                        {/* Calculated fields */}
                        <td className="cell-total text-center text-bold bg-light">
                          {row.platos_vendidos}
                        </td>
                        <td className="cell-total text-center text-bold bg-light text-success">
                          {row.platos_vendidos_bs} Bs
                        </td>

                        {/* Cargar Pago (Bs) */}
                        <td className="cell-balance-input">
                          <div className="balance-input-wrapper">
                            <input
                              type="number"
                              value={row.pagos_bs || ''}
                              placeholder="0"
                              onChange={(e) => {
                                const newData = [...data];
                                const idx = newData.findIndex(r => r.id === row.id);
                                newData[idx].pagos_bs = e.target.value;
                                setData(newData);
                              }}
                              onBlur={(e) => handleCellChange(row.id, 'pagos_bs', e.target.value)}
                              className="cell-balance-input-field text-center text-bold"
                            />
                            <div className="quick-pay-chips">
                              <button
                                type="button"
                                className="quick-chip chip-settle"
                                onClick={() => handleSettleStudentDebt(row.id)}
                                title="Saldar al día (igualar pago a platos consumidos)"
                              >
                                Saldar
                              </button>
                              <button
                                type="button"
                                className="quick-chip chip-month"
                                onClick={() => handleSetFullMonthPayment(row.id)}
                                title={`Pagar mes completo (${currentMonthDays.length} días = ${currentMonthDays.length * getPricePerPlate(row.curso)} Bs)`}
                              >
                                Mes
                              </button>
                            </div>
                          </div>
                        </td>

                        {/* Saldo Almuerzo */}
                        {(() => {
                          const netBalance = Number(row.pagos_bs || 0) - Number(row.platos_vendidos_bs || 0);
                          const balanceClass = netBalance > 0 ? 'text-success' : netBalance < 0 ? 'text-danger' : 'text-muted';
                          return (
                            <td className={`cell-balance text-center text-bold bg-light ${balanceClass}`}>
                              {netBalance} Bs
                            </td>
                          );
                        })()}

                        {/* Saldo Merienda */}
                        <td className="cell-balance-input">
                          <input
                            type="number"
                            value={row.saldo_merienditas || ''}
                            placeholder="0"
                            onChange={(e) => {
                              const newData = [...data];
                              const idx = newData.findIndex(r => r.id === row.id);
                              newData[idx].saldo_merienditas = e.target.value;
                              setData(newData);
                            }}
                            onBlur={(e) => handleCellChange(row.id, 'saldo_merienditas', e.target.value)}
                            className="cell-balance-input-field text-center text-bold text-info"
                          />
                        </td>

                        {/* Row Color dot picker */}
                        <td className="cell-color">
                          <div className="color-dots-picker">
                            {colorOptions.map(option => (
                              <button
                                key={option.value}
                                onClick={() => handleColorChange(row.id, option.value)}
                                className={`color-dot dot-${option.value.toLowerCase() || 'none'} ${row.color === option.value ? 'active' : ''}`}
                                title={option.label}
                                type="button"
                              />
                            ))}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="cell-actions text-center">
                          <div className="action-row">
                            {isSaving ? (
                              <Loader2 className="spinner spinner-small text-muted" size={16} />
                            ) : (
                              <button
                                className="icon-btn delete-btn"
                                onClick={() => handleDeleteRow(row.id, row.alumno)}
                                title="Eliminar Registro"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={31 + currentMonthDays.length} className="empty-state">
                      No se encontraron registros de cobros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}
