/**
 * Un préstamo cambió (otro descuento, un pago o un cambio de estado) entre el
 * cálculo de la liquidación y su registro. La liquidación no se guarda para no
 * descontar una cuota sobre un saldo desactualizado.
 */
export class LoanInstallmentConflictError extends Error {
  constructor(readonly loanId: number) {
    super(
      `El préstamo #${loanId} cambió mientras se generaba la liquidación. Vuelva a generarla para descontar la cuota con el saldo actualizado.`,
    );
    this.name = 'LoanInstallmentConflictError';
  }
}
