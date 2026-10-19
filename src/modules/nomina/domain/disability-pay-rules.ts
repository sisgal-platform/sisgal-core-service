import { DisabilityType } from 'src/modules/incapacidades/domain/value-objects/disability-type.enum';

/** Tarifa que se paga hasta el día `untilDay` de la incapacidad, contado desde su inicio. */
export interface DisabilityPayTier {
  untilDay: number;
  rate: number;
}

export interface DisabilityPayRule {
  concept: string;
  tiers: DisabilityPayTier[];
}

const FULL_PAY: DisabilityPayTier[] = [{ untilDay: Infinity, rate: 1 }];

/**
 * Reglas legales de pago: la enfermedad general se paga completa los dos
 * primeros días (a cargo del empleador), en dos terceras partes del día 3 al
 * 90 y a la mitad desde el día 91; el accidente de trabajo y las licencias se
 * pagan completos. "Otros" no tiene regla legal propia y se paga completo.
 */
export const DISABILITY_PAY_RULES: Record<DisabilityType, DisabilityPayRule> = {
  [DisabilityType.ENFERMEDAD_GENERAL]: {
    concept: 'Incapacidad enfermedad general',
    tiers: [
      { untilDay: 2, rate: 1 },
      { untilDay: 90, rate: 2 / 3 },
      { untilDay: Infinity, rate: 0.5 },
    ],
  },
  [DisabilityType.ACCIDENTE_TRABAJO]: {
    concept: 'Incapacidad accidente de trabajo',
    tiers: FULL_PAY,
  },
  [DisabilityType.LICENCIA_MATERNIDAD]: {
    concept: 'Licencia de maternidad',
    tiers: FULL_PAY,
  },
  [DisabilityType.LICENCIA_PATERNIDAD]: {
    concept: 'Licencia de paternidad',
    tiers: FULL_PAY,
  },
  [DisabilityType.OTROS]: {
    concept: 'Otras incapacidades',
    tiers: FULL_PAY,
  },
};

function isDisabilityType(type: string): type is DisabilityType {
  return (Object.values(DisabilityType) as string[]).includes(type);
}

export function findDisabilityPayRule(type: string): DisabilityPayRule | null {
  return isDisabilityType(type) ? DISABILITY_PAY_RULES[type] : null;
}

/**
 * Valor de los días `firstDay`..`lastDay` de una incapacidad (numerados desde
 * su inicio). Un día con tarifa reducida no puede pagarse por debajo del
 * salario mínimo diario, sin superar el salario diario del empleado.
 */
export function calculateDisabilityDaysPay(
  rule: DisabilityPayRule,
  firstDay: number,
  lastDay: number,
  dailySalary: number,
  minimumDailyWage: number,
): number {
  const reducedDayFloor = Math.min(minimumDailyWage, dailySalary);
  let amount = 0;
  let tierStart = 1;

  for (const tier of rule.tiers) {
    const from = Math.max(firstDay, tierStart);
    const to = Math.min(lastDay, tier.untilDay);

    if (to >= from) {
      const dailyPay =
        tier.rate >= 1
          ? dailySalary
          : Math.max(dailySalary * tier.rate, reducedDayFloor);
      amount += (to - from + 1) * dailyPay;
    }

    tierStart = tier.untilDay + 1;
  }

  return amount;
}
