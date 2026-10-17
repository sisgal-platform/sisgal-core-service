
export interface TransportAllowanceResult {
  /** Indica si el salario cumple el límite de elegibilidad. */
  isEligible: boolean;

  /** Salario mínimo vigente utilizado en el cálculo. */
  minimumWage: number;

  /** Límite salarial: dos salarios mínimos. */
  salaryLimit: number;

  /** Valor mensual del auxilio configurado. */
  configuredAllowance: number;

  /** Valor que se incluirá en los devengos. */
  allowanceAmount: number;

  /** Fecha de referencia utilizada para consultar la configuración. */
  payrollDate: Date;
}
