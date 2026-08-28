import { useEffect, useState, useCallback } from 'react';
import { supabaseCobros } from '../lib/supabaseCobrosClient';
import { 
  Search, 
  Plus, 
  Trash2, 
  Download, 
  AlertCircle, 
  Loader2,
  Filter
} from 'lucide-react';
import * as Papa from 'papaparse';
import './CobrosView.css';

const dayKeys = [
  'd3', 'd4', 'd5', 'd10', 'd11', 'd12', 'd13', 'd14', 'd17', 'd18', 'd19', 'd20', 'd21', 'd24', 'd25', 'd26', 'd27', 'd28', 'd31'
];

const dayLabels = [
  { key: 'd3', label: 'L 3' },
  { key: 'd4', label: 'M 4' },
  { key: 'd5', label: 'M 5' },
  { key: 'd10', label: 'L 10' },
  { key: 'd11', label: 'M 11' },
  { key: 'd12', label: 'M 12' },
  { key: 'd13', label: 'J 13' },
  { key: 'd14', label: 'V 14' },
  { key: 'd17', label: 'L 17' },
  { key: 'd18', label: 'M 18' },
  { key: 'd19', label: 'M 19' },
  { key: 'd20', label: 'J 20' },
  { key: 'd21', label: 'V 21' },
  { key: 'd24', label: 'L 24' },
  { key: 'd25', label: 'M 25' },
  { key: 'd26', label: 'M 26' },
  { key: 'd27', label: 'J 27' },
  { key: 'd28', label: 'V 28' },
  { key: 'd31', label: 'L 31' }
];



const colorOptions = [
  { value: '', label: 'Sin color' },
  { value: 'FFF2CC', label: 'Amarillo Excel' },
  { value: 'Verde', label: 'Verde' },
  { value: 'Azul', label: 'Azul' },
  { value: 'Amarillo', label: 'Amarillo' },
  { value: 'Naranja', label: 'Naranja' }
];

export default function CobrosView() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [savingRows, setSavingRows] = useState(new Set());
  const [errorMessage, setErrorMessage] = useState(null);
  
  // Load data from Supabase
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const { data: cobrosData, error } = await supabaseCobros
        .from('cobros')
        .select('*')
        .order('id', { ascending: true });
        
      if (error) throw error;
      setData(cobrosData || []);
    } catch (err) {
      console.error('Error loading cobros:', err);
      setErrorMessage('Error al cargar datos de Cobros desde Supabase.');
    } finally {
      setLoading(false);
    }
  }, []);

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
  const calculateRowTotals = (row) => {
    let plates = 0;
    dayKeys.forEach(key => {
      const val = String(row[key] || '').trim();
      // Count as plate if it is '1' or anything non-empty and not '0'
      if (val && val !== '0') {
        plates += 1;
      }
    });
    const price = getPricePerPlate(row.curso);
    return {
      platos_vendidos: plates,
      platos_vendidos_bs: plates * price
    };
  };

  // Handle cell change and auto-save to database
  const handleCellChange = async (rowId, key, value) => {
    // Find row
    const rowIndex = data.findIndex(r => r.id === rowId);
    if (rowIndex === -1) return;
    
    const oldRow = data[rowIndex];
    const newRow = { ...oldRow, [key]: value };
    
    // Recalculate totals
    const totals = calculateRowTotals(newRow);
    const updatedRow = { ...newRow, ...totals };
    
    // Update local state first for instant responsiveness
    const newData = [...data];
    newData[rowIndex] = updatedRow;
    setData(newData);
    
    // Add to saving set
    setSavingRows(prev => {
      const next = new Set(prev);
      next.add(rowId);
      return next;
    });

    try {
      const { error } = await supabaseCobros
        .from('cobros')
        .update({
          [key]: value,
          platos_vendidos: updatedRow.platos_vendidos,
          platos_vendidos_bs: updatedRow.platos_vendidos_bs
        })
        .eq('id', rowId);
        
      if (error) throw error;
    } catch (err) {
      console.error('Error updating row in Supabase:', err);
      // Revert to old row state on error
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

  // Add new empty row
  const handleAddRow = async () => {
    const newRecord = {
      alumno: 'NUEVO ALUMNO',
      curso: 'KINDER A',
      fecha_inicio: null,
      fecha_fin: null,
      observaciones: null,
      color: null,
      platos_vendidos: 0,
      platos_vendidos_bs: 0
    };
    
    // Initialize day fields to null
    dayKeys.forEach(k => {
      newRecord[k] = null;
    });

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

  // Delete row
  const handleDeleteRow = async (rowId, alumnoName) => {
    if (!window.confirm(`¿Estás seguro de eliminar el registro de Cobros de "${alumnoName}"?`)) {
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
      
      dayLabels.forEach(d => {
        exportRow[d.label] = row[d.key] || '';
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
    link.setAttribute('download', 'Cobros_Planilla_Agosto.csv');
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
  const uniqueCourses = (() => {
    const courses = data.map(r => String(r.curso || '').trim()).filter(Boolean);
    return [...new Set(courses)].sort();
  })();

  return (
    <div className="cobros-container">
      <div className="cobros-header premium-card">
        <div className="title-section">
          <h1>Planilla de Cobros</h1>
          <p className="subtitle">Gestión e importes de comidas de alumnos (Agosto 2026)</p>
        </div>

        <div className="controls-section">
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

          <button className="btn btn-outline" onClick={handleExport}>
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

      <div className="table-wrapper premium-card">
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
                  <th colSpan={19} className="col-month-header">AGOSTO 2026</th>
                  <th rowSpan={2} className="col-total">PLATOS VENDIDOS</th>
                  <th rowSpan={2} className="col-total">PLATOS EN BS</th>
                  <th rowSpan={2} className="col-color">COLOR</th>
                  <th rowSpan={2} className="col-actions">ACCIONES</th>
                </tr>
                <tr className="days-header-row">
                  {dayLabels.map(d => (
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
                        
                        {/* 19 Day Columns */}
                        {dayKeys.map(key => (
                          <td key={key} className="cell-day">
                            <input
                              type="text"
                              value={row[key] || ''}
                              onChange={(e) => {
                                const newData = [...data];
                                const idx = newData.findIndex(r => r.id === row.id);
                                newData[idx][key] = e.target.value;
                                setData(newData);
                              }}
                              onBlur={(e) => handleCellChange(row.id, key, e.target.value)}
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
                    <td colSpan={28} className="empty-state">
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
