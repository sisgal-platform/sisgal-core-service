import {
  addCalendarDays,
  countCalendarDays,
  countPayrollDays,
  formatCalendarDate,
} from './payroll-days';

describe('countPayrollDays', () => {
  it('cuenta 30 días para un mes de 30 días', () => {
    expect(countPayrollDays('2026-09-01', '2026-09-30')).toBe(30);
  });

  it('no cuenta el día 31 de un mes completo', () => {
    expect(countPayrollDays('2026-10-01', '2026-10-31')).toBe(30);
  });

  it('cuenta febrero completo como 30 días', () => {
    expect(countPayrollDays('2026-02-01', '2026-02-28')).toBe(30);
    expect(countPayrollDays('2028-02-01', '2028-02-29')).toBe(30);
  });

  it('cuenta 15 días en cada quincena', () => {
    expect(countPayrollDays('2026-10-01', '2026-10-15')).toBe(15);
    expect(countPayrollDays('2026-10-16', '2026-10-31')).toBe(15);
    expect(countPayrollDays('2026-02-16', '2026-02-28')).toBe(15);
  });

  it('cuenta los días de un rango dentro del mes, ambos incluidos', () => {
    expect(countPayrollDays('2026-09-09', '2026-09-14')).toBe(6);
    expect(countPayrollDays('2026-09-09', '2026-09-09')).toBe(1);
  });

  it('cuenta rangos que cruzan meses y años', () => {
    expect(countPayrollDays('2026-10-10', '2026-11-12')).toBe(33);
    expect(countPayrollDays('2026-12-16', '2027-01-15')).toBe(30);
  });

  it('retorna cero cuando el fin es anterior al inicio', () => {
    expect(countPayrollDays('2026-10-02', '2026-10-01')).toBe(0);
  });
});

describe('countCalendarDays', () => {
  it('cuenta los días calendario, incluido el día 31', () => {
    expect(countCalendarDays('2026-10-01', '2026-10-31')).toBe(31);
    expect(countCalendarDays('2026-08-30', '2026-08-31')).toBe(2);
    expect(countCalendarDays('2026-02-27', '2026-03-02')).toBe(4);
  });

  it('retorna cero cuando el fin es anterior al inicio', () => {
    expect(countCalendarDays('2026-10-02', '2026-10-01')).toBe(0);
  });
});

describe('addCalendarDays', () => {
  it('desplaza fechas cruzando meses y años', () => {
    expect(addCalendarDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addCalendarDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('formatCalendarDate', () => {
  it('presenta la fecha como DD/MM/YYYY', () => {
    expect(formatCalendarDate('2026-10-05')).toBe('05/10/2026');
  });
});
