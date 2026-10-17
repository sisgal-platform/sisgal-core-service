/** Zona horaria de operación del restaurante. Colombia no tiene horario de verano. */
const TIME_ZONE = 'America/Bogota';
const UTC_OFFSET = '-05:00';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const SHORT_WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const SHORT_MONTH_LABELS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

// Construir un Intl.DateTimeFormat es costoso; se cachea uno solo y se
// reutiliza, en vez de crear uno nuevo en cada llamada (esto último fue la
// causa de una prueba de rendimiento que tardaba varios segundos).
const calendarDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE });

/** Fecha de hoy (YYYY-MM-DD) en la zona horaria de operación. */
export function today(): string {
  return calendarDateFormatter.format(new Date());
}

/** Instante en que comienza el día indicado (YYYY-MM-DD) en la zona de operación. */
export function startOfDay(date: string): Date {
  return new Date(`${date}T00:00:00${UTC_OFFSET}`);
}

/** Instante en que comienza el día siguiente: límite exclusivo del día indicado. */
export function startOfNextDay(date: string): Date {
  return new Date(startOfDay(date).getTime() + MS_PER_DAY);
}

/** Cantidad de días calendario entre dos fechas (YYYY-MM-DD), ambas incluidas. */
export function daysBetween(from: string, to: string): number {
  const diff = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.round(diff / MS_PER_DAY) + 1;
}

/**
 * Período inmediatamente anterior, de la misma duración que [from, to]. Se usa
 * para calcular la variación ("vs. período anterior") sin asumir que el rango
 * seleccionado sea necesariamente un mes calendario completo.
 */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const lengthInDays = daysBetween(from, to);
  const previousTo = addDays(from, -1);
  const previousFrom = addDays(previousTo, -(lengthInDays - 1));

  return { from: previousFrom, to: previousTo };
}

/** Suma (o resta, con un número negativo) días calendario a una fecha (YYYY-MM-DD). */
export function addDays(date: string, amount: number): string {
  const shifted = new Date(startOfDay(date).getTime() + amount * MS_PER_DAY);
  return calendarDateFormatter.format(shifted);
}

/** Día de la semana (0 = domingo) de una fecha (YYYY-MM-DD), en la zona de operación. */
export function weekdayIndex(date: string): number {
  return startOfDay(date).getUTCDay();
}

/** Etiqueta corta del día de la semana, p. ej. "Lun". */
export function weekdayLabel(date: string): string {
  return SHORT_WEEKDAY_LABELS[weekdayIndex(date)];
}

/** Fecha calendario (YYYY-MM-DD) de un instante, en la zona horaria de operación. */
export function toCalendarDate(instant: Date): string {
  return calendarDateFormatter.format(instant);
}

/** Etiqueta corta del mes, p. ej. "Oct". */
export function monthLabel(date: string): string {
  const monthIndex = Number(date.slice(5, 7)) - 1;
  return SHORT_MONTH_LABELS[monthIndex];
}

export type MonthBucket = {
  label: string;
  from: string;
  to: string;
};

/**
 * Los `count` meses calendario que terminan en el mes de `to`, del más
 * antiguo al más reciente. Se usa para la tendencia de horas trabajadas.
 */
export function lastMonthBuckets(to: string, count: number): MonthBucket[] {
  const buckets: MonthBucket[] = [];
  const [yearStr, monthStr] = to.split('-');
  let year = Number(yearStr);
  let month = Number(monthStr); // 1-12

  for (let i = 0; i < count; i++) {
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    buckets.unshift({ label: monthLabel(from), from, to: monthEnd });

    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }

  return buckets;
}
