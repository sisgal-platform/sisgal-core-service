import {
  DISABILITY_PAY_RULES,
  calculateDisabilityDaysPay,
  findDisabilityPayRule,
} from './disability-pay-rules';
import { DisabilityType } from 'src/modules/incapacidades/domain/value-objects/disability-type.enum';

describe('disability-pay-rules', () => {
  const generalIllness =
    DISABILITY_PAY_RULES[DisabilityType.ENFERMEDAD_GENERAL];

  it('tiene una regla para cada tipo de incapacidad registrable', () => {
    for (const type of Object.values(DisabilityType)) {
      expect(findDisabilityPayRule(type)).not.toBeNull();
    }
  });

  it('no encuentra regla para un tipo desconocido', () => {
    expect(findDisabilityPayRule('Vacaciones')).toBeNull();
    expect(findDisabilityPayRule('constructor')).toBeNull();
  });

  it('paga la enfermedad general a la mitad desde el día 91', () => {
    // Días 89 y 90 en dos terceras partes; 91 y 92 a la mitad (sin bajar del mínimo diario).
    const amount = calculateDisabilityDaysPay(
      generalIllness,
      89,
      92,
      300_000,
      58_363.5,
    );

    expect(amount).toBeCloseTo(2 * 200_000 + 2 * 150_000, 2);
  });

  it('no supera el salario diario al aplicar el mínimo diario a un salario bajo', () => {
    const amount = calculateDisabilityDaysPay(
      generalIllness,
      3,
      3,
      40_000,
      58_363.5,
    );

    expect(amount).toBe(40_000);
  });

  it('paga completos todos los días de una licencia', () => {
    const rule = DISABILITY_PAY_RULES[DisabilityType.LICENCIA_MATERNIDAD];

    expect(calculateDisabilityDaysPay(rule, 1, 10, 50_000, 58_363.5)).toBe(
      500_000,
    );
  });
});
