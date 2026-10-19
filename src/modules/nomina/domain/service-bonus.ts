import { roundCurrency } from './payroll-calculation';
import { countPayrollDays } from './payroll-days';

/** Parámetro versionado en `system_config`: días de salario de prima por año trabajado. */
export const SERVICE_BONUS_DAYS_PER_YEAR_KEY = 'SERVICE_BONUS_DAYS_PER_YEAR';

export const MISSING_HIRE_DATE_CAUSE =
  'No tiene fecha de ingreso registrada; es necesaria para calcular la prima de servicios.';

/** La prima se liquida en base 360: cada semestre completo vale 180 días. */
const PAYROLL_DAYS_PER_YEAR = 360;

/** Semestre de la prima de servicios (1 ene–30 jun o 1 jul–31 dic). */
export interface ServiceBonusSemester {
  start: string;
  end: string;
  label: string;
}

export interface ServiceBonusInput {
  semester: ServiceBonusSemester;
  /** Fecha de ingreso del empleado (YYYY-MM-DD). */
  hireDate: string;
  salaryBase: number;
  /** Auxilio de transporte mensual que recibe el empleado (0 si no tiene derecho). */
  transportAllowance: number;
  daysPerYear: number;
}

export interface ServiceBonus {
  conceptName: string;
  semesterStart: string;
  semesterEnd: string;
  /** Primer día del semestre que cuenta: el inicio del semestre o el ingreso. */
  workedFrom: string;
  workedDays: number;
  semesterDays: number;
  salaryBase: number;
  transportAllowance: number;
  /** Salario base más auxilio de transporte. */
  baseAmount: number;
  daysPerYear: number;
  amount: number;
  isProportional: boolean;
}

export function serviceBonusConcept(semester: ServiceBonusSemester): string {
  return `Prima de servicios ${semester.label}`;
}

/**
 * Semestres cuya prima se paga en el período: los que terminan (30 de junio
 * o 31 de diciembre) entre `periodStart` y `periodEnd`. Como las
 * liquidaciones de un empleado no se cruzan, cada semestre se paga una vez.
 */
export function findServiceBonusSemesters(
  periodStart: string,
  periodEnd: string,
): ServiceBonusSemester[] {
  const semesters: ServiceBonusSemester[] = [];
  const firstYear = Number(periodStart.slice(0, 4));
  const lastYear = Number(periodEnd.slice(0, 4));

  for (let year = firstYear; year <= lastYear; year += 1) {
    const candidates: ServiceBonusSemester[] = [
      {
        start: `${year}-01-01`,
        end: `${year}-06-30`,
        label: `1.er semestre ${year}`,
      },
      {
        start: `${year}-07-01`,
        end: `${year}-12-31`,
        label: `2.º semestre ${year}`,
      },
    ];

    semesters.push(
      ...candidates.filter(
        (semester) => semester.end >= periodStart && semester.end <= periodEnd,
      ),
    );
  }

  return semesters;
}

/**
 * Prima de servicios de un semestre: (salario base + auxilio de transporte)
 * / 30 x días de prima por año x días trabajados del semestre / 360. Con los
 * 30 días legales queda salario x días trabajados / 360. Si el empleado
 * ingresó durante el semestre, la prima es proporcional; si ingresó después,
 * no tiene derecho y no se genera.
 */
export function calculateServiceBonus(
  input: ServiceBonusInput,
): ServiceBonus | null {
  const { semester } = input;
  if (input.hireDate > semester.end) {
    return null;
  }

  const workedFrom =
    input.hireDate > semester.start ? input.hireDate : semester.start;
  const workedDays = countPayrollDays(workedFrom, semester.end);
  const semesterDays = countPayrollDays(semester.start, semester.end);
  const baseAmount = roundCurrency(input.salaryBase + input.transportAllowance);

  return {
    conceptName: serviceBonusConcept(semester),
    semesterStart: semester.start,
    semesterEnd: semester.end,
    workedFrom,
    workedDays,
    semesterDays,
    salaryBase: input.salaryBase,
    transportAllowance: input.transportAllowance,
    baseAmount,
    daysPerYear: input.daysPerYear,
    amount: roundCurrency(
      ((baseAmount / 30) * input.daysPerYear * workedDays) /
        PAYROLL_DAYS_PER_YEAR,
    ),
    isProportional: workedDays < semesterDays,
  };
}
