/**
 * Valor de la cuota = valor total del préstamo / número de cuotas,
 * redondeado al peso: los pesos colombianos no se liquidan con centavos y
 * `employee_loans.installment_amount` es entero en la base de datos. La
 * diferencia que deja el redondeo se ajusta en la última cuota, que siempre
 * descuenta el saldo que queda.
 */
export function calculateInstallmentAmount(
  totalAmount: number,
  totalInstallments: number,
): number {
  return Math.round(totalAmount / totalInstallments);
}
