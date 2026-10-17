export type AttendanceIndicator = {
  /** Porcentaje de marcaciones reales sobre las esperadas en el período. Null si no hay empleados activos. */
  averagePercentage: number | null;
  /** Puntos porcentuales de diferencia contra el período anterior de igual duración. */
  changeVsPreviousPeriod: number | null;
  weeklyDistribution: { day: string; percentage: number }[];
};

export type WorkedHoursIndicator = {
  /** Horas trabajadas totales en el período. Null si no hay marcaciones. */
  total: number | null;
  changeVsPreviousPeriod: number | null;
  trend: { month: string; hours: number }[];
};

export type LaborCostCategory = 'Devengado' | 'Deduccion';

export type LaborCostIndicator = {
  /** Neto pagado total en el período. Null si no hay liquidaciones. */
  total: number | null;
  changeVsPreviousPeriod: number | null;
  distribution: { category: LaborCostCategory; amount: number; percentage: number }[];
};

export type DashboardIndicators = {
  attendance: AttendanceIndicator;
  workedHours: WorkedHoursIndicator;
  laborCosts: LaborCostIndicator;
};
