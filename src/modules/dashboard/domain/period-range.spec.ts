import {
  addDays,
  daysBetween,
  lastMonthBuckets,
  monthLabel,
  previousPeriod,
  weekdayLabel,
} from './period-range';

describe('period-range', () => {
  describe('daysBetween', () => {
    it('debe contar los días incluyendo ambos extremos', () => {
      expect(daysBetween('2026-10-01', '2026-10-01')).toBe(1);
      expect(daysBetween('2026-10-01', '2026-10-31')).toBe(31);
    });
  });

  describe('addDays', () => {
    it('debe sumar días hacia adelante', () => {
      expect(addDays('2026-10-01', 5)).toBe('2026-10-06');
    });

    it('debe restar días con un valor negativo', () => {
      expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
    });

    it('debe cruzar el límite de año correctamente', () => {
      expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    });
  });

  describe('previousPeriod', () => {
    it('debe retornar un período de igual duración inmediatamente anterior', () => {
      // Octubre tiene 31 días; el período anterior de 31 días termina el 30 de
      // septiembre, pero como septiembre solo tiene 30 días, empieza el 31 de
      // agosto (no necesariamente el mismo día del mes anterior).
      expect(previousPeriod('2026-10-01', '2026-10-31')).toEqual({
        from: '2026-08-31',
        to: '2026-09-30',
      });
    });

    it('debe funcionar con un período de un solo día', () => {
      expect(previousPeriod('2026-10-15', '2026-10-15')).toEqual({
        from: '2026-10-14',
        to: '2026-10-14',
      });
    });
  });

  describe('weekdayLabel', () => {
    it('debe retornar la etiqueta correcta del día de la semana', () => {
      // 2026-10-12 es lunes
      expect(weekdayLabel('2026-10-12')).toBe('Lun');
      expect(weekdayLabel('2026-10-18')).toBe('Dom');
    });
  });

  describe('monthLabel', () => {
    it('debe retornar la etiqueta correcta del mes', () => {
      expect(monthLabel('2026-01-15')).toBe('Ene');
      expect(monthLabel('2026-12-01')).toBe('Dic');
    });
  });

  describe('lastMonthBuckets', () => {
    it('debe retornar los N meses más recientes terminando en el mes indicado, del más antiguo al más reciente', () => {
      const buckets = lastMonthBuckets('2026-10-15', 5);

      expect(buckets.map((b) => b.label)).toEqual(['Jun', 'Jul', 'Ago', 'Sep', 'Oct']);
      expect(buckets[0]).toEqual({ label: 'Jun', from: '2026-06-01', to: '2026-06-30' });
      expect(buckets[4]).toEqual({ label: 'Oct', from: '2026-10-01', to: '2026-10-31' });
    });

    it('debe cruzar el límite de año correctamente', () => {
      const buckets = lastMonthBuckets('2026-02-10', 3);

      expect(buckets.map((b) => b.label)).toEqual(['Dic', 'Ene', 'Feb']);
      expect(buckets[0].from).toBe('2025-12-01');
    });
  });
});
