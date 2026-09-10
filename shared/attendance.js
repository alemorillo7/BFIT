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
