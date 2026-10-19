import { LoanPeriodicity } from 'src/modules/loans/enums/loan-periodicity.enum';
import { formatCurrency, roundCurrency } from './payroll-calculation';
import { loanInstallmentConcept } from './payroll-concepts';

/**
 * Las cuotas de préstamos no pueden dejar al empleado con menos de la mitad
 * de su salario neto (devengado salarial menos salud y pensión), según el
 * artículo 3 de la Ley 1527 de 2012.
 */
export const MAX_LOAN_DEDUCTION_RATE = 0.5;

/** Préstamo activo del empleado, con los valores numéricos ya convertidos. */
export interface LoanInput {
  loanId: number;
  employeeId: number | null;
  totalAmount: number;
  installmentAmount: number;
  totalInstallments: number;
  pendingInstallments: number;
  outstandingBalance: number;
  /** Fecha de otorgamiento (YYYY-MM-DD). */
  grantedAt: string;
  periodicity: string;
}

/** Cuota que se descuenta de un préstamo y el efecto que tiene sobre él. */
export interface LoanInstallmentPlan {
  loanId: number;
  conceptName: string;
  /** Fechas de corte del período que cubre el descuento (YYYY-MM-DD). */
  cutoffDates: string[];
  /** Cuotas del período: una por fecha de corte, sin pasar de las pendientes. */
  installments: number;
  /** Lo que correspondía descontar sin el límite de deducciones. */
  scheduledAmount: number;
  /** Lo efectivamente descontado. */
  amount: number;
  previousBalance: number;
  newBalance: number;
  previousPendingInstallments: number;
  remainingInstallments: number;
}

export type LoanObservationReason =
  'INFORMACION_INCONSISTENTE' | 'LIMITE_DEDUCCIONES';

/** Cuota que no se pudo descontar, o que se descontó solo en parte. */
export interface LoanObservation {
  loanId: number;
  reason: LoanObservationReason;
  /** Mensaje para el administrador, sin detalles técnicos. */
  message: string;
  /** Detalle para la auditoría. */
  details: Record<string, unknown>;
}

export interface LoanDeductionsPlan {
  installments: LoanInstallmentPlan[];
  observations: LoanObservation[];
}

export interface LoanDeductionsInput {
  loans: LoanInput[];
  periodStart: string;
  periodEnd: string;
  /** Máximo que pueden sumar las cuotas del período (ver `MAX_LOAN_DEDUCTION_RATE`). */
  maxAmount: number;
}

const LIMIT_DESCRIPTION = '50% del salario neto';

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toCalendarDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Fechas de corte (YYYY-MM-DD) entre `from` y `to`, ambas incluidas: el
 * último día de cada mes y, si el préstamo es quincenal, también el día 15.
 */
export function listCutoffDates(
  periodicity: LoanPeriodicity,
  from: string,
  to: string,
): string[] {
  const dates: string[] = [];
  const [toYear, toMonth] = to.split('-').map(Number);
  let [year, month] = from.split('-').map(Number);

  while (year < toYear || (year === toYear && month <= toMonth)) {
    const days =
      periodicity === LoanPeriodicity.QUINCENAL
        ? [15, lastDayOfMonth(year, month)]
        : [lastDayOfMonth(year, month)];

    for (const day of days) {
      const date = toCalendarDate(year, month, day);
      if (date >= from && date <= to) {
        dates.push(date);
      }
    }

    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return dates;
}

function isPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** Información del préstamo que impide descontar su cuota con seguridad. */
export function findLoanInconsistencies(loan: LoanInput): string[] {
  const causes: string[] = [];

  if (loan.employeeId === null) {
    causes.push('El préstamo no tiene empleado asociado.');
  }
  if (!isPositive(loan.totalAmount)) {
    causes.push('El valor del préstamo es menor o igual a cero.');
  }
  if (
    !Number.isInteger(loan.totalInstallments) ||
    loan.totalInstallments <= 0
  ) {
    causes.push('El número de cuotas es menor o igual a cero.');
  }
  if (!isPositive(loan.installmentAmount)) {
    causes.push('El valor de la cuota es menor o igual a cero.');
  }
  if (
    !Number.isFinite(loan.outstandingBalance) ||
    loan.outstandingBalance < 0
  ) {
    causes.push('El saldo pendiente es negativo.');
  } else if (
    isPositive(loan.totalAmount) &&
    loan.outstandingBalance > loan.totalAmount
  ) {
    causes.push('El saldo pendiente supera el valor del préstamo.');
  }
  if (
    !Number.isInteger(loan.pendingInstallments) ||
    loan.pendingInstallments < 0
  ) {
    causes.push('El número de cuotas pendientes no es válido.');
  } else if (loan.pendingInstallments > loan.totalInstallments) {
    causes.push(
      'Las cuotas pendientes superan el número de cuotas configuradas.',
    );
  } else if (loan.pendingInstallments === 0 && loan.outstandingBalance > 0) {
    causes.push('Tiene saldo pendiente pero no tiene cuotas pendientes.');
  }
  if (!Object.values<string>(LoanPeriodicity).includes(loan.periodicity)) {
    causes.push('La periodicidad del préstamo no es válida.');
  }

  return causes;
}

/**
 * Cuotas de préstamos del período. Por cada préstamo se descuenta una cuota
 * por cada fecha de corte de su periodicidad que cae en el período (y no
 * antes de su otorgamiento); la última cuota descuenta exactamente el saldo
 * que queda. Los préstamos más antiguos se descuentan primero y, si las
 * cuotas superan el máximo permitido, la que no cabe se descuenta en parte y
 * queda una observación. Los préstamos con información inconsistente no se
 * descuentan.
 */
export function planLoanInstallments(
  input: LoanDeductionsInput,
): LoanDeductionsPlan {
  const installments: LoanInstallmentPlan[] = [];
  const observations: LoanObservation[] = [];
  let available = Math.max(0, roundCurrency(input.maxAmount));
  const loans = [...input.loans].sort(
    (a, b) => a.grantedAt.localeCompare(b.grantedAt) || a.loanId - b.loanId,
  );

  for (const loan of loans) {
    const causes = findLoanInconsistencies(loan);
    if (causes.length > 0) {
      observations.push({
        loanId: loan.loanId,
        reason: 'INFORMACION_INCONSISTENTE',
        message: `El préstamo #${loan.loanId} no se descontó porque tiene información inconsistente. Revíselo en el módulo de préstamos.`,
        details: { causes },
      });
      continue;
    }

    // Un préstamo sin saldo ya está pagado: no genera descuento.
    if (loan.outstandingBalance === 0) {
      continue;
    }

    const from =
      loan.grantedAt > input.periodStart ? loan.grantedAt : input.periodStart;
    const cutoffDates = listCutoffDates(
      loan.periodicity as LoanPeriodicity,
      from,
      input.periodEnd,
    );
    if (cutoffDates.length === 0) {
      continue;
    }

    const installmentCount = Math.min(
      cutoffDates.length,
      loan.pendingInstallments,
    );
    const scheduledAmount =
      installmentCount === loan.pendingInstallments
        ? loan.outstandingBalance
        : roundCurrency(
            Math.min(
              loan.installmentAmount * installmentCount,
              loan.outstandingBalance,
            ),
          );
    const amount = roundCurrency(Math.min(scheduledAmount, available));

    if (amount <= 0) {
      observations.push({
        loanId: loan.loanId,
        reason: 'LIMITE_DEDUCCIONES',
        message: `La cuota del préstamo #${loan.loanId} (${formatCurrency(scheduledAmount)}) no se descontó porque supera el límite de deducciones del período (${LIMIT_DESCRIPTION}).`,
        details: {
          scheduledAmount,
          appliedAmount: 0,
          availableAmount: available,
        },
      });
      continue;
    }

    const isPartial = amount < scheduledAmount;
    if (isPartial) {
      observations.push({
        loanId: loan.loanId,
        reason: 'LIMITE_DEDUCCIONES',
        message: `La cuota del préstamo #${loan.loanId} se descontó parcialmente (${formatCurrency(amount)} de ${formatCurrency(scheduledAmount)}) por el límite de deducciones del período (${LIMIT_DESCRIPTION}).`,
        details: {
          scheduledAmount,
          appliedAmount: amount,
          availableAmount: available,
        },
      });
    }

    available = roundCurrency(available - amount);
    const newBalance = roundCurrency(loan.outstandingBalance - amount);
    // Un descuento parcial solo cubre las cuotas que alcanzó a pagar completas.
    const coveredInstallments = isPartial
      ? Math.floor(amount / loan.installmentAmount)
      : installmentCount;

    installments.push({
      loanId: loan.loanId,
      conceptName: loanInstallmentConcept(loan.loanId),
      cutoffDates: cutoffDates.slice(0, installmentCount),
      installments: installmentCount,
      scheduledAmount,
      amount,
      previousBalance: loan.outstandingBalance,
      newBalance,
      previousPendingInstallments: loan.pendingInstallments,
      remainingInstallments:
        newBalance === 0
          ? 0
          : Math.max(1, loan.pendingInstallments - coveredInstallments),
    });
  }

  return { installments, observations };
}
