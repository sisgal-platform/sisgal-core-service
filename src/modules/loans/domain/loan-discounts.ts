/**
 * Un préstamo ya tuvo descuentos si su saldo o sus cuotas pendientes dejaron
 * de coincidir con los valores con los que se otorgó.
 */
export function hasLoanDiscounts(loan: {
  totalAmount: number | string;
  outstandingBalance: number | string;
  totalInstallments: number | string;
  pendingInstallments: number | string;
}): boolean {
  return (
    Number(loan.outstandingBalance) !== Number(loan.totalAmount) ||
    Number(loan.pendingInstallments) !== Number(loan.totalInstallments)
  );
}
