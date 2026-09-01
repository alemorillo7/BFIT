import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  RefreshCw, 
  Sparkles, 
  ArrowRight,
  Database,
  Eye,
  Trash2
} from 'lucide-react';
import { supabaseCobros } from '../../lib/supabaseCobrosClient';
import './ImportarExcelView.css';

export default function ImportarExcelView({ monthsList, selectedMonth, turnsList, getPricePerPlate, calculateRowTotals, onImportSuccess }) {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [sheetsList, setSheetsList] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('ALL');
  const [parsedRows, setParsedRows] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState(null);
  const [targetMonth, setTargetMonth] = useState(selectedMonth);
  const [targetTurn, setTargetTurn] = useState('AUTO');
  const [useAI, setUseAI] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const fileInputRef = useRef(null);

  // Helper to extract clean turn from text/sheet name
  const extractTurnFromText = (text) => {
    const s = String(text || '').toLowerCase();
    if (s.includes('11:50') || s.includes('11_50') || s.includes('1150') || s.includes('kinder') || s.includes('pre-k')) return '11:50';
    if (s.includes('11:25') || s.includes('11_25') || s.includes('1125')) return '11:25';
    if (s.includes('12:00') || s.includes('12_00') || s.includes('1200')) return '12:00';
    if (s.includes('12:40') || s.includes('12_40') || s.includes('1240')) return '12:40';
    if (s.includes('13:05') || s.includes('13_05') || s.includes('1305') || s.includes('1:05')) return '13:05';
    return null;
  };

  // Helper to extract course or infer from name
  const extractCourse = (courseVal, turnVal) => {
    if (courseVal && String(courseVal).trim() !== '') return String(courseVal).trim().toUpperCase();
    if (turnVal === '11:50') return 'KINDER A';
    if (turnVal === '11:25') return '4P';
    if (turnVal === '12:00') return '1P';
    if (turnVal === '12:40') return '1S';
    if (turnVal === '13:05') return '3S';
    return 'PRIMARIA';
  };

  // Process and parse workbook
  const handleFileUpload = (e) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setFileName(uploadedFile.name);
    setImportStatus(null);
    setParsedRows([]);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        setSheetsList(workbook.SheetNames);
        parseWorkbook(workbook, 'ALL');
      } catch (err) {
        console.error('Error reading Excel:', err);
        setImportStatus({ type: 'error', message: 'Error al leer el archivo Excel/CSV. Verifica que no esté dañado.' });
      }
    };
    reader.readAsArrayBuffer(uploadedFile);
  };

  // Smart Parser for Sheets
  const parseWorkbook = (workbook, sheetToParse) => {
    const sheetsToProcess = sheetToParse === 'ALL' 
      ? workbook.SheetNames.filter(s => !s.toLowerCase().includes('resumen') && !s.toLowerCase().includes('total'))
      : [sheetToParse];

    const allParsed = [];

    sheetsToProcess.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) return;

      const rawJson = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (!rawJson || rawJson.length === 0) return;

      // Find header row index
      let headerRowIndex = 0;
      let headers = [];
      for (let i = 0; i < Math.min(rawJson.length, 10); i++) {
        const row = rawJson[i].map(c => String(c).trim().toLowerCase());
        if (row.some(c => c.includes('alumno') || c.includes('nombre') || c.includes('estudiante') || c.includes('curso'))) {
          headerRowIndex = i;
          headers = row;
          break;
        }
      }

      if (headers.length === 0 && rawJson.length > 0) {
        headers = rawJson[0].map(c => String(c).trim().toLowerCase());
      }

      // Map column indexes
      const colMap = {
        alumno: headers.findIndex(h => h.includes('alumno') || h.includes('nombre') || h.includes('estudiante')),
        curso: headers.findIndex(h => h.includes('curso') || h.includes('grado') || h.includes('año')),
        turno: headers.findIndex(h => h.includes('turno') || h.includes('horario')),
        fecha_inicio: headers.findIndex(h => h.includes('inicio')),
        fecha_fin: headers.findIndex(h => h.includes('fin')),
        observaciones: headers.findIndex(h => h.includes('obs') || h.includes('dieta') || h.includes('alergia') || h.includes('detalle')),
        pagos_bs: headers.findIndex(h => h.includes('pago') || h.includes('abono') || h.includes('monto') || h.includes('cargar')),
        saldo_merienda: headers.findIndex(h => h.includes('merienda'))
      };

      // Find day columns (numeric or day names e.g. "1", "2", "l 3", "m 4")
      const dayCols = [];
      headers.forEach((h, idx) => {
        const clean = h.replace(/[^0-9]/g, '');
        const num = parseInt(clean, 10);
        if (num >= 1 && num <= 31 && idx !== colMap.alumno && idx !== colMap.curso && idx !== colMap.turno) {
          dayCols.push({ dayKey: String(num), colIdx: idx });
        }
      });

      const sheetTurn = extractTurnFromText(sheetName);

      // Parse data rows
      for (let r = headerRowIndex + 1; r < rawJson.length; r++) {
        const row = rawJson[r];
        if (!row || row.length === 0) continue;

        const alumnoRaw = colMap.alumno !== -1 ? String(row[colMap.alumno] || '').trim() : String(row[1] || '').trim();
        if (!alumnoRaw || alumnoRaw.toLowerCase().includes('total') || alumnoRaw.toLowerCase().includes('alumno')) continue;

        const cursoRaw = colMap.curso !== -1 ? String(row[colMap.curso] || '').trim() : '';
        const turnoRaw = colMap.turno !== -1 ? String(row[colMap.turno] || '').trim() : '';
        const obsRaw = colMap.observaciones !== -1 ? String(row[colMap.observaciones] || '').trim() : '';
        const pagosRaw = colMap.pagos_bs !== -1 ? Number(row[colMap.pagos_bs] || 0) : 0;

        const detectedTurn = targetTurn !== 'AUTO' ? targetTurn : (extractTurnFromText(turnoRaw) || sheetTurn || '11:50');
        const detectedCourse = extractCourse(cursoRaw, detectedTurn);

        // Parse asistencias
        const asistencias = {};
        dayCols.forEach(({ dayKey, colIdx }) => {
          const val = String(row[colIdx] || '').trim();
          if (val && val !== '0') {
            asistencias[dayKey] = val;
          }
        });

        // Compute totals
        const totals = calculateRowTotals(asistencias, detectedCourse);
        const isMerienda = obsRaw.toLowerCase().includes('merienda');
        const net = pagosRaw - totals.platos_vendidos_bs;
        const color = isMerienda ? 'Amarillo' : (net >= 0 ? 'Verde' : 'Azul');

        allParsed.push({
          alumno: alumnoRaw.toUpperCase(),
          curso: detectedCourse,
          turno: detectedTurn,
          fecha_inicio: colMap.fecha_inicio !== -1 ? String(row[colMap.fecha_inicio] || '').trim() || null : null,
          fecha_fin: colMap.fecha_fin !== -1 ? String(row[colMap.fecha_fin] || '').trim() || null : null,
          observaciones: obsRaw || null,
          asistencias,
          platos_vendidos: totals.platos_vendidos,
          platos_vendidos_bs: totals.platos_vendidos_bs,
          pagos_bs: pagosRaw,
          saldo_merienditas: colMap.saldo_merienda !== -1 ? Number(row[colMap.saldo_merienda] || 0) : 0,
          color,
          mes: targetMonth
        });
      }
    });

    setParsedRows(allParsed);
  };

  // Re-run parsing when sheet or target turn changes
  const handleSheetChange = (sheet) => {
    setSelectedSheet(sheet);
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      parseWorkbook(workbook, sheet);
    };
    reader.readAsArrayBuffer(file);
  };

  // Commit imported rows into Supabase
  const handleSaveToDatabase = async () => {
    if (parsedRows.length === 0) return;

    if (!window.confirm(`¿Confirmas importar ${parsedRows.length} alumnos al mes de ${monthsList.find(m => m.value === targetMonth)?.label}? Los registros existentes con el mismo alumno y turno se actualizarán.`)) {
      return;
    }

    try {
      setImporting(true);
      setImportProgress(10);

      // Process in batches of 50
      const batchSize = 50;
      let insertedCount = 0;

      for (let i = 0; i < parsedRows.length; i += batchSize) {
        const batch = parsedRows.slice(i, i + batchSize).map(r => ({ ...r, mes: targetMonth }));
        
        const { error } = await supabaseCobros
          .from('cobros')
          .upsert(batch, { onConflict: 'alumno, mes, turno' });

        if (error) throw error;
        insertedCount += batch.length;
        setImportProgress(Math.round((insertedCount / parsedRows.length) * 100));
      }

      setImportStatus({
        type: 'success',
        message: `¡Importación exitosa! Se cargaron ${parsedRows.length} registros en el mes de ${monthsList.find(m => m.value === targetMonth)?.label}.`
      });

      if (onImportSuccess) {
        onImportSuccess();
      }
    } catch (err) {
      console.error('Error importing to Supabase:', err);
      setImportStatus({
        type: 'error',
        message: `Error al guardar en la base de datos: ${err.message || 'Error desconocido'}`
      });
    } finally {
      setImporting(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setFileName('');
    setParsedRows([]);
    setImportStatus(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="importar-container animate-fade-in">
      {/* 1. Header Card */}
      <div className="importar-header premium-card">
        <div className="importar-title-group">
          <FileSpreadsheet size={24} className="text-primary" />
          <div>
            <h2>Cargar Planilla Excel / CSV</h2>
            <p className="text-muted">Importa masivamente las planillas de asistencia, consumos y pagos directamente al sistema</p>
          </div>
        </div>

        <div className="importar-config-bar">
          <div className="config-item">
            <label>Mes de Destino:</label>
            <select 
              value={targetMonth} 
              onChange={(e) => setTargetMonth(e.target.value)}
              className="select-config"
            >
              {monthsList.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div className="config-item">
            <label>Asignación de Turno:</label>
            <select 
              value={targetTurn} 
              onChange={(e) => setTargetTurn(e.target.value)}
              className="select-config"
            >
              <option value="AUTO">Detección Automática por Hoja / Columna</option>
              {turnsList.map(t => (
                <option key={t.value} value={t.value}>Forzar a {t.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 2. Dropzone / Upload Box */}
      {!file ? (
        <div 
          className="dropzone-card premium-card"
          onClick={() => fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            accept=".xlsx, .xls, .csv" 
            style={{ display: 'none' }} 
          />
          <div className="dropzone-content">
            <div className="dropzone-icon-circle">
              <UploadCloud size={36} className="text-primary" />
            </div>
            <h3>Haz clic para seleccionar o arrastra tu archivo Excel</h3>
            <p className="dropzone-hint">Formatos compatibles: .xlsx, .xls, .csv (Planillas de turnos o consolidadas)</p>
          </div>
        </div>
      ) : (
        <div className="file-info-card premium-card">
          <div className="file-info-left">
            <FileSpreadsheet size={32} className="text-primary" />
            <div>
              <span className="file-name">{fileName}</span>
              <span className="file-meta">{parsedRows.length} alumnos detectados listos para importar</span>
            </div>
          </div>

          <div className="file-info-right">
            {sheetsList.length > 1 && (
              <div className="sheet-selector-group">
                <label>Hoja a procesar:</label>
                <select 
                  value={selectedSheet} 
                  onChange={(e) => handleSheetChange(e.target.value)}
                  className="select-config"
                >
                  <option value="ALL">Todas las hojas ({sheetsList.length})</option>
                  {sheetsList.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}

            <button className="btn btn-outline btn-sm btn-clear" onClick={clearFile}>
              <Trash2 size={16} />
              <span>Cambiar Archivo</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. Status Alert */}
      {importStatus && (
        <div className={`status-alert ${importStatus.type === 'success' ? 'status-alert--success' : 'status-alert--error'}`}>
          {importStatus.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span>{importStatus.message}</span>
        </div>
      )}

      {/* 4. Preview Table & Action Button */}
      {parsedRows.length > 0 && (
        <div className="preview-card premium-card animate-fade-in">
          <div className="preview-header">
            <div className="preview-title">
              <Eye size={18} className="text-primary" />
              <h3>Vista Previa de Datos Mapeados ({parsedRows.length} Registros)</h3>
            </div>

            <button 
              className="btn btn-primary btn-save-import"
              onClick={handleSaveToDatabase}
              disabled={importing}
            >
              {importing ? (
                <>
                  <Loader2 size={18} className="spinner" />
                  <span>Importando ({importProgress}%)...</span>
                </>
              ) : (
                <>
                  <Database size={18} />
                  <span>Guardar {parsedRows.length} Alumnos en Base de Datos</span>
                </>
              )}
            </button>
          </div>

          <div className="table-responsive">
            <table className="preview-table">
              <thead>
                <tr>
                  <th>Nro.</th>
                  <th>Alumno</th>
                  <th>Curso</th>
                  <th>Turno</th>
                  <th>Observaciones</th>
                  <th className="text-center">Días Asistidos</th>
                  <th className="text-right">Platos en Bs</th>
                  <th className="text-right">Pagos en Bs</th>
                  <th>Color / Estado</th>
                </tr>
              </thead>
              <tbody>
                {parsedRows.slice(0, 25).map((row, idx) => (
                  <tr key={idx}>
                    <td className="text-muted">{idx + 1}</td>
                    <td className="font-semibold">{row.alumno}</td>
                    <td><span className="badge-course">{row.curso}</span></td>
                    <td className="font-medium text-primary">{row.turno}</td>
                    <td className="text-muted text-xs">{row.observaciones || '-'}</td>
                    <td className="text-center font-bold">{row.platos_vendidos}</td>
                    <td className="text-right font-semibold text-blue">{row.platos_vendidos_bs} Bs</td>
                    <td className="text-right font-semibold text-emerald">{row.pagos_bs} Bs</td>
                    <td>
                      <span className={`badge-color-status badge-status--${(row.color || 'none').toLowerCase()}`}>
                        {row.color || 'Sin color'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {parsedRows.length > 25 && (
            <div className="preview-footer-note">
              Mostrando los primeros 25 alumnos de un total de {parsedRows.length}. Al presionar "Guardar", se importarán todos.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

