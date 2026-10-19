import type { WorkHourType } from '../application/services/payroll-hours.service';

/** Nombres de los conceptos de la liquidación (caben en `payroll_line.concept_name`). */
export const PAYROLL_CONCEPT = {
  SALARY: 'Salario base',
  TRANSPORT_ALLOWANCE: 'Auxilio de transporte',
  HEALTH: 'Salud',
  PENSION: 'Pensión',
} as const;

export function loanInstallmentConcept(loanId: number): string {
  return `Cuota préstamo #${loanId}`;
}

/**
 * Concepto devengado por cada tipo de hora: las horas extra se pagan
 * completas y las horas ordinarias solo generan el recargo, porque el
 * salario base ya las remunera.
 */
export const WORK_HOUR_CONCEPT: Record<WorkHourType, string> = {
  ORDINARIA_DIURNA: 'Recargo diurno',
  ORDINARIA_NOCTURNA: 'Recargo nocturno',
  DOMINICAL_DIURNA: 'Recargo dominical diurno',
  DOMINICAL_NOCTURNA: 'Recargo dominical nocturno',
  EXTRA_DIURNA: 'Horas extra diurnas',
  EXTRA_NOCTURNA: 'Horas extra nocturnas',
  EXTRA_DOMINICAL_DIURNA: 'Horas extra dominicales diurnas',
  EXTRA_DOMINICAL_NOCTURNA: 'Horas extra dominicales nocturnas',
};

/** Nombre de cada tipo de hora en el resumen de horas trabajadas. */
export const WORK_HOUR_LABEL: Record<WorkHourType, string> = {
  ORDINARIA_DIURNA: 'Horas ordinarias diurnas',
  ORDINARIA_NOCTURNA: 'Horas ordinarias nocturnas',
  DOMINICAL_DIURNA: 'Horas dominicales o festivas diurnas',
  DOMINICAL_NOCTURNA: 'Horas dominicales o festivas nocturnas',
  EXTRA_DIURNA: 'Horas extra diurnas',
  EXTRA_NOCTURNA: 'Horas extra nocturnas',
  EXTRA_DOMINICAL_DIURNA: 'Horas extra dominicales diurnas',
  EXTRA_DOMINICAL_NOCTURNA: 'Horas extra dominicales nocturnas',
};

/** Orden en que se presentan los tipos de hora: ordinarias, recargos y extra. */
export const WORK_HOUR_ORDER: WorkHourType[] = [
  'ORDINARIA_DIURNA',
  'ORDINARIA_NOCTURNA',
  'DOMINICAL_DIURNA',
  'DOMINICAL_NOCTURNA',
  'EXTRA_DIURNA',
  'EXTRA_NOCTURNA',
  'EXTRA_DOMINICAL_DIURNA',
  'EXTRA_DOMINICAL_NOCTURNA',
];
