import {
  type ServiceBonusInput,
  calculateServiceBonus,
  findServiceBonusSemesters,
} from './service-bonus';

describe('service-bonus', () => {
  const firstSemester2026 = {
    start: '2026-01-01',
    end: '2026-06-30',
    label: '1.er semestre 2026',
  };

  // Salario de 1.500.000 con auxilio de transporte de 249.095.
  function input(
    overrides: Partial<ServiceBonusInput> = {},
  ): ServiceBonusInput {
    return {
      semester: firstSemester2026,
      hireDate: '2025-08-01',
      salaryBase: 1_500_000,
      transportAllowance: 249_095,
      daysPerYear: 30,
      ...overrides,
    };
  }

  describe('findServiceBonusSemesters', () => {
    it('paga el primer semestre en la liquidación que incluye el 30 de junio', () => {
      expect(findServiceBonusSemesters('2026-06-01', '2026-06-30')).toEqual([
        firstSemester2026,
      ]);
      expect(findServiceBonusSemesters('2026-06-16', '2026-06-30')).toEqual([
        firstSemester2026,
      ]);
    });

    it('paga el segundo semestre en la liquidación que incluye el 31 de diciembre', () => {
      expect(findServiceBonusSemesters('2026-12-16', '2027-01-15')).toEqual([
        { start: '2026-07-01', end: '2026-12-31', label: '2.º semestre 2026' },
      ]);
    });

    it('no paga prima en un período que no incluye un fin de semestre', () => {
      expect(findServiceBonusSemesters('2026-09-01', '2026-09-30')).toEqual([]);
      expect(findServiceBonusSemesters('2026-06-01', '2026-06-15')).toEqual([]);
      expect(findServiceBonusSemesters('2026-12-01', '2026-12-30')).toEqual([]);
    });

    it('paga cada semestre que termina dentro de un período largo', () => {
      expect(
        findServiceBonusSemesters('2026-06-01', '2026-12-31').map(
          (semester) => semester.label,
        ),
      ).toEqual(['1.er semestre 2026', '2.º semestre 2026']);
    });
  });

  describe('calculateServiceBonus', () => {
    it('paga medio mes de salario más auxilio por un semestre completo', () => {
      expect(calculateServiceBonus(input())).toEqual({
        conceptName: 'Prima de servicios 1.er semestre 2026',
        semesterStart: '2026-01-01',
        semesterEnd: '2026-06-30',
        workedFrom: '2026-01-01',
        workedDays: 180,
        semesterDays: 180,
        salaryBase: 1_500_000,
        transportAllowance: 249_095,
        baseAmount: 1_749_095,
        daysPerYear: 30,
        // 1.749.095 x 180 / 360.
        amount: 874_547.5,
        isProportional: false,
      });
    });

    it('calcula la prima proporcional cuando el empleado ingresó durante el semestre', () => {
      const bonus = calculateServiceBonus(input({ hireDate: '2026-03-01' }));

      // Del 1 de marzo al 30 de junio son 120 días en base 360.
      expect(bonus).toMatchObject({
        workedFrom: '2026-03-01',
        workedDays: 120,
        amount: 583_031.67,
        isProportional: true,
      });
    });

    it('cuenta un día cuando el empleado ingresó el último día del semestre', () => {
      expect(
        calculateServiceBonus(input({ hireDate: '2026-06-30' })),
      ).toMatchObject({ workedDays: 1, amount: 4_858.6, isProportional: true });
    });

    it('no genera prima cuando el empleado ingresó después del semestre', () => {
      expect(
        calculateServiceBonus(input({ hireDate: '2026-07-01' })),
      ).toBeNull();
    });

    it('no suma auxilio de transporte a la base de quien no tiene derecho', () => {
      expect(
        calculateServiceBonus(
          input({ salaryBase: 4_000_000, transportAllowance: 0 }),
        ),
      ).toMatchObject({ baseAmount: 4_000_000, amount: 2_000_000 });
    });

    it('usa los días de prima por año configurados', () => {
      expect(calculateServiceBonus(input({ daysPerYear: 15 }))).toMatchObject({
        daysPerYear: 15,
        amount: 437_273.75,
      });
    });
  });
});
