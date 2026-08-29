import xlsx from 'xlsx';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// 1. Parse .env file manually to avoid dependency issues
const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[match[1]] = value;
  }
});

const supabaseUrl = env.SUPABASE_COBROS_URL;
const supabaseKey = env.SUPABASE_COBROS_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_COBROS_URL or SUPABASE_COBROS_SERVICE_ROLE_KEY is missing in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 2. Read the Excel File
const filePath = 'c:\\Users\\ezeco\\Downloads\\B-FIT\\PLANILLA AGOSTO. FINAL FINAL.xlsx';
if (!fs.existsSync(filePath)) {
  console.error(`Error: File not found at ${filePath}`);
  process.exit(1);
}

const workbook = xlsx.readFile(filePath, { cellStyles: true });
const turnSheets = ['11;50', '11;25', '12;00', '12;40', '13;05'];

// Helpers for name comparison and cleaning
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

const getCellColor = (cell) => {
  if (!cell || !cell.s || !cell.s.bgColor || !cell.s.bgColor.rgb) return null;
  const rgb = String(cell.s.bgColor.rgb).toUpperCase();
  if (rgb === 'FFFFFF' || rgb === '000000') return null;
  if (rgb === 'FFF2CC' || rgb === 'FEF2CB') return 'FFF2CC'; // Amarillo Excel
  return rgb;
};

// Day labels mapping matching August 2026 columns
const dayLabels = ['3', '4', '5', '10', '11', '12', '13', '14', '17', '18', '19', '20', '21', '24', '25', '26', '27', '28', '31'];

async function run() {
  console.log('Retrieving existing database records for 2026-08...');
  const { data: dbRecords, error: fetchErr } = await supabase
    .from('cobros')
    .select('*')
    .eq('mes', '2026-08');

  if (fetchErr) {
    console.error('Error fetching database records:', fetchErr);
    process.exit(1);
  }

  console.log(`Fetched ${dbRecords.length} records from Supabase.`);

  const findMatch = (excelName, turn) => {
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
            overlap += 2.0; // exact word match has high weight
          } else if (ew.length >= 4 && dw.length >= 4 && (ew.startsWith(dw) || dw.startsWith(ew))) {
            overlap += 1.0; // prefix match
          }
        });
      });
      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestDb = dbRec;
      }
    }
    // A minimum overlap score of 2.0 (equivalent to at least 1 exact match word or 2 prefix matches)
    return maxOverlap >= 2.0 ? bestDb : null;
  };

  let updatedCount = 0;
  let insertedCount = 0;

  for (const sheetName of turnSheets) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      console.warn(`Warning: Sheet ${sheetName} not found in workbook.`);
      continue;
    }

    const turn = sheetName.replace(';', ':');
    const range = xlsx.utils.decode_range(sheet['!ref']);
    console.log(`\nProcessing turn ${turn} (${sheetName}) with ${range.e.r - 7} rows...`);

    for (let r = 8; r <= range.e.r; r++) {
      const alumnoCell = sheet[xlsx.utils.encode_cell({ r, c: 1 })];
      const cursoCell = sheet[xlsx.utils.encode_cell({ r, c: 2 })];

      if (!alumnoCell || !alumnoCell.v || String(alumnoCell.v).trim() === '') {
        continue;
      }

      const excelName = String(alumnoCell.v).trim();
      const curso = cursoCell ? String(cursoCell.v).trim() : '';
      const fechaInicio = sheet[xlsx.utils.encode_cell({ r, c: 3 })]?.v || null;
      const fechaFin = sheet[xlsx.utils.encode_cell({ r, c: 4 })]?.v || null;
      const observaciones = sheet[xlsx.utils.encode_cell({ r, c: 5 })]?.v || null;

      const platosVendidos = Number(sheet[xlsx.utils.encode_cell({ r, c: 25 })]?.v || 0);
      const platosVendidosBs = Number(sheet[xlsx.utils.encode_cell({ r, c: 26 })]?.v || 0);
      const colorFromExcel = getCellColor(alumnoCell) || getCellColor(cursoCell) || null;

      // Parse daily attendance JSONB mapping
      const asistencias = {};
      for (let idx = 0; idx < dayLabels.length; idx++) {
        const colIndex = 6 + idx;
        const val = sheet[xlsx.utils.encode_cell({ r, c: colIndex })]?.v;
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          asistencias[dayLabels[idx]] = String(val).trim();
        }
      }

      // Check if student exists in database
      const dbMatch = findMatch(excelName, turn);

      if (dbMatch) {
        // Merge/Update: Keep their payments, calculate new balance color
        const pagosBs = Number(dbMatch.pagos_bs || 0);
        const newSaldo = pagosBs - platosVendidosBs;

        let newColor = dbMatch.color;
        if (!dbMatch.color || dbMatch.color === 'Verde' || dbMatch.color === 'Azul') {
          newColor = newSaldo >= 0 ? 'Verde' : 'Azul';
        } else if (colorFromExcel) {
          newColor = colorFromExcel;
        }

        const updateData = {
          curso,
          fecha_inicio: fechaInicio || dbMatch.fecha_inicio,
          fecha_fin: fechaFin || dbMatch.fecha_fin,
          observaciones: observaciones || dbMatch.observaciones,
          asistencias,
          platos_vendidos: platosVendidos,
          platos_vendidos_bs: platosVendidosBs,
          color: newColor,
          updated_at: new Date().toISOString()
        };

        const { error: updateErr } = await supabase
          .from('cobros')
          .update(updateData)
          .eq('id', dbMatch.id);

        if (updateErr) {
          console.error(`Error updating student "${excelName}":`, updateErr);
        } else {
          updatedCount++;
        }
      } else {
        // Insert: New student
        let newColor = colorFromExcel;
        // Default color based on balance
        if (!newColor) {
          newColor = -platosVendidosBs >= 0 ? 'Verde' : 'Azul';
        }

        const insertData = {
          alumno: excelName,
          curso,
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          observaciones,
          mes: '2026-08',
          turno: turn,
          asistencias,
          platos_vendidos: platosVendidos,
          platos_vendidos_bs: platosVendidosBs,
          pagos_bs: 0,
          saldo_merienditas: 0,
          color: newColor
        };

        const { error: insertErr } = await supabase
          .from('cobros')
          .insert(insertData);

        if (insertErr) {
          console.error(`Error inserting new student "${excelName}":`, insertErr);
        } else {
          insertedCount++;
        }
      }
    }
  }

  console.log(`\nImport complete!`);
  console.log(`- Students merged and updated: ${updatedCount}`);
  console.log(`- New students inserted: ${insertedCount}`);
}

run();
