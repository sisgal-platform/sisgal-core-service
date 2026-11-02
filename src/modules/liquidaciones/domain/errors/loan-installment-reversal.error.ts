export const LOAN_INSTALLMENT_REVERSAL_MESSAGE =
  'Un préstamo descontado en esta liquidación tiene descuentos posteriores. Elimina primero la liquidación más reciente de ese préstamo.';

/**
 * Un préstamo de la liquidación tuvo movimientos después de ella, así que no se
 * puede devolver su saldo sin dejar inconsistentes los descuentos posteriores.
 */
export class LoanInstallmentReversalError extends Error {
  constructor(readonly loanId: number) {
    super(LOAN_INSTALLMENT_REVERSAL_MESSAGE);
    this.name = 'LoanInstallmentReversalError';
  }
}
