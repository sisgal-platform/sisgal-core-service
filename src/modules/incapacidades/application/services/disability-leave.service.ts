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
import { DisabilityLeave } from 'src/entities/disability_leave.model';
import {
  EMPLOYEE_REPOSITORY_PORT,
  type EmployeeRepositoryPort,
} from 'src/modules/empleados/domain/ports/employee-repository.port';
import { AUDIT_PORT } from 'src/application/ports/audit/audit.port';
import type { AuditPort } from 'src/application/ports/audit/audit.port';
import type { AuthUser } from 'src/application/ports/auth/auth-user';
import { aDate } from 'src/modules/parametros-nomina/domain/vigencia';

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
      Math.round(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1;

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
}
