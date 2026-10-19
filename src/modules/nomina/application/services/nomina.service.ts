import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  AttendanceRecord,
  DisabilityLeave,
  Employee,
  EmployeeLoan,
  PayrollPeriod,
} from 'src/entities';
import type { PayrollLineResponseDto } from 'src/modules/liquidaciones/infraestructure/http/dtos/payroll-line-response.dto';
import {
  inicioDelDia,
  inicioDelDiaSiguiente,
} from 'src/modules/asistencia/domain/business-day';
import {
  aDate,
  aFechaCalendario,
} from 'src/modules/parametros-nomina/domain/vigencia';
import { getColombiaDate } from 'src/shared/common/utils/colombia-date.util';
import { PayrollInconsistencyError } from '../../domain/errors/payroll-inconsistency.error';
import { PAYROLL_CONCEPT } from '../../domain/payroll-concepts';
import {
  INVALID_SALARY_CAUSE,
  type WorkedHoursSummary,
  type WorkedSegment,
  calculateEarnings,
  calculateTotals,
  roundCurrency,
} from '../../domain/payroll-calculation';
import {
  MAX_LOAN_DEDUCTION_RATE,
  type LoanInput,
  type LoanInstallmentPlan,
  type LoanObservation,
  planLoanInstallments,
} from '../../domain/loan-installments';
import { formatCalendarDate } from '../../domain/payroll-days';
import {
  PAYROLL_HOURS_REPOSITORY_PORT,
  type PayrollHoursRepositoryPort,
} from '../../domain/ports/payroll-hours.repository.port';
import {
  PAYROLL_INPUTS_REPOSITORY_PORT,
  type PayrollInputsRepositoryPort,
} from '../../domain/ports/payroll-inputs.repository.port';
import {
  SYSTEM_CONFIG_REPOSITORY_PORT,
  type SystemConfigRepositoryPort,
} from '../../domain/ports/system-config-repository.port';
import { LegalDeductionsService } from './legal-deductions.service';
import {
  cachePayrollHoursLookups,
  cacheSystemConfigLookups,
} from './payroll-lookup-cache';
import { PayrollHoursService } from './payroll-hours.service';
import { TransportAllowanceService } from './transport-allowance.service';

export interface PreLiquidationCalculation {
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
  earnings: PayrollLineResponseDto[];
  deductions: PayrollLineResponseDto[];
  /** Horas trabajadas en el período por tipo de hora, incluidas las ordinarias. */
  workedHours: WorkedHoursSummary[];
  /** Cuotas de préstamos descontadas y su efecto sobre cada préstamo. */
  loanInstallments: LoanInstallmentPlan[];
  /** Cuotas que no se descontaron, o se descontaron en parte, y por qué. */
  loanObservations: LoanObservation[];
  /** Parámetros usados en el cálculo, para conservarlos junto a la liquidación. */
  configSnapshot: Record<string, unknown>;
}

export interface PayrollEmployeeResult {
  employee: Employee;
  calculation: PreLiquidationCalculation;
}

export interface PayrollEmployeeError {
  employee: Employee;
  causes: string[];
}

export type PayrollCalculationStatus = 'COMPLETADO' | 'CON_ERRORES';

export interface PayrollCalculationResult {
  periodStart: string;
  periodEnd: string;
  status: PayrollCalculationStatus;
  results: PayrollEmployeeResult[];
  errors: PayrollEmployeeError[];
}

interface PayrollRange {
  periodStart: string;
  periodEnd: string;
}

interface CalculationContext {
  liquidationDate: Date;
  dailyWorkHours: number;
  payrollHoursService: PayrollHoursService;
  legalDeductionsService: LegalDeductionsService;
  transportAllowanceService: TransportAllowanceService;
}

interface EmployeeInputs {
  attendanceRecords: AttendanceRecord[];
  disabilityLeaves: DisabilityLeave[];
  loans: EmployeeLoan[];
  payrollPeriods: PayrollPeriod[];
}

type EmployeeOutcome = PayrollEmployeeResult | PayrollEmployeeError;

function isEmployeeError(
  outcome: EmployeeOutcome,
): outcome is PayrollEmployeeError {
  return 'causes' in outcome;
}

function fullName(employee: Employee): string {
  return `${employee.firstName} ${employee.lastName}`;
}

// TypeORM entrega las columnas numeric y bigint como texto.
function toLoanInput(loan: EmployeeLoan): LoanInput {
  return {
    loanId: loan.id,
    employeeId: loan.employeeId == null ? null : Number(loan.employeeId),
    totalAmount: Number(loan.totalAmount),
    installmentAmount: Number(loan.installmentAmount),
    totalInstallments: Number(loan.totalInstallments),
    pendingInstallments: Number(loan.pendingInstallments),
    outstandingBalance: Number(loan.outstandingBalance),
    grantedAt: aFechaCalendario(loan.grantedAt),
    periodicity: loan.periodicity,
  };
}

@Injectable()
export class NominaService {
  constructor(
    @Inject(SYSTEM_CONFIG_REPOSITORY_PORT)
    private readonly systemConfigRepository: SystemConfigRepositoryPort,
    @Inject(PAYROLL_HOURS_REPOSITORY_PORT)
    private readonly payrollHoursRepository: PayrollHoursRepositoryPort,
    @Inject(PAYROLL_INPUTS_REPOSITORY_PORT)
    private readonly payrollInputsRepository: PayrollInputsRepositoryPort,
  ) {}

  async calculatePreLiquidation(
    employee: Employee,
    periodStart: string,
    periodEnd: string,
  ): Promise<PreLiquidationCalculation> {
    const [outcome] = await this.calculateEmployees([employee], {
      periodStart,
      periodEnd,
    });

    if (isEmployeeError(outcome)) {
      throw new UnprocessableEntityException(
        `No es posible calcular la nómina de ${fullName(employee)}: ${outcome.causes.join(' ')}`,
      );
    }

    return outcome.calculation;
  }

  /**
   * Calcula la nómina del período para todos los empleados activos, sin
   * guardarla. Los empleados con información faltante o inconsistente quedan
   * en `errors` con sus causas, nunca con un resultado parcial.
   */
  async calculatePayroll(
    periodStart: string,
    periodEnd: string,
  ): Promise<PayrollCalculationResult> {
    if (periodStart > periodEnd) {
      throw new BadRequestException(
        'El período inicial no puede ser posterior al período final.',
      );
    }

    const employees = await this.payrollInputsRepository.findActiveEmployees();
    const outcomes = await this.calculateEmployees(employees, {
      periodStart,
      periodEnd,
    });
    const errors = outcomes.filter(isEmployeeError);

    return {
      periodStart,
      periodEnd,
      status: errors.length > 0 ? 'CON_ERRORES' : 'COMPLETADO',
      results: outcomes.filter(
        (outcome): outcome is PayrollEmployeeResult =>
          !isEmployeeError(outcome),
      ),
      errors,
    };
  }

  private async calculateEmployees(
    employees: Employee[],
    period: PayrollRange,
  ): Promise<EmployeeOutcome[]> {
    if (employees.length === 0) {
      return [];
    }

    const context = await this.createCalculationContext(period.periodEnd);
    const employeeIds = employees.map((employee) => employee.id);
    const [attendanceRecords, disabilityLeaves, loans, payrollPeriods] =
      await Promise.all([
        this.payrollInputsRepository.findAttendanceRecords(
          employeeIds,
          inicioDelDia(period.periodStart),
          inicioDelDiaSiguiente(period.periodEnd),
        ),
        this.payrollInputsRepository.findDisabilityLeaves(
          employeeIds,
          period.periodStart,
          period.periodEnd,
        ),
        this.payrollInputsRepository.findActiveLoans(
          employeeIds,
          period.periodEnd,
        ),
        this.payrollInputsRepository.findPayrollPeriods(
          employeeIds,
          period.periodStart,
          period.periodEnd,
        ),
      ]);

    return Promise.all(
      employees.map((employee) =>
        this.calculateEmployee(employee, period, context, {
          attendanceRecords: attendanceRecords.filter(
            (record) => record.employee.id === employee.id,
          ),
          disabilityLeaves: disabilityLeaves.filter(
            (leave) => leave.employee.id === employee.id,
          ),
          // employee_id es bigint: TypeORM lo entrega como texto.
          loans: loans.filter(
            (loan) => Number(loan.employeeId) === employee.id,
          ),
          payrollPeriods: payrollPeriods.filter(
            (payrollPeriod) => payrollPeriod.employee.id === employee.id,
          ),
        }),
      ),
    );
  }

  /**
   * Los parámetros se toman a la fecha de liquidación (el último día del
   * período). Los servicios de horas, deducciones legales y auxilio se crean
   * para este cálculo sobre repositorios con caché, para consultar cada
   * parámetro una sola vez en todo el lote y no una vez por empleado.
   */
  private async createCalculationContext(
    periodEnd: string,
  ): Promise<CalculationContext> {
    const payrollHoursRepository = cachePayrollHoursLookups(
      this.payrollHoursRepository,
    );
    const liquidationDate = aDate(periodEnd);
    const workdayConfig =
      await payrollHoursRepository.findWorkdayConfig(liquidationDate);
    const dailyWorkHours = Number(workdayConfig?.max_day_hours);

    if (!Number.isFinite(dailyWorkHours) || dailyWorkHours <= 0) {
      throw new UnprocessableEntityException(
        `No existe una jornada laboral vigente con horas diarias válidas al ${formatCalendarDate(periodEnd)}.`,
      );
    }

    const systemConfigRepository = cacheSystemConfigLookups(
      this.systemConfigRepository,
    );

    return {
      liquidationDate,
      dailyWorkHours,
      payrollHoursService: new PayrollHoursService(payrollHoursRepository),
      legalDeductionsService: new LegalDeductionsService(
        systemConfigRepository,
      ),
      transportAllowanceService: new TransportAllowanceService(
        systemConfigRepository,
      ),
    };
  }

  private async calculateEmployee(
    employee: Employee,
    period: PayrollRange,
    context: CalculationContext,
    inputs: EmployeeInputs,
  ): Promise<EmployeeOutcome> {
    const salary = Number(employee.salary_base);
    const attendance = await this.classifyAttendance(
      context.payrollHoursService,
      employee.id,
      inputs.attendanceRecords,
    );
    const causes = [
      ...(Number.isFinite(salary) && salary > 0 ? [] : [INVALID_SALARY_CAUSE]),
      ...inputs.payrollPeriods.map(
        (payrollPeriod) =>
          `Ya tiene una liquidación registrada del ${formatCalendarDate(aFechaCalendario(payrollPeriod.period_start))} al ${formatCalendarDate(aFechaCalendario(payrollPeriod.period_end))}.`,
      ),
      ...attendance.causes,
    ];

    if (causes.length > 0) {
      return { employee, causes };
    }

    try {
      const transportAllowance =
        await context.transportAllowanceService.calculate(
          salary,
          context.liquidationDate,
        );
      const earnings = calculateEarnings({
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        monthlySalary: salary,
        dailyWorkHours: context.dailyWorkHours,
        minimumWage: transportAllowance.minimumWage,
        transportAllowance: {
          isEligible: transportAllowance.isEligible,
          monthlyAmount: transportAllowance.configuredAllowance,
        },
        workedSegments: attendance.segments,
        disabilityLeaves: inputs.disabilityLeaves.map((leave) => ({
          type: leave.type,
          startDate: aFechaCalendario(leave.start_date),
          endDate: aFechaCalendario(leave.end_date),
        })),
      });
      const legalDeductions = await context.legalDeductionsService.calculate(
        earnings.contributionBase,
        context.liquidationDate,
      );
      const maxLoanDeductions = roundCurrency(
        MAX_LOAN_DEDUCTION_RATE *
          (earnings.contributionBase -
            legalDeductions.healthDeduction -
            legalDeductions.pensionDeduction),
      );
      const loanPlan = planLoanInstallments({
        loans: inputs.loans.map(toLoanInput),
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        maxAmount: maxLoanDeductions,
      });
      const deductions: PayrollLineResponseDto[] = [
        {
          conceptName: PAYROLL_CONCEPT.HEALTH,
          amount: legalDeductions.healthDeduction,
        },
        {
          conceptName: PAYROLL_CONCEPT.PENSION,
          amount: legalDeductions.pensionDeduction,
        },
        ...loanPlan.installments.map((installment) => ({
          conceptName: installment.conceptName,
          amount: installment.amount,
          loan: {
            loanId: installment.loanId,
            installments: installment.installments,
            scheduledAmount: installment.scheduledAmount,
            outstandingBalance: installment.newBalance,
            pendingInstallments: installment.remainingInstallments,
          },
        })),
      ];
      const totals = calculateTotals(earnings.earnings, deductions);

      return {
        employee,
        calculation: {
          ...totals,
          earnings: earnings.earnings,
          deductions,
          workedHours: earnings.workedHours,
          loanInstallments: loanPlan.installments,
          loanObservations: loanPlan.observations,
          configSnapshot: {
            liquidationDate: period.periodEnd,
            salaryBase: salary,
            dailyWorkHours: context.dailyWorkHours,
            hourValue: roundCurrency(earnings.hourValue),
            periodDays: earnings.periodDays,
            disabilityDays: earnings.disabilityDays,
            workedDays: earnings.workedDays,
            minimumWage: transportAllowance.minimumWage,
            transportAllowance: transportAllowance.configuredAllowance,
            transportAllowanceEligible: transportAllowance.isEligible,
            contributionBase: earnings.contributionBase,
            healthRate: legalDeductions.healthRate,
            pensionRate: legalDeductions.pensionRate,
            maxLoanDeductions,
            loanObservations: loanPlan.observations.map(
              (observation) => observation.message,
            ),
            workedHours: earnings.workedHours,
          },
        },
      };
    } catch (error) {
      if (error instanceof PayrollInconsistencyError) {
        return { employee, causes: error.causes };
      }

      throw error;
    }
  }

  /**
   * Clasifica cada marcación completa en tipos de hora. Una marcación sin
   * salida o que no se puede clasificar es una causa a corregir, no un error
   * de todo el cálculo.
   */
  private async classifyAttendance(
    payrollHoursService: PayrollHoursService,
    employeeId: number,
    records: AttendanceRecord[],
  ): Promise<{ segments: WorkedSegment[]; causes: string[] }> {
    const classified = await Promise.all(
      records.map(async (record) => {
        const date = formatCalendarDate(getColombiaDate(record.check_in));

        if (!record.check_out) {
          return {
            segments: [],
            cause: `La marcación del ${date} no tiene hora de salida.`,
          };
        }

        try {
          return {
            segments: await payrollHoursService.classifyWorkedInterval(
              employeeId,
              record.check_in,
              record.check_out,
            ),
            cause: null,
          };
        } catch (error) {
          if (!(error instanceof HttpException)) {
            throw error;
          }

          return {
            segments: [],
            cause: `La marcación del ${date} no se pudo clasificar: ${error.message}`,
          };
        }
      }),
    );

    return {
      segments: classified.flatMap((item) => item.segments),
      causes: classified.flatMap((item) => (item.cause ? [item.cause] : [])),
    };
  }
}
