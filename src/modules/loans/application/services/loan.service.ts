import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Employee, EmployeeLoan } from 'src/entities';
import { aFechaCalendario } from 'src/modules/parametros-nomina/domain/vigencia';
import { LOAN_REPOSITORY_PORT } from '../../domain/ports/loan.repository.port';
import type {
  LoanFilters,
  LoanIndicators,
  LoanRepositoryPort,
} from '../../domain/ports/loan.repository.port';
import { LoanIndicatorsResponseDto } from '../../infrastructure/http/dtos/loan-indicators-response.dto';
import { CreateLoanDto } from '../../infrastructure/http/dtos/create-loan.dto';
import { LoanResponseDto } from '../../infrastructure/http/dtos/loan-response.dto';
import { UpdateLoanDto } from '../../infrastructure/http/dtos/update-loan.dto';
import { LoanPeriodicity } from '../../enums/loan-periodicity.enum';
import { LoanStatus } from '../../enums/loan-status.enum';
import { calculateInstallmentAmount } from '../../domain/loan-installment-amount';
import { hasLoanDiscounts } from '../../domain/loan-discounts';

@Injectable()
export class LoanService {
  constructor(
    @Inject(LOAN_REPOSITORY_PORT)
    private readonly loanRepository: LoanRepositoryPort,
  ) {}

  async crear(dto: CreateLoanDto): Promise<LoanResponseDto> {
    const employee = await this.findEmployee(dto.employeeId);
    const installmentAmount = this.calculateInstallment(
      dto.totalAmount,
      dto.totalInstallments,
    );

    const loan = new EmployeeLoan();
    loan.employee = employee;
    loan.employeeId = employee.id;
    loan.totalAmount = dto.totalAmount;
    loan.installmentAmount = installmentAmount;
    loan.totalInstallments = dto.totalInstallments;
    loan.pendingInstallments = dto.totalInstallments;
    loan.outstandingBalance = dto.totalAmount;
    loan.grantedAt = new Date(`${dto.grantedAt}T00:00:00.000Z`);
    loan.periodicity = dto.periodicity ?? LoanPeriodicity.MENSUAL;
    loan.status = LoanStatus.ACTIVO;

    const savedLoan = await this.loanRepository.save(loan);
    return LoanResponseDto.fromEntity(savedLoan);
  }

  /**
   * Antes del primer descuento se puede corregir todo y el préstamo vuelve a
   * calcular su cuota y su saldo. Después solo se puede cambiar la periodicidad,
   * porque las liquidaciones ya guardaron el saldo sobre el que descontaron.
   */
  async actualizar(
    loanId: number,
    dto: UpdateLoanDto,
  ): Promise<LoanResponseDto> {
    const loan = await this.findLoan(loanId);
    const employeeId = dto.employeeId ?? Number(loan.employeeId);
    const totalAmount = dto.totalAmount ?? Number(loan.totalAmount);
    const totalInstallments =
      dto.totalInstallments ?? Number(loan.totalInstallments);
    const grantedAt = dto.grantedAt ?? aFechaCalendario(loan.grantedAt);
    const changesTerms =
      employeeId !== Number(loan.employeeId) ||
      totalAmount !== Number(loan.totalAmount) ||
      totalInstallments !== Number(loan.totalInstallments) ||
      grantedAt !== aFechaCalendario(loan.grantedAt);

    if (changesTerms) {
      if (hasLoanDiscounts(loan)) {
        throw new ConflictException(
          'El préstamo ya tiene cuotas descontadas: solo se puede cambiar su periodicidad. Para corregir los demás datos, elimina primero las liquidaciones que lo descontaron.',
        );
      }

      loan.employee = await this.findEmployee(employeeId);
      loan.employeeId = employeeId;
      loan.totalAmount = totalAmount;
      loan.installmentAmount = this.calculateInstallment(
        totalAmount,
        totalInstallments,
      );
      loan.totalInstallments = totalInstallments;
      loan.pendingInstallments = totalInstallments;
      loan.outstandingBalance = totalAmount;
      loan.grantedAt = new Date(`${grantedAt}T00:00:00.000Z`);
    }

    loan.periodicity = dto.periodicity ?? loan.periodicity;

    const savedLoan = await this.loanRepository.save(loan);
    return LoanResponseDto.fromEntity(savedLoan);
  }

  /** Un préstamo descontado en una liquidación conserva esa trazabilidad. */
  async eliminar(loanId: number): Promise<void> {
    await this.findLoan(loanId);

    if ((await this.loanRepository.countInstallments(loanId)) > 0) {
      throw new ConflictException(
        'El préstamo tiene cuotas descontadas en liquidaciones. Para eliminarlo, elimina primero esas liquidaciones.',
      );
    }

    await this.loanRepository.delete(loanId);
  }

  async obtenerTodos(filters: LoanFilters): Promise<LoanResponseDto[]> {
    if (
      filters.fechaDesde &&
      filters.fechaHasta &&
      filters.fechaDesde > filters.fechaHasta
    ) {
      throw new BadRequestException(
        'La fechaDesde no puede ser posterior a fechaHasta.',
      );
    }

    const loans = await this.loanRepository.findAll(filters);
    return loans.map((loan) => LoanResponseDto.fromEntity(loan));
  }

  async obtenerPorId(loanId: number): Promise<LoanResponseDto> {
    return LoanResponseDto.fromEntity(await this.findLoan(loanId));
  }

  async obtenerIndicadores(): Promise<LoanIndicatorsResponseDto> {
    const indicators: LoanIndicators =
      await this.loanRepository.getIndicators();
    const response = new LoanIndicatorsResponseDto();
    response.cantidadPrestamosActivos = indicators.cantidadPrestamosActivos;
    response.montoTotalPrestamosActivos = indicators.montoTotalPrestamosActivos;
    return response;
  }

  private async findLoan(loanId: number): Promise<EmployeeLoan> {
    const loan = await this.loanRepository.findById(loanId);
    if (!loan) {
      throw new NotFoundException(
        `No se encontró el préstamo con identificador ${loanId}.`,
      );
    }

    return loan;
  }

  private async findEmployee(employeeId: number): Promise<Employee> {
    const employee = await this.loanRepository.findEmployeeById(employeeId);
    if (!employee) {
      throw new NotFoundException(
        `No se encontró el empleado con identificador ${employeeId}.`,
      );
    }

    return employee;
  }

  private calculateInstallment(
    totalAmount: number,
    totalInstallments: number,
  ): number {
    const installmentAmount = calculateInstallmentAmount(
      totalAmount,
      totalInstallments,
    );
    if (installmentAmount < 1) {
      throw new BadRequestException(
        'El valor de cada cuota debe ser de al menos un peso.',
      );
    }

    return installmentAmount;
  }
}
