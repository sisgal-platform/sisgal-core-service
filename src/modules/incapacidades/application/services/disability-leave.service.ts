import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as disabilityLeaveRepositoryPort from '../../domain/ports/disability-leave-repository.port';
import { RegisterDisabilityLeaveDto } from '../../infraestructure/http/dtos/register-disability-leave.dto';
import { ListDisabilityLeaveQueryDto } from '../../infraestructure/http/dtos/list-disability-leave-query.dto';
import { UpdateDisabilityLeaveDto } from '../../infraestructure/http/dtos/update-disability-leave.dto';
import { DisabilityType } from '../../domain/value-objects/disability-type.enum';
import { DisabilityLeave } from 'src/entities/disability_leave.model';
import {
  EMPLOYEE_REPOSITORY_PORT,
  type EmployeeRepositoryPort,
} from 'src/modules/empleados/domain/ports/employee-repository.port';
import { AUDIT_PORT } from 'src/application/ports/audit/audit.port';
import type { AuditPort } from 'src/application/ports/audit/audit.port';
import type { AuthUser } from 'src/application/ports/auth/auth-user';
import { formatCalendarDate } from 'src/modules/nomina/domain/payroll-days';
import {
  aDate,
  aFechaCalendario,
} from 'src/modules/parametros-nomina/domain/vigencia';

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

@Injectable()
export class DisabilityLeaveService {
  constructor(
    @Inject(disabilityLeaveRepositoryPort.DISABILITY_LEAVE_REPOSITORY_PORT)
    private readonly disabilityLeaveRepository: disabilityLeaveRepositoryPort.DisabilityLeaveRepositoryPort,

    @Inject(EMPLOYEE_REPOSITORY_PORT)
    private readonly employeeRepository: EmployeeRepositoryPort,

    @Inject(AUDIT_PORT)
    private readonly auditPort: AuditPort,
  ) {}

  async register(
    dto: RegisterDisabilityLeaveDto,
    actor: AuthUser,
  ): Promise<DisabilityLeave> {
    // Solo se permite registrar incapacidades a empleados activos
    const employee = await this.employeeRepository.findById(dto.employeeId);
    if (!employee) {
      throw new NotFoundException(
        `No se encontró un empleado con el identificador ${dto.employeeId}.`,
      );
    }
    if (employee.status !== 'ACTIVO') {
      throw new BadRequestException(
        `El empleado con identificador ${dto.employeeId} no está activo.`,
      );
    }

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate < startDate) {
      throw new BadRequestException(
        'La fecha de finalización debe ser igual o posterior a la fecha de inicio.',
      );
    }

    // No se permiten períodos que se crucen con uno ya registrado del mismo empleado
    const solapados = await this.disabilityLeaveRepository.findOverlapping(
      dto.employeeId,
      dto.startDate,
      dto.endDate,
    );
    if (solapados.length > 0) {
      throw new ConflictException(
        'Ya existe un registro para parte del período seleccionado.',
      );
    }

    // Cantidad de días del período, contando ambos extremos
    const totalDays =
      Math.round((endDate.getTime() - startDate.getTime()) / MILLISECONDS_PER_DAY) + 1;

    const disabilityLeave = new DisabilityLeave();
    disabilityLeave.employee = employee;
    disabilityLeave.type = dto.type;
    disabilityLeave.other_type_description = dto.otherTypeDescription ?? null;
    disabilityLeave.start_date = aDate(dto.startDate.slice(0, 10));
    disabilityLeave.end_date = aDate(dto.endDate.slice(0, 10));
    disabilityLeave.total_days = totalDays;
    // La repartición entre empresa y EPS la calculará la integración con nómina
    disabilityLeave.employee_days = 0;
    disabilityLeave.eps_days = 0;

    try {
      const registroCreado = await this.disabilityLeaveRepository.save(
        disabilityLeave,
      );

      this.auditPort.log({
        action: 'DISABILITY_LEAVE_REGISTERED',
        module: 'Incapacidades',
        resource: 'DisabilityLeave',
        resourceId: registroCreado.id,
        result: 'SUCCESS',
        message: `Se registró una incapacidad para el empleado "${employee.firstName} ${employee.lastName}".`,
        metadata: { employeeId: dto.employeeId, performedBy: actor.id },
      });

      return registroCreado;
    } catch (error) {
      this.auditPort.log({
        action: 'DISABILITY_LEAVE_REGISTER_FAILED',
        module: 'Incapacidades',
        resource: 'DisabilityLeave',
        result: 'FAILED',
        message: 'Falló el registro de una incapacidad.',
        metadata: {
          employeeId: dto.employeeId,
          performedBy: actor.id,
          error: error instanceof Error ? error.message : String(error),
        },
      });

      throw error;
    }
  }

  /**
   * El empleado no cambia: si se registró a otra persona, se elimina y se
   * vuelve a registrar. Los días y el tipo afectan la nómina, así que no se
   * cambian mientras una liquidación guardada incluya las fechas anteriores o
   * las nuevas.
   */
  async update(
    id: number,
    dto: UpdateDisabilityLeaveDto,
    actor: AuthUser,
  ): Promise<DisabilityLeave> {
    const current = await this.findExisting(id);
    const employeeId = current.employee.id;
    const currentStart = aFechaCalendario(current.start_date);
    const currentEnd = aFechaCalendario(current.end_date);
    const startDate = dto.startDate?.slice(0, 10) ?? currentStart;
    const endDate = dto.endDate?.slice(0, 10) ?? currentEnd;
    const type = dto.type ?? current.type;

    if (endDate < startDate) {
      throw new BadRequestException(
        'La fecha de finalización debe ser igual o posterior a la fecha de inicio.',
      );
    }

    const description =
      String(type) === String(DisabilityType.OTROS)
        ? (dto.otherTypeDescription ?? current.other_type_description)?.trim()
        : null;
    if (String(type) === String(DisabilityType.OTROS) && !description) {
      throw new BadRequestException(
        'Describe el tipo de incapacidad o licencia.',
      );
    }

    const solapados = await this.disabilityLeaveRepository.findOverlapping(
      employeeId,
      startDate,
      endDate,
      id,
    );
    if (solapados.length > 0) {
      throw new ConflictException(
        'Ya existe un registro para parte del período seleccionado.',
      );
    }

    if (
      startDate !== currentStart ||
      endDate !== currentEnd ||
      type !== current.type
    ) {
      await this.assertNoSavedPayroll(employeeId, currentStart, currentEnd);
      await this.assertNoSavedPayroll(employeeId, startDate, endDate);
    }

    current.type = type;
    current.other_type_description = description ?? null;
    current.start_date = aDate(startDate);
    current.end_date = aDate(endDate);
    current.total_days =
      Math.round(
        (Date.parse(endDate) - Date.parse(startDate)) / MILLISECONDS_PER_DAY,
      ) + 1;

    const updated = await this.disabilityLeaveRepository.save(current);

    this.auditPort.log({
      action: 'DISABILITY_LEAVE_UPDATED',
      module: 'Incapacidades',
      resource: 'DisabilityLeave',
      resourceId: id,
      result: 'SUCCESS',
      message: `Se actualizó una incapacidad del empleado "${current.employee.firstName} ${current.employee.lastName}".`,
      metadata: {
        employeeId,
        performedBy: actor.id,
        previous: { startDate: currentStart, endDate: currentEnd },
        current: { startDate, endDate, type },
      },
    });

    return updated;
  }

  async delete(id: number, actor: AuthUser): Promise<void> {
    const current = await this.findExisting(id);
    const employeeId = current.employee.id;
    const startDate = aFechaCalendario(current.start_date);
    const endDate = aFechaCalendario(current.end_date);

    await this.assertNoSavedPayroll(employeeId, startDate, endDate);
    await this.disabilityLeaveRepository.delete(id);

    this.auditPort.log({
      action: 'DISABILITY_LEAVE_DELETED',
      module: 'Incapacidades',
      resource: 'DisabilityLeave',
      resourceId: id,
      result: 'SUCCESS',
      message: `Se eliminó una incapacidad del empleado "${current.employee.firstName} ${current.employee.lastName}".`,
      metadata: {
        employeeId,
        performedBy: actor.id,
        previous: { startDate, endDate, type: current.type },
      },
    });
  }

  // Búsqueda por empleado, nombre, cargo, estado y/o rango de fechas; todos los filtros son opcionales y se combinan con AND
  async findAll(query: ListDisabilityLeaveQueryDto): Promise<DisabilityLeave[]> {
    if (
      query.startDate &&
      query.endDate &&
      query.startDate > query.endDate
    ) {
      throw new BadRequestException(
        'La fecha inicial no puede ser posterior a la fecha final.',
      );
    }

    return this.disabilityLeaveRepository.findAll(query);
  }

  private async findExisting(id: number): Promise<DisabilityLeave> {
    const disabilityLeave = await this.disabilityLeaveRepository.findById(id);
    if (!disabilityLeave) {
      throw new NotFoundException(
        `No se encontró una incapacidad con el identificador ${id}.`,
      );
    }

    return disabilityLeave;
  }

  // La liquidación guardó los días de incapacidad con los que se calculó
  private async assertNoSavedPayroll(
    employeeId: number,
    startDate: string,
    endDate: string,
  ): Promise<void> {
    const [payrollPeriod] =
      await this.disabilityLeaveRepository.findOverlappingPayrollPeriods(
        employeeId,
        startDate,
        endDate,
      );

    if (payrollPeriod) {
      throw new ConflictException(
        `La liquidación del ${formatCalendarDate(aFechaCalendario(payrollPeriod.period_start))} al ${formatCalendarDate(aFechaCalendario(payrollPeriod.period_end))} incluye estas fechas. Para cambiar la incapacidad, elimina primero esa liquidación.`,
      );
    }
  }
}
