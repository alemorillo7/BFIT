export const SNACK_PRICE_BS = 17;

export function courseSupportsSnack(course) {
  const normalizedCourse = String(course ?? '').trim().toUpperCase();
  // Match \dS, \dSA, \dSB or explicit SECUNDARIA → no snack
  return !/\dS[AB]?$/.test(normalizedCourse) && !normalizedCourse.includes('SECUNDARIA');
}

/** Normalizes a value typed in a daily Cobros cell. */
export function normalizeAttendanceCode(value) {
  return String(value ?? '').trim().toUpperCase();
}

/**
 * Interprets the daily shortcuts. Numeric quantities greater than one are
 * retained for historical records, while arbitrary text never becomes a meal.
 */
export function getAttendanceConsumption(value) {
  const code = normalizeAttendanceCode(value);
  if (code === '1') return { lunches: 1, snacks: 0 };
  if (code === '4') return { lunches: 1, snacks: 1 };
  if (code === 'M') return { lunches: 0, snacks: 1 };
  if (!code || code === '0' || code === 'F') return { lunches: 0, snacks: 0 };

  const quantity = Number(code);
  return Number.isFinite(quantity) && quantity > 0
    ? { lunches: quantity, snacks: 0 }
    : { lunches: 0, snacks: 0 };
}

export function isAttendanceDayKey(key) {
  return /^\d+$/.test(String(key));
}

/** Precio del almuerzo según el curso (secundaria 35, el resto 32). */
export function getPricePerPlate(course) {
  const norm = String(course || '').toUpperCase();
  if (/\dS[AB]?$/.test(norm) || norm.includes('SECUNDARIA')) return 35;
  return 32;
}

/**
 * Totales de una fila a partir de sus celdas diarias. Es la misma cuenta que hace
 * la planilla; la usa también la sincronización para recalcular después de fusionar
 * una fila con lo que había en el servidor.
 */
export function computeRowTotals(asistencias, course) {
  let plates = 0;
  let meriendas = 0;
  const snack = courseSupportsSnack(course);
  Object.keys(asistencias || {}).forEach((key) => {
    if (!isAttendanceDayKey(key)) return;
    const consumption = getAttendanceConsumption(asistencias[key]);
    plates += consumption.lunches;
    meriendas += snack ? consumption.snacks : 0;
  });
  return {
    platos_vendidos: plates,
    platos_vendidos_bs: plates * getPricePerPlate(course),
    meriendas_consumidas: meriendas,
    meriendas_consumidas_bs: meriendas * SNACK_PRICE_BS,
  };
}

/**
 * Saldo de almuerzos según cómo trabaja Fernanda en la planilla: los pagos se
 * marcan PINTANDO los días, no en la columna "Cargar Pago".
 *   - Día con almuerzo pintado Verde            → consumido y pagado (no suma ni resta)
 *   - Día con almuerzo en Azul o sin color      → consumido sin pagar (deuda)
 *   - Día con almuerzo en Amarillo (código 4)   → la planilla lo pinta sola, no dice si está
 *     pagado: cuenta como pagado si la fila no tiene ningún día Azul, si no como deuda
 *   - Día Verde SIN almuerzo (futuro, F, vacío) → día prepagado, queda a favor
 * Si algún día se usa la columna "Cargar Pago" (pagos_bs > 0) se respeta la cuenta
 * clásica pagos − consumo, para no contar dos veces.
 */
export function computeColorBalance(asistencias, course, pagosBs) {
  const a = asistencias || {};
  const price = getPricePerPlate(course);
  const colorOf = (k) => {
    const c = String(a[`${k}_color`] || '').trim();
    return c && c.toLowerCase() !== 'none' ? c : '';
  };
  const dayKeys = Object.keys(a).filter(isAttendanceDayKey).sort((x, y) => Number(x) - Number(y));
  const pagos = Number(pagosBs || 0);

  const consumidos = dayKeys
    .map((k) => ({ k, lunches: getAttendanceConsumption(a[k]).lunches, color: colorOf(k) }))
    .filter((d) => d.lunches > 0);
  const totalConsumoBs = consumidos.reduce((s, d) => s + d.lunches * price, 0);

  if (pagos > 0) {
    return {
      saldo_bs: pagos - totalConsumoBs,
      fuente: 'pagos_bs',
      dias_debe: [], dias_pagados: [], dias_prepagados: [],
    };
  }

  const filaTieneAzul = consumidos.some((d) => /^azul$/i.test(d.color));
  const diasDebe = [];
  const diasPagados = [];
  let deudaBs = 0;
  for (const d of consumidos) {
    const pagado = /^verde$/i.test(d.color) || (/^amarillo$/i.test(d.color) && !filaTieneAzul);
    if (pagado) diasPagados.push(d.k);
    else { diasDebe.push(d.k); deudaBs += d.lunches * price; }
  }

  // Todas las claves de color Verde cuyo día no tiene almuerzo (también días sin clave de valor)
  const keysConColor = Object.keys(a)
    .filter((k) => /^\d+_color$/.test(k))
    .map((k) => k.replace('_color', ''));
  const diasPrepagados = [...new Set(keysConColor)]
    .filter((k) => /^verde$/i.test(colorOf(k)) && getAttendanceConsumption(a[k]).lunches === 0)
    .sort((x, y) => Number(x) - Number(y));
  const creditoBs = diasPrepagados.length * price;

  return {
    saldo_bs: creditoBs - deudaBs,
    fuente: 'colores',
    dias_debe: diasDebe,
    dias_pagados: diasPagados,
    dias_prepagados: diasPrepagados,
  };
}

/** Color de la fila (misma regla que la planilla): '' sin actividad, Amarillo merienda, Verde al día, Azul debe. */
export function computeRowColor(totals, pagosBs, observaciones) {
  const pagos = Number(pagosBs || 0);
  const hasActivity = Number((totals && totals.platos_vendidos) || 0) > 0 || pagos > 0;
  if (!hasActivity) return '';
  if (String(observaciones || '').toLowerCase().includes('merienda')) return 'Amarillo';
  return pagos - Number((totals && totals.platos_vendidos_bs) || 0) >= 0 ? 'Verde' : 'Azul';
}
