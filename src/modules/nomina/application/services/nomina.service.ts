import {
  ConflictException,
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
import { LOAN_INSTALLMENT_REVERSAL_MESSAGE } from 'src/modules/liquidaciones/domain/errors/loan-installment-reversal.error';
import type { PayrollLineResponseDto } from 'src/modules/liquidaciones/infraestructure/http/dtos/payroll-line-response.dto';
import { LoanStatus } from 'src/modules/loans/enums/loan-status.enum';
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
import { formatCalendarDate, startOfWeek } from '../../domain/payroll-days';
import {
  type SemesterEarnings,
  calculateSemesterAverageSalary,
  MISSING_HIRE_DATE_CAUSE,
  SERVICE_BONUS_DAYS_PER_YEAR_KEY,
  type ServiceBonus,
  type ServiceBonusSemester,
  calculateServiceBonus,
  findServiceBonusSemesters,
} from '../../domain/service-bonus';
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
import {
  PayrollHoursService,
  type WorkedInterval,
} from './payroll-hours.service';
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

interface PayrollEmployeeResult {
  employee: Employee;
  calculation: PreLiquidationCalculation;
}

interface PayrollEmployeeError {
  employee: Employee;
  causes: string[];
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
  /** Semestres cuya prima de servicios se paga en el período. */
  serviceBonusSemesters: ServiceBonusSemester[];
  /** Días de prima por año; solo se consulta si el período paga prima. */
  serviceBonusDaysPerYear: number | null;
}

interface EmployeeInputs {
  attendanceRecords: AttendanceRecord[];
  /** Marcaciones de la semana anteriores al período: solo cuentan para el límite semanal. */
  previousWeekRecords: AttendanceRecord[];
  disabilityLeaves: DisabilityLeave[];
  loans: EmployeeLoan[];
  payrollPeriods: PayrollPeriod[];
  /** Liquidaciones que se cruzan con los semestres de la prima que se paga. */
  semesterPayrollPeriods: PayrollPeriod[];
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

function toWorkedInterval(record: AttendanceRecord): WorkedInterval {
  return { start: record.check_in, end: record.check_out as Date };
}

// Las liquidaciones sin esta base en su copia de parámetros se cuentan con el
// salario base: no hay forma de saber qué conceptos salariales tuvieron.
function toSemesterEarnings(payrollPeriod: PayrollPeriod): SemesterEarnings[] {
  const snapshot = payrollPeriod.config_snapshot as {
    contributionBase?: unknown;
  } | null;
  const salaryEarnings = Number(snapshot?.contributionBase);

  return snapshot?.contributionBase != null && Number.isFinite(salaryEarnings)
    ? [
        {
          start: aFechaCalendario(payrollPeriod.period_start),
          end: aFechaCalendario(payrollPeriod.period_end),
          salaryEarnings,
        },
      ]
    : [];
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

  /**
   * Con `replacing` calcula cómo quedaría esa liquidación guardada: la ignora
   * al buscar cruces y parte del estado de los préstamos antes de sus descuentos.
   */
  async calculatePreLiquidation(
    employee: Employee,
    periodStart: string,
    periodEnd: string,
    replacing?: PayrollPeriod,
  ): Promise<PreLiquidationCalculation> {
    const [outcome] = await this.calculateEmployees(
      [employee],
      { periodStart, periodEnd },
      replacing,
    );

    if (isEmployeeError(outcome)) {
      throw new UnprocessableEntityException(
        `No es posible calcular la nómina de ${fullName(employee)}: ${outcome.causes.join(' ')}`,
      );
    }

    return outcome.calculation;
  }

  private async calculateEmployees(
    employees: Employee[],
    period: PayrollRange,
    replacing?: PayrollPeriod,
  ): Promise<EmployeeOutcome[]> {
    if (employees.length === 0) {
      return [];
    }

    const context = await this.createCalculationContext(period);
    const employeeIds = employees.map((employee) => employee.id);
    const periodFirstInstant = inicioDelDia(period.periodStart);
    const semesters = context.serviceBonusSemesters;
    const isNotReplaced = (payrollPeriod: PayrollPeriod) =>
      !replacing || payrollPeriod.id !== replacing.id;
    const [
      attendanceRecords,
      disabilityLeaves,
      activeLoans,
      payrollPeriods,
      semesterPayrollPeriods,
    ] = await Promise.all([
      // Se traen desde el lunes: el límite semanal cuenta las horas de la
      // semana aunque hayan empezado antes del período.
      this.payrollInputsRepository.findAttendanceRecords(
        employeeIds,
        inicioDelDia(startOfWeek(period.periodStart)),
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
      semesters.length > 0
        ? this.payrollInputsRepository.findPayrollPeriods(
            employeeIds,
            semesters[0].start,
            semesters[semesters.length - 1].end,
          )
        : Promise.resolve([]),
    ]);
    const loans = await this.restoreReplacedLoans(
      activeLoans,
      replacing,
      period.periodEnd,
    );
    const isInPeriod = (record: AttendanceRecord) =>
      new Date(record.check_in) >= periodFirstInstant;

    return Promise.all(
      employees.map((employee) =>
        this.calculateEmployee(employee, period, context, {
          attendanceRecords: attendanceRecords.filter(
            (record) =>
              record.employee.id === employee.id && isInPeriod(record),
          ),
          previousWeekRecords: attendanceRecords.filter(
            (record) =>
              record.employee.id === employee.id &&
              !isInPeriod(record) &&
              record.check_out !== null,
          ),
          disabilityLeaves: disabilityLeaves.filter(
            (leave) => leave.employee.id === employee.id,
          ),
          // employee_id es bigint: TypeORM lo entrega como texto.
          loans: loans.filter(
            (loan) => Number(loan.employeeId) === employee.id,
          ),
          payrollPeriods: payrollPeriods.filter(
            (payrollPeriod) =>
              payrollPeriod.employee.id === employee.id &&
              isNotReplaced(payrollPeriod),
          ),
          semesterPayrollPeriods: semesterPayrollPeriods.filter(
            (payrollPeriod) =>
              payrollPeriod.employee.id === employee.id &&
              isNotReplaced(payrollPeriod),
          ),
        }),
      ),
    );
  }

  /**
   * Préstamos como estaban antes de la liquidación que se reemplaza. Incluye
   * los que ella saldó, que ya no aparecen entre los activos.
   */
  private async restoreReplacedLoans(
    activeLoans: EmployeeLoan[],
    replacing: PayrollPeriod | undefined,
    periodEnd: string,
  ): Promise<EmployeeLoan[]> {
    const installments = replacing?.loan_installments ?? [];

    if (installments.length === 0) {
      return activeLoans;
    }

    const loanIds = installments.map((installment) => installment.loanId);
    const discountedLoans =
      await this.payrollInputsRepository.findLoansByIds(loanIds);
    const restoredLoans = installments.flatMap((installment) => {
      const loan = discountedLoans.find(
        (item) => item.id === installment.loanId,
      );

      if (
        Number(loan?.outstandingBalance) !== Number(installment.newBalance) ||
        Number(loan?.pendingInstallments) !==
          Number(installment.remainingInstallments)
      ) {
        throw new ConflictException(LOAN_INSTALLMENT_REVERSAL_MESSAGE);
      }

      const discountedLoan = loan as EmployeeLoan;

      return aFechaCalendario(discountedLoan.grantedAt) <= periodEnd
        ? [
            {
              ...discountedLoan,
              outstandingBalance: installment.previousBalance,
              pendingInstallments: installment.previousPendingInstallments,
              status: LoanStatus.ACTIVO,
            },
          ]
        : [];
    });

    return [
      ...activeLoans.filter((loan) => !loanIds.includes(loan.id)),
      ...restoredLoans,
    ];
  }

  /**
   * Los parámetros se toman a la fecha de liquidación (el último día del
   * período). Los servicios de horas, deducciones legales y auxilio se crean
   * para este cálculo sobre repositorios con caché, para consultar cada
   * parámetro una sola vez por cálculo.
   */
  private async createCalculationContext({
    periodStart,
    periodEnd,
  }: PayrollRange): Promise<CalculationContext> {
    const payrollHoursRepository = cachePayrollHoursLookups(
      this.payrollHoursRepository,
    );
    const liquidationDate = aDate(periodEnd);
    const workdayConfig =
      await payrollHoursRepository.findWorkdayConfig(liquidationDate);
    // El valor de la hora sale de la jornada semanal repartida en 6 días: con
    // 42 horas son 7 horas diarias, es decir, salario / 210. El máximo diario
    // solo define desde qué hora del día se paga como extra.
    const dailyWorkHours = Number(workdayConfig?.max_week_hours) / 6;

    if (!Number.isFinite(dailyWorkHours) || dailyWorkHours <= 0) {
      throw new UnprocessableEntityException(
        `No existe una jornada laboral vigente con horas diarias válidas al ${formatCalendarDate(periodEnd)}.`,
      );
    }

    const systemConfigRepository = cacheSystemConfigLookups(
      this.systemConfigRepository,
    );
    const serviceBonusSemesters = findServiceBonusSemesters(
      periodStart,
      periodEnd,
    );
    let serviceBonusDaysPerYear: number | null = null;

    if (serviceBonusSemesters.length > 0) {
      serviceBonusDaysPerYear = await systemConfigRepository.getValue(
        SERVICE_BONUS_DAYS_PER_YEAR_KEY,
        liquidationDate,
      );

      if (
        serviceBonusDaysPerYear === null ||
        !Number.isFinite(serviceBonusDaysPerYear) ||
        serviceBonusDaysPerYear <= 0
      ) {
        throw new UnprocessableEntityException(
          `No existe un valor vigente y válido para los días de prima de servicios por año al ${formatCalendarDate(periodEnd)}.`,
        );
      }
    }

    return {
      liquidationDate,
      dailyWorkHours,
      serviceBonusSemesters,
      serviceBonusDaysPerYear,
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
      inputs.previousWeekRecords,
    );
    const causes = [
      ...(Number.isFinite(salary) && salary > 0 ? [] : [INVALID_SALARY_CAUSE]),
      ...inputs.payrollPeriods.map(
        (payrollPeriod) =>
          `Ya tiene una liquidación registrada del ${formatCalendarDate(aFechaCalendario(payrollPeriod.period_start))} al ${formatCalendarDate(aFechaCalendario(payrollPeriod.period_end))}.`,
      ),
      ...attendance.causes,
      ...(context.serviceBonusSemesters.length > 0 && !employee.hire_date
        ? [MISSING_HIRE_DATE_CAUSE]
        : []),
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
      // La prima no es salario: no cambia la base de salud y pensión ni el
      // límite de las cuotas de préstamos, solo el total devengado.
      const serviceBonuses = this.calculateServiceBonuses(
        employee,
        salary,
        transportAllowance.allowanceAmount,
        context,
        [
          ...inputs.semesterPayrollPeriods.flatMap(toSemesterEarnings),
          {
            start: period.periodStart,
            end: period.periodEnd,
            salaryEarnings: earnings.contributionBase,
          },
        ],
      );
      const allEarnings: PayrollLineResponseDto[] = [
        ...earnings.earnings,
        ...serviceBonuses.map((bonus) => ({
          conceptName: bonus.conceptName,
          amount: bonus.amount,
          serviceBonus: {
            semesterStart: bonus.semesterStart,
            semesterEnd: bonus.semesterEnd,
            workedDays: bonus.workedDays,
            semesterDays: bonus.semesterDays,
            baseAmount: bonus.baseAmount,
            isProportional: bonus.isProportional,
          },
        })),
      ];
      const totals = calculateTotals(allEarnings, deductions);

      return {
        employee,
        calculation: {
          ...totals,
          earnings: allEarnings,
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
            hireDate: employee.hire_date
              ? aFechaCalendario(employee.hire_date)
              : null,
            serviceBonusDaysPerYear: context.serviceBonusDaysPerYear,
            serviceBonuses,
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
   * Prima de cada semestre que se paga en el período. La fecha de ingreso ya
   * se validó al reunir las causas del empleado.
   */
  private calculateServiceBonuses(
    employee: Employee,
    salary: number,
    transportAllowance: number,
    context: CalculationContext,
    liquidatedEarnings: SemesterEarnings[],
  ): ServiceBonus[] {
    if (
      !employee.hire_date ||
      context.serviceBonusDaysPerYear === null ||
      context.serviceBonusSemesters.length === 0
    ) {
      return [];
    }

    const hireDate = aFechaCalendario(employee.hire_date);
    const daysPerYear = context.serviceBonusDaysPerYear;

    return context.serviceBonusSemesters.flatMap((semester) => {
      const bonus = calculateServiceBonus({
        semester,
        hireDate,
        salaryBase: calculateSemesterAverageSalary({
          semester,
          hireDate,
          salaryBase: salary,
          liquidatedEarnings,
        }),
        transportAllowance,
        daysPerYear,
      });
      return bonus ? [bonus] : [];
    });
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
    previousWeekRecords: AttendanceRecord[],
  ): Promise<{ segments: WorkedSegment[]; causes: string[] }> {
    const completeRecords = records.filter((record) => record.check_out);
    const classifications = await payrollHoursService.classifyWorkedIntervals(
      employeeId,
      completeRecords.map(toWorkedInterval),
      previousWeekRecords.map(toWorkedInterval),
    );
    const classificationByRecord = new Map(
      completeRecords.map((record, index) => [record, classifications[index]]),
    );
    const segments: WorkedSegment[] = [];
    const causes: string[] = [];

    for (const record of records) {
      const date = formatCalendarDate(getColombiaDate(record.check_in));
      const classification = classificationByRecord.get(record);

      if (!classification) {
        causes.push(`La marcación del ${date} no tiene hora de salida.`);
      } else if ('error' in classification) {
        causes.push(
          `La marcación del ${date} no se pudo clasificar: ${classification.error.message}`,
        );
      } else {
        segments.push(...classification.segments);
      }
    }

    return { segments, causes };
  }
}
