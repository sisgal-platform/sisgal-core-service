/**
 * La nómina se liquida en base 30: todo mes vale 30 días, el día 31 no se
 * cuenta y febrero completo también vale 30 días.
 */
export const PAYROLL_DAYS_PER_MONTH = 30;

function parseCalendarDate(date: string): [number, number, number] {
  const [year, month, day] = date.split('-').map(Number);
  return [year, month, day];
}

function isLastDayOfMonth(year: number, month: number, day: number): boolean {
  return new Date(Date.UTC(year, month, 0)).getUTCDate() === day;
}

/** Días base 30 entre dos fechas (YYYY-MM-DD), ambas incluidas. */
export function countPayrollDays(start: string, end: string): number {
  if (end < start) {
    return 0;
  }

  const [startYear, startMonth, startDay] = parseCalendarDate(start);
  const [endYear, endMonth, endDay] = parseCalendarDate(end);
  const normalizedStartDay = Math.min(startDay, PAYROLL_DAYS_PER_MONTH);
  const normalizedEndDay = isLastDayOfMonth(endYear, endMonth, endDay)
    ? PAYROLL_DAYS_PER_MONTH
    : endDay;

  return (
    (endYear - startYear) * 12 * PAYROLL_DAYS_PER_MONTH +
    (endMonth - startMonth) * PAYROLL_DAYS_PER_MONTH +
    (normalizedEndDay - normalizedStartDay) +
    1
  );
}

/** Días calendario entre dos fechas (YYYY-MM-DD), ambas incluidas. */
export function countCalendarDays(start: string, end: string): number {
  if (end < start) {
    return 0;
  }

  const [startYear, startMonth, startDay] = parseCalendarDate(start);
  const [endYear, endMonth, endDay] = parseCalendarDate(end);
  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  return (
    (Date.UTC(endYear, endMonth - 1, endDay) -
      Date.UTC(startYear, startMonth - 1, startDay)) /
      millisecondsPerDay +
    1
  );
}

/** Fecha (YYYY-MM-DD) desplazada la cantidad de días calendario indicada. */
export function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = parseCalendarDate(date);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/** Fecha en formato DD/MM/YYYY para los mensajes que ve el administrador. */
export function formatCalendarDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}
