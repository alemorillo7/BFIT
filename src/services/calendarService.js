import { sendWebhookMutation } from './dataService';

const STORAGE_KEY = 'bfit_non_school_days_v2';

export const DEFAULT_NON_SCHOOL_DAYS = {
  '2026-08': [
    { day: 6, reason: 'Feriado Patrio (6 de Agosto)' },
    { day: 7, reason: 'Feriado Patrio (7 de Agosto)' },
  ],
  '2026-09': [
    { day: 2, reason: 'Día sin clases' },
    { day: 18, reason: 'Día sin clases' },
    { day: 21, reason: 'Receso de Primavera' },
    { day: 22, reason: 'Receso de Primavera' },
    { day: 23, reason: 'Receso de Primavera' },
    { day: 24, reason: 'Receso de Primavera' },
    { day: 25, reason: 'Receso de Primavera' },
  ],
};

/**
 * Get the full map of non-school days by yearMonth
 * @returns {Record<string, Array<{ day: number, reason: string }>>}
 */
export const getAllNonSchoolDaysMap = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_NON_SCHOOL_DAYS, ...parsed };
    }
  } catch (e) {
    console.error('Error reading non-school days:', e);
  }
  return { ...DEFAULT_NON_SCHOOL_DAYS };
};

/**
 * Get non-school days for a specific yearMonth (e.g. '2026-09')
 * @param {string} yearMonth
 * @returns {Array<{ day: number, reason: string }>}
 */
export const getNonSchoolDaysForMonth = (yearMonth) => {
  const allMap = getAllNonSchoolDaysMap();
  return allMap[yearMonth] || DEFAULT_NON_SCHOOL_DAYS[yearMonth] || [];
};

/**
 * Save non-school days for a month and optionally sync to Observaciones
 * @param {string} yearMonth
 * @param {Array<{ day: number, reason: string }>} daysList
 * @param {boolean} syncToObservaciones
 */
export const saveNonSchoolDaysForMonth = async (yearMonth, daysList, syncToObservaciones = true) => {
  try {
    const allMap = getAllNonSchoolDaysMap();
    allMap[yearMonth] = daysList;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allMap));

    // Dispatch global event for active tabs/components
    window.dispatchEvent(new CustomEvent('bfit-calendar-updated', { detail: { yearMonth, daysList } }));

    // Send webhook mutations to Observaciones for AI agent
    if (syncToObservaciones && daysList.length > 0) {
      const promises = daysList.map((item) => {
        const dateStr = `${yearMonth}-${String(item.day).padStart(2, '0')}`;
        return sendWebhookMutation('Observaciones', 'ALTA', {
          alumno: 'GENERAL (FERIADO/SIN CLASES)',
          fecha: dateStr,
          motivo_de_falta: item.reason || 'Día sin clases / Feriado / Receso',
          hora_registro: '08:00',
        }).catch((err) => console.warn('Observaciones webhook notice error:', err));
      });
      await Promise.allSettled(promises);
    }
    return true;
  } catch (e) {
    console.error('Error saving non-school days:', e);
    return false;
  }
};

/**
 * Dynamically compute working days for a month (excluding weekends and custom non-school days)
 * @param {string} yearMonth
 * @param {Array<{ day: number, reason: string }>} [customNonSchoolDays]
 * @returns {Array<{ key: string, label: string, dayNum: number }>}
 */
export const getDynamicWorkingDays = (yearMonth, customNonSchoolDays = null) => {
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const nonSchool = customNonSchoolDays || getNonSchoolDaysForMonth(yearMonth);
  const nonSchoolDayNums = new Set(nonSchool.map((d) => Number(d.day)));

  const date = new Date(year, month - 1, 1);
  const days = [];
  const dayNames = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

  while (date.getMonth() === month - 1) {
    const dayOfWeek = date.getDay();
    // Exclude weekends (0 = Sunday, 6 = Saturday)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const dayNum = date.getDate();
      if (!nonSchoolDayNums.has(dayNum)) {
        days.push({
          key: String(dayNum),
          label: `${dayNames[dayOfWeek]} ${dayNum}`,
          dayNum: dayNum,
        });
      }
    }
    date.setDate(date.getDate() + 1);
  }

  return days;
};

/**
 * Generate human summary of non-school days for a month
 * @param {string} yearMonth
 * @returns {{ title: string, text: string, type: string }}
 */
export const getDynamicMonthNotice = (yearMonth, workingDaysCount) => {
  const nonSchool = getNonSchoolDaysForMonth(yearMonth);
  const [year, month] = yearMonth.split('-');
  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const monthName = monthNames[parseInt(month, 10) - 1] || yearMonth;

  if (nonSchool.length === 0) {
    return {
      title: `Calendario ${monthName} ${year}`,
      text: `Mes completo de clases: ${workingDaysCount} días hábiles de cobro.`,
      type: 'default',
    };
  }

  const daysStr = nonSchool.map(d => `${d.day} (${d.reason || 'Sin clases'})`).join(', ');
  return {
    title: `Observación Global de ${monthName} ${year}`,
    text: `Días sin clases: ${daysStr}. Total: ${workingDaysCount} días hábiles de cobro.`,
    type: 'info',
  };
};
