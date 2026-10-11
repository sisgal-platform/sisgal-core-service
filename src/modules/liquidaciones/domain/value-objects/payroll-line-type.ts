// Cada PayrollLine es un concepto individual de la liquidación (salario base,
// horas extra, recargos, préstamos, etc.); este campo dice de qué lado del
// balance va, para poder separarlos en el detalle.
export type PayrollLineType = 'DEVENGADO' | 'DEDUCCION';
