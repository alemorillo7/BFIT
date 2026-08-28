import { useEffect, useState, useCallback, useMemo } from 'react';
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
  Clock
} from 'lucide-react';
import * as Papa from 'papaparse';
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
  
  return days;
};

export default function CobrosView() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState('2026-08');
  const [selectedTurn, setSelectedTurn] = useState('11:50');
  const [searchTerm, setSearchTerm] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [savingRows, setSavingRows] = useState(new Set());
  const [errorMessage, setErrorMessage] = useState(null);
  
  // Get active day columns for the selected month
  const currentMonthDays = useMemo(() => {
    return getWorkingDaysOfMonth(selectedMonth);
  }, [selectedMonth]);

  // Load data for the selected month and turn
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const { data: cobrosData, error } = await supabaseCobros
        .from('cobros')
        .select('*')
        .eq('mes', selectedMonth)
        .eq('turno', selectedTurn)
        .order('id', { ascending: true });
        
      if (error) throw error;
      setData(cobrosData || []);
    } catch (err) {
      console.error('Error loading cobros:', err);
      setErrorMessage('Error al cargar datos de Cobros desde Supabase.');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedTurn]);

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
  const calculateRowTotals = (asistencias, course) => {
    let plates = 0;
    const currentDaysKeys = currentMonthDays.map(d => d.key);
    
    Object.keys(asistencias || {}).forEach(dayKey => {
      // Only count days that actually belong to the current month's columns
      if (currentDaysKeys.includes(dayKey)) {
        const val = String(asistencias[dayKey] || '').trim();
        if (val && val !== '0') {
          plates += 1;
        }
      }
    });
    
    const price = getPricePerPlate(course);
    return {
      platos_vendidos: plates,
      platos_vendidos_bs: plates * price
    };
  };

  // Handle cell changes and auto-save
  const handleCellChange = async (rowId, key, value) => {
    const rowIndex = data.findIndex(r => r.id === rowId);
    if (rowIndex === -1) return;
    
    const oldRow = data[rowIndex];
    let updatedRow = { ...oldRow };

    if (key === 'alumno' || key === 'curso' || key === 'fecha_inicio' || key === 'fecha_fin' || key === 'observaciones') {
      updatedRow[key] = value;
      // If course changes, recalculate pricing totals
      if (key === 'curso') {
        const totals = calculateRowTotals(updatedRow.asistencias, value);
        updatedRow = { ...updatedRow, ...totals };
      }
    } else {
      // It is a day cell change
      const newAsistencias = { ...(oldRow.asistencias || {}) };
      const cleanedVal = String(value || '').trim();
      
      if (cleanedVal === '') {
        delete newAsistencias[key];
      } else {
        newAsistencias[key] = cleanedVal;
      }
      
      updatedRow.asistencias = newAsistencias;
      const totals = calculateRowTotals(newAsistencias, updatedRow.curso);
      updatedRow = { ...updatedRow, ...totals };
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
          fecha_inicio: updatedRow.fecha_inicio,
          fecha_fin: updatedRow.fecha_fin,
          observaciones: updatedRow.observaciones,
          asistencias: updatedRow.asistencias,
          platos_vendidos: updatedRow.platos_vendidos,
          platos_vendidos_bs: updatedRow.platos_vendidos_bs
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

  // Initialize a new month for the current turn with previous month's student names
  const handleInitializeMonth = async () => {
    const monthLabel = monthsList.find(m => m.value === selectedMonth)?.label;
    const turnLabel = turnsList.find(t => t.value === selectedTurn)?.label;
    
    if (!window.confirm(`¿Deseas inicializar el mes de ${monthLabel} para el ${turnLabel} con los alumnos de este mismo turno del último mes registrado? Todos los días comenzarán vacíos.`)) {
      return;
    }

    try {
      setLoading(true);
      
      // Query the database to retrieve students for the current turn across all months
      const { data: allRecords, error: fetchErr } = await supabaseCobros
        .from('cobros')
        .select('alumno, curso, color, mes')
        .eq('turno', selectedTurn);
        
      if (fetchErr) throw fetchErr;
      
      let studentsToCopy = [];
      if (allRecords && allRecords.length > 0) {
        // Sort active months and pick the most recent one containing data
        const uniqueMonths = [...new Set(allRecords.map(r => r.mes))].sort();
        // Exclude the current selected month if it's in the list
        const previousMonths = uniqueMonths.filter(m => m !== selectedMonth);
        
        if (previousMonths.length > 0) {
          const latestMonthWithData = previousMonths[previousMonths.length - 1];
          const latestRecords = allRecords.filter(r => r.mes === latestMonthWithData);
          
          studentsToCopy = latestRecords.map(r => ({
            alumno: r.alumno,
            curso: r.curso,
            color: r.color
          }));
        }
      }
      
      if (studentsToCopy.length === 0) {
        alert("No se encontraron registros de meses anteriores para este turno en la base de datos. Agrega los alumnos manualmente o carga el script SQL inicial.");
        return;
      }
      
      // Create empty records for the selected month and turn
      const newRecords = studentsToCopy.map(s => ({
        alumno: s.alumno,
        curso: s.curso,
        color: s.color,
        mes: selectedMonth,
        turno: selectedTurn,
        asistencias: {},
        platos_vendidos: 0,
        platos_vendidos_bs: 0
      }));
      
      const { data: inserted, error: insertErr } = await supabaseCobros
        .from('cobros')
        .insert(newRecords)
        .select();
        
      if (insertErr) throw insertErr;
      setData(inserted || []);
      alert(`¡${turnLabel} para ${monthLabel} inicializado correctamente con ${inserted.length} alumnos!`);
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

  // Export to CSV
  const handleExport = () => {
    const csvData = filteredData.map((row, index) => {
      const exportRow = {
        'Nro.': index + 1,
        'Alumno': row.alumno,
        'Curso': row.curso,
        'Fecha Inicio': row.fecha_inicio || '',
        'Fecha Fin': row.fecha_fin || '',
        'Observaciones': row.observaciones || '',
      };
      
      currentMonthDays.forEach(d => {
        exportRow[d.label] = row.asistencias?.[d.key] || '';
      });
      
      exportRow['Platos Vendidos'] = row.platos_vendidos;
      exportRow['Importe Total (Bs)'] = row.platos_vendidos_bs;
      
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

  // Filtering data
  const filteredData = data.filter(row => {
    const matchSearch = 
      String(row.alumno).toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(row.curso).toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(row.observaciones || '').toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchCourse = courseFilter === '' || 
      String(row.curso).toLowerCase().includes(courseFilter.toLowerCase());
      
    return matchSearch && matchCourse;
  });

  // Unique list of courses for filter dropdown
  const uniqueCourses = useMemo(() => {
    const courses = data.map(r => String(r.curso || '').trim()).filter(Boolean);
    return [...new Set(courses)].sort();
  }, [data]);

  return (
    <div className="cobros-container">
      <div className="cobros-header premium-card">
        <div className="title-section">
          <h1>Planilla de Cobros</h1>
          <p className="subtitle">Gestión e importes de comidas de alumnos</p>
        </div>

        <div className="controls-section">
          {/* Month Selector */}
          <div className="filter-box month-filter-box">
            <Calendar size={18} className="filter-icon" />
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
            <Clock size={18} className="filter-icon" />
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
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Buscar por alumno, curso..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input search-input"
            />
          </div>

          <div className="filter-box">
            <Filter size={18} className="filter-icon" />
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

          <button className="btn btn-outline" onClick={handleExport} disabled={data.length === 0}>
            <Download size={18} />
            <span>Exportar CSV</span>
          </button>

          <button className="btn btn-primary" onClick={handleAddRow}>
            <Plus size={18} />
            <span>Agregar Alumno</span>
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="error-alert">
          <AlertCircle size={20} />
          <span>{errorMessage}</span>
          <button className="btn btn-outline btn-sm" onClick={loadData}>Reintentar</button>
        </div>
      )}

      {/* Empty month initialization message */}
      {!loading && data.length === 0 && (
        <div className="empty-state-card premium-card animate-fade-in">
          <Calendar size={48} className="empty-calendar-icon" />
          <h3>No hay alumnos registrados para este turno en {monthsList.find(m => m.value === selectedMonth)?.label}</h3>
          <p>Puedes importar automáticamente los mismos alumnos registrados en este turno en meses anteriores para comenzar a cargar las asistencias.</p>
          <div className="empty-state-actions">
            <button className="btn btn-primary" onClick={handleInitializeMonth}>
              <RefreshCw size={18} />
              <span>Inicializar Alumnos del Turno</span>
            </button>
            <button className="btn btn-outline" onClick={handleAddRow}>
              <Plus size={18} />
              <span>Agregar Alumno Manualmente</span>
            </button>
          </div>
        </div>
      )}

      <div className="table-wrapper premium-card" style={{ display: data.length === 0 ? 'none' : 'block' }}>
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
                  <th rowSpan={2} className="col-date">FECHA INICIO</th>
                  <th rowSpan={2} className="col-date">FECHA FIN</th>
                  <th rowSpan={2} className="col-obs">OBSERVACIONES</th>
                  <th colSpan={currentMonthDays.length} className="col-month-header">
                    {monthsList.find(m => m.value === selectedMonth)?.label.toUpperCase()} - {turnsList.find(t => t.value === selectedTurn)?.label.toUpperCase()}
                  </th>
                  <th rowSpan={2} className="col-total">PLATOS VENDIDOS</th>
                  <th rowSpan={2} className="col-total">PLATOS EN BS</th>
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
                        {currentMonthDays.map(d => (
                          <td key={d.key} className="cell-day">
                            <input
                              type="text"
                              value={row.asistencias?.[d.key] || ''}
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
                              className="cell-day-input text-center"
                              maxLength={10}
                            />
                          </td>
                        ))}

                        {/* Calculated fields */}
                        <td className="cell-total text-center text-bold bg-light">
                          {row.platos_vendidos}
                        </td>
                        <td className="cell-total text-center text-bold bg-light text-success">
                          {row.platos_vendidos_bs} Bs
                        </td>

                        {/* Row Color dropdown */}
                        <td className="cell-color">
                          <select
                            value={row.color || ''}
                            onChange={(e) => handleColorChange(row.id, e.target.value)}
                            className="cell-color-select"
                          >
                            {colorOptions.map(option => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
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
                    <td colSpan={28 + currentMonthDays.length} className="empty-state">
                      No se encontraron registros de cobros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
