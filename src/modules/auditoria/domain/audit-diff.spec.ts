import { describeFieldChange, valuesDiffer } from './audit-diff';

describe('audit-diff', () => {
  describe('valuesDiffer', () => {
    it('no debe ver un cambio entre un decimal en texto y el mismo número', () => {
      expect(valuesDiffer('1200000.00', 1200000)).toBe(false);
      expect(valuesDiffer('15', 15)).toBe(false);
    });

    it('no debe ver un cambio entre dos fechas iguales', () => {
      expect(
        valuesDiffer(
          new Date('2026-09-30T00:00:00.000Z'),
          new Date('2026-09-30T00:00:00.000Z'),
        ),
      ).toBe(false);
    });

    it('debe ver un cambio cuando el valor es distinto', () => {
      expect(valuesDiffer('1200000.00', 1300000)).toBe(true);
      expect(valuesDiffer('ACTIVO', 'INACTIVO')).toBe(true);
      expect(valuesDiffer(null, 'x')).toBe(true);
      expect(valuesDiffer('x', null)).toBe(true);
    });

    it('debe tratar null y undefined como lo mismo', () => {
      expect(valuesDiffer(null, undefined)).toBe(false);
    });

    it('no debe confundir un texto vacío con un número', () => {
      expect(valuesDiffer('', 0)).toBe(true);
    });
  });

  describe('describeFieldChange', () => {
    it('debe incluir tabla, id y campo en el nombre', () => {
      expect(
        describeFieldChange('employee', 12, 'status', 'ACTIVO', 'INACTIVO'),
      ).toEqual({
        fieldName: 'employee[12].status',
        oldValue: 'ACTIVO',
        newValue: 'INACTIVO',
      });
    });

    it('debe devolver null cuando el valor no cambió realmente', () => {
      expect(
        describeFieldChange(
          'employee',
          12,
          'salary_base',
          '1200000.00',
          1200000,
        ),
      ).toBeNull();
    });

    it('debe conservar el nulo cuando el valor anterior no existía', () => {
      expect(
        describeFieldChange('employee', 12, 'hire_date', null, '2026-01-01'),
      ).toEqual({
        fieldName: 'employee[12].hire_date',
        oldValue: null,
        newValue: '2026-01-01',
      });
    });

    it('debe indicar "?" cuando no se conoce el id del registro', () => {
      expect(
        describeFieldChange('employee', undefined, 'phone', '1', '2')
          ?.fieldName,
      ).toBe('employee[?].phone');
    });
  });
});
