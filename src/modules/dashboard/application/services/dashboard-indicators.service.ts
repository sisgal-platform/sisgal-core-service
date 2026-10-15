import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AttendanceRecord, PayrollPeriod } from 'src/entities';
import {
  ATTENDANCE_RECORD_REPOSITORY_PORT,
  type AttendanceRecordRepositoryPort,
} from 'src/modules/asistencia/domain/ports/attendance-record.repository.port';
import {
  EMPLOYEE_REPOSITORY_PORT,
  type EmployeeRepositoryPort,
} from 'src/modules/empleados/domain/ports/employee-repository.port';
import {
  PAYROLL_PERIOD_REPOSITORY_PORT,
  type PayrollPeriodRepositoryPort,
} from 'src/modules/liquidaciones/domain/ports/payroll-period-repository.port';
import {
  AttendanceIndicator,
  DashboardIndicators,
  LaborCostIndicator,
  WorkedHoursIndicator,
} from '../../domain/dashboard-indicators';
import {
  addDays,
  daysBetween,
  lastMonthBuckets,
  previousPeriod,
  startOfDay,
  startOfNextDay,
  weekdayLabel,
} from '../../domain/period-range';

const MONTHS_IN_TREND = 5;
const MINUTES_PER_HOUR = 60;

@Injectable()
export class DashboardIndicatorsService {
  constructor(
    @Inject(ATTENDANCE_RECORD_REPOSITORY_PORT)
    private readonly attendanceRecordRepository: AttendanceRecordRepositoryPort,

    @Inject(PAYROLL_PERIOD_REPOSITORY_PORT)
    private readonly payrollPeriodRepository: PayrollPeriodRepositoryPort,

    @Inject(EMPLOYEE_REPOSITORY_PORT)
    private readonly employeeRepository: EmployeeRepositoryPort,
  ) {}

  async getIndicators(from: string, to: string): Promise<DashboardIndicators> {
    if (from > to) {
      throw new BadRequestException(
        'El período inicial no puede ser posterior al período final.',
      );
    }

    const previous = previousPeriod(from, to);

    const [
      activeEmployees,
      currentRecords,
      previousRecords,
      currentPayroll,
      previousPayroll,
      trendBuckets,
    ] = await Promise.all([
      this.employeeRepository.findAll({ status: 'ACTIVO' }),
      this.findRecordsInRange(from, to),
      this.findRecordsInRange(previous.from, previous.to),
      this.payrollPeriodRepository.findAll({ periodStart: from, periodEnd: to }),
      this.payrollPeriodRepository.findAll({
        periodStart: previous.from,
        periodEnd: previous.to,
      }),
      this.buildHoursTrend(to),
    ]);

    const activeEmployeeCount = activeEmployees.length;

    return {
      attendance: this.buildAttendanceIndicator(
        currentRecords,
        previousRecords,
        activeEmployeeCount,
        from,
        to,
      ),
      workedHours: this.buildWorkedHoursIndicator(
        currentRecords,
        previousRecords,
        trendBuckets,
      ),
      laborCosts: this.buildLaborCostIndicator(currentPayroll, previousPayroll),
    };
  }

  private findRecordsInRange(from: string, to: string): Promise<AttendanceRecord[]> {
    return this.attendanceRecordRepository.findCheckInsBetween(
      startOfDay(from),
      startOfNextDay(to),
    );
  }

  private buildAttendanceIndicator(
    currentRecords: AttendanceRecord[],
    previousRecords: AttendanceRecord[],
    activeEmployeeCount: number,
    from: string,
    to: string,
  ): AttendanceIndicator {
    const days = daysBetween(from, to);

    const currentPercentage = this.attendancePercentage(
      currentRecords.length,
      activeEmployeeCount,
      days,
    );
    const previousDays = days;
    const previousPercentage = this.attendancePercentage(
      previousRecords.length,
      activeEmployeeCount,
      previousDays,
    );

    return {
      averagePercentage: currentPercentage,
      changeVsPreviousPeriod: this.percentagePointsChange(
        currentPercentage,
        previousPercentage,
      ),
      weeklyDistribution: this.buildWeeklyDistribution(
        currentRecords,
        activeEmployeeCount,
        from,
        to,
      ),
    };
  }

  /**
   * Marcaciones esperadas: un empleado activo, un check-in por día del
   * período. Es una aproximación simple (no considera horarios ni novedades
   * como incapacidades), suficiente para un indicador de tendencia general.
   */
  private attendancePercentage(
    actualCheckIns: number,
    activeEmployeeCount: number,
    days: number,
  ): number | null {
    const expected = activeEmployeeCount * days;

    if (expected === 0) {
      return null;
    }

    return this.round((actualCheckIns / expected) * 100);
  }

  private buildWeeklyDistribution(
    records: AttendanceRecord[],
    activeEmployeeCount: number,
    from: string,
    to: string,
  ): { day: string; percentage: number }[] {
    if (activeEmployeeCount === 0) {
      return [];
    }

    const occurrencesByWeekday = new Map<string, number>();
    const checkInsByWeekday = new Map<string, number>();

    for (let date = from; date <= to; date = addDays(date, 1)) {
      const label = weekdayLabel(date);
      occurrencesByWeekday.set(label, (occurrencesByWeekday.get(label) ?? 0) + 1);
    }

    for (const record of records) {
      const date = record.check_in.toISOString().slice(0, 10);
      const label = weekdayLabel(date);
      checkInsByWeekday.set(label, (checkInsByWeekday.get(label) ?? 0) + 1);
    }

    const orderedLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

    return orderedLabels
      .filter((label) => occurrencesByWeekday.has(label))
      .map((label) => {
        const occurrences = occurrencesByWeekday.get(label) ?? 0;
        const checkIns = checkInsByWeekday.get(label) ?? 0;
        const expected = activeEmployeeCount * occurrences;

        return {
          day: label,
          percentage: expected === 0 ? 0 : this.round((checkIns / expected) * 100),
        };
      });
  }

  private buildWorkedHoursIndicator(
    currentRecords: AttendanceRecord[],
    previousRecords: AttendanceRecord[],
    trendBuckets: { label: string; hours: number }[],
  ): WorkedHoursIndicator {
    const currentHours =
      currentRecords.length === 0 ? null : this.round(this.sumHours(currentRecords));
    const previousHours =
      previousRecords.length === 0 ? null : this.round(this.sumHours(previousRecords));

    return {
      total: currentHours,
      changeVsPreviousPeriod: this.percentageChange(currentHours, previousHours),
      trend: trendBuckets.map((bucket) => ({ month: bucket.label, hours: bucket.hours })),
    };
  }

  private sumHours(records: AttendanceRecord[]): number {
    const totalMinutes = records.reduce(
      (sum, record) =>
        sum +
        record.work_minutes +
        record.extra_day_minutes +
        record.extra_night_minutes +
        record.holiday_minutes,
      0,
    );

    return totalMinutes / MINUTES_PER_HOUR;
  }

  private async buildHoursTrend(
    to: string,
  ): Promise<{ label: string; hours: number }[]> {
    const buckets = lastMonthBuckets(to, MONTHS_IN_TREND);

    const recordsByBucket = await Promise.all(
      buckets.map((bucket) => this.findRecordsInRange(bucket.from, bucket.to)),
    );

    return buckets.map((bucket, index) => ({
      label: bucket.label,
      hours: this.round(this.sumHours(recordsByBucket[index])),
    }));
  }

  private buildLaborCostIndicator(
    currentPeriods: PayrollPeriod[],
    previousPeriods: PayrollPeriod[],
  ): LaborCostIndicator {
    const currentTotal =
      currentPeriods.length === 0
        ? null
        : this.round(this.sum(currentPeriods, (period) => Number(period.net_pay)));
    const previousTotal =
      previousPeriods.length === 0
        ? null
        : this.round(this.sum(previousPeriods, (period) => Number(period.net_pay)));

    const totalEarnings = this.sum(currentPeriods, (period) => Number(period.total_earnings));
    const totalDeductions = this.sum(
      currentPeriods,
      (period) => Number(period.total_deductions),
    );
    const distributionBase = totalEarnings + totalDeductions;

    return {
      total: currentTotal,
      changeVsPreviousPeriod: this.percentageChange(currentTotal, previousTotal),
      distribution:
        currentPeriods.length === 0
          ? []
          : [
              {
                category: 'Devengado',
                amount: this.round(totalEarnings),
                percentage:
                  distributionBase === 0 ? 0 : this.round((totalEarnings / distributionBase) * 100),
              },
              {
                category: 'Deduccion',
                amount: this.round(totalDeductions),
                percentage:
                  distributionBase === 0
                    ? 0
                    : this.round((totalDeductions / distributionBase) * 100),
              },
            ],
    };
  }

  private sum<T>(items: T[], selector: (item: T) => number): number {
    return items.reduce((sum, item) => sum + selector(item), 0);
  }

  /** Variación porcentual entre dos totales (no puntos porcentuales: se usa para horas y costos). */
  private percentageChange(current: number | null, previous: number | null): number | null {
    if (current === null || previous === null || previous === 0) {
      return null;
    }

    return this.round(((current - previous) / previous) * 100);
  }

  /** Diferencia en puntos porcentuales entre dos porcentajes (se usa para asistencia). */
  private percentagePointsChange(
    current: number | null,
    previous: number | null,
  ): number | null {
    if (current === null || previous === null) {
      return null;
    }

    return this.round(current - previous);
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
