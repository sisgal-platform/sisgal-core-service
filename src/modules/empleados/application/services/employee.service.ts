import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as employeeRepositoryPort from '../../domain/ports/employee-repository.port';
import { RegisterEmployeeDto } from '../../infraestructure/http/dtos/register-employee.dto';
import { ListEmployeesQueryDto } from '../../infraestructure/http/dtos/list-employees-query.dto';
import { UpdateEmployeeDto } from '../../infraestructure/http/dtos/update-employee.dto';
import { EmployeeResponseDto } from '../../infraestructure/http/dtos/employee-response.dto';
import { Employee } from 'src/entities/employee.model';
import { DocumentId } from '../../domain/value-objects/document-id.vo';
import { Salary } from '../../domain/value-objects/salary.vo';
import { HireDate } from '../../domain/value-objects/hire-date.vo';
import { getColombiaDate } from 'src/shared/common/utils/colombia-date.util';
import { DuplicateDocumentError } from '../../domain/errors/employee.errors';
import {
  BRANCH_REPOSITORY_PORT,
  type BranchRepositoryPort,
} from 'src/modules/sucursales/domain/ports/branch.repository.port';
import {
  POSITION_REPOSITORY_PORT,
  type PositionRepositoryPort,
} from '../../domain/ports/position.repository.port';
import { EmployeeBranchAssignment } from 'src/entities/employee-branch-assignment.model';
import { WorkdayConfig } from 'src/entities/workday-config.model';
import {
  WORKDAY_CONFIG_REPOSITORY_PORT,
  type WorkdayConfigRepositoryPort,
} from 'src/modules/parametros-nomina/domain/ports/workday-config.repository.port';
import { AUDIT_PORT } from 'src/application/ports/audit/audit.port';
import type { AuditPort } from 'src/application/ports/audit/audit.port';
import type { AuthUser } from 'src/application/ports/auth/auth-user';

@Injectable()
export class EmployeeService {
  constructor(
    @Inject(employeeRepositoryPort.EMPLOYEE_REPOSITORY_PORT)
    private readonly employeeRepository: employeeRepositoryPort.EmployeeRepositoryPort,

    @Inject(BRANCH_REPOSITORY_PORT)
    private readonly branchRepository: BranchRepositoryPort,

    @Inject(POSITION_REPOSITORY_PORT)
    private readonly positionRepository: PositionRepositoryPort,

    @Inject(WORKDAY_CONFIG_REPOSITORY_PORT)
    private readonly workdayConfigRepository: WorkdayConfigRepositoryPort,

    @Inject(AUDIT_PORT)
    private readonly auditPort: AuditPort,
  ) {}

  // Solo se puede asignar la jornada vigente hoy: las históricas o programadas se rechazan
  private async obtenerJornadaAsignable(
    workdayConfigId: number,
  ): Promise<WorkdayConfig> {
    const vigente = await this.workdayConfigRepository.findVigente(
      getColombiaDate(new Date()),
    );
    if (!vigente || vigente.id !== workdayConfigId) {
      throw new BadRequestException(
        `La jornada laboral con identificador ${workdayConfigId} no existe o no está vigente.`,
      );
    }
    return vigente;
  }

  async register(dto: RegisterEmployeeDto, actor: AuthUser): Promise<Employee> {
    // Los value objects validan tipo/número de documento y salario (lanzan error de dominio si son inválidos)
    const document = DocumentId.create(dto.documentType, dto.documentNumber);
    const salary = Salary.create(dto.salaryBase);
    const hireDate =
      dto.hireDate === undefined
        ? null
        : HireDate.create(dto.hireDate, getColombiaDate(new Date()));

    // No se permite registrar dos empleados con el mismo documento
    const existing = await this.employeeRepository.findByDocument(
      document.getNumber(),
    );
    if (existing !== null) {
      throw new DuplicateDocumentError(document.getNumber());
    }

    // La sede es obligatoria: debe existir y estar activa
    const branch = await this.branchRepository.findById(dto.branchId);
    if (!branch) {
      throw new NotFoundException(
        `No se encontró una sucursal con el identificador ${dto.branchId}.`,
      );
    }
    if (!branch.is_active) {
      throw new BadRequestException(
        `La sucursal con identificador ${dto.branchId} está inactiva.`,
      );
    }

    // El cargo es obligatorio: debe existir y estar activo
    const jobPosition = await this.positionRepository.findById(
      dto.positionId,
    );
    if (!jobPosition) {
      throw new NotFoundException(
        `No se encontró un cargo con el identificador ${dto.positionId}.`,
      );
    }
    if (!jobPosition.is_active) {
      throw new BadRequestException(
        `El cargo con identificador ${dto.positionId} está inactivo.`,
      );
    }

    // La jornada es opcional: si no se indica, se asigna la vigente (si hay una)
    const workdayConfig =
      dto.workdayConfigId !== undefined
        ? await this.obtenerJornadaAsignable(dto.workdayConfigId)
        : await this.workdayConfigRepository.findVigente(
            getColombiaDate(new Date()),
          );

    // Asignación inicial de sede: vigente (is_current) y sin fecha de fin (end_date null)
    const assignment = new EmployeeBranchAssignment();
    assignment.branch = branch;
    assignment.start_date = new Date();
    assignment.end_date = null;
    assignment.is_current = true;

    const employee = new Employee();
    employee.firstName = dto.firstName;
    employee.lastName = dto.lastName;
    employee.document = document.getNumber();
    employee.document_type = document.getType();
    employee.phone = dto.phone;
    employee.salary_base = salary.getvalue();
    employee.hire_date = hireDate?.getValue() ?? null;
    // "position" queda como copia histórica del nombre; "jobPosition" es el vínculo vivo al catálogo
    employee.position = jobPosition.name;
    employee.jobPosition = jobPosition;
    employee.workdayConfig = workdayConfig;
    employee.status = 'ACTIVO';
    // El cascade de la entidad guarda empleado y asignación en una sola transacción
    employee.employee_branch_assig = [assignment];

    // Se audita el resultado del guardado, indicando quién realizó el registro
    try {
      const empleadoCreado = await this.employeeRepository.save(employee);

      this.auditPort.log({
        action: 'EMPLOYEE_CREATED',
        module: 'Empleados',
        resource: 'Employee',
        resourceId: empleadoCreado.id,
        result: 'SUCCESS',
        message: `Se registró el empleado "${empleadoCreado.firstName} ${empleadoCreado.lastName}".`,
        metadata: {
          branchId: branch.id,
          positionId: jobPosition.id,
          performedBy: actor.id,
        },
      });

      return empleadoCreado;
    } catch (error) {
      this.auditPort.log({
        action: 'EMPLOYEE_CREATE_FAILED',
        module: 'Empleados',
        resource: 'Employee',
        result: 'FAILED',
        message: 'Falló el registro de un empleado.',
        metadata: {
          branchId: dto.branchId,
          positionId: dto.positionId,
          performedBy: actor.id,
          error: error instanceof Error ? error.message : String(error),
        },
      });

      throw error;
    }
  }

  // Búsqueda y filtros son opcionales y se combinan con AND
  async findAll(query: ListEmployeesQueryDto): Promise<EmployeeResponseDto[]> {
    const employees = await this.employeeRepository.findAll(query);
    return employees.map((employee) => EmployeeResponseDto.fromEntity(employee));
  }

  async update(
    id: number,
    dto: UpdateEmployeeDto,
    actor: AuthUser,
  ): Promise<EmployeeResponseDto> {
    const employee = await this.employeeRepository.findById(id);
    if (!employee) {
      throw new NotFoundException(
        `No se encontró un empleado con el identificador ${id}.`,
      );
    }

    // El documento se edita solo si mandan ambos campos (tipo y número)
    if (dto.documentType !== undefined && dto.documentNumber !== undefined) {
      const document = DocumentId.create(dto.documentType, dto.documentNumber);

      const existing = await this.employeeRepository.findByDocument(
        document.getNumber(),
      );
      if (existing !== null && existing.id !== id) {
        throw new DuplicateDocumentError(document.getNumber());
      }

      employee.document = document.getNumber();
      employee.document_type = document.getType();
    }

    if (dto.positionId !== undefined) {
      const jobPosition = await this.positionRepository.findById(dto.positionId);
      if (!jobPosition) {
        throw new NotFoundException(
          `No se encontró un cargo con el identificador ${dto.positionId}.`,
        );
      }
      if (!jobPosition.is_active) {
        throw new BadRequestException(
          `El cargo con identificador ${dto.positionId} está inactivo.`,
        );
      }
      // "position" se mantiene sincronizado con el nombre vigente del cargo
      employee.position = jobPosition.name;
      employee.jobPosition = jobPosition;
    }

    if (dto.workdayConfigId !== undefined) {
      employee.workdayConfig = await this.obtenerJornadaAsignable(
        dto.workdayConfigId,
      );
    }

    if (dto.branchId !== undefined) {
      const asignacionVigente = employee.employee_branch_assig?.find(
        (a) => a.is_current,
      );

      // Si ya está en esa sucursal, no hay nada que reasignar
      if (!asignacionVigente || asignacionVigente.branch.id !== dto.branchId) {
        const branch = await this.branchRepository.findById(dto.branchId);
        if (!branch) {
          throw new NotFoundException(
            `No se encontró una sucursal con el identificador ${dto.branchId}.`,
          );
        }
        if (!branch.is_active) {
          throw new BadRequestException(
            `La sucursal con identificador ${dto.branchId} está inactiva.`,
          );
        }

        // Se cierra la asignación vigente y se abre una nueva: se conserva
        // el historial de sucursales por las que pasó el empleado.
        if (asignacionVigente) {
          asignacionVigente.is_current = false;
          asignacionVigente.end_date = new Date();
        }

        const nuevaAsignacion = new EmployeeBranchAssignment();
        nuevaAsignacion.branch = branch;
        nuevaAsignacion.start_date = new Date();
        nuevaAsignacion.end_date = null;
        nuevaAsignacion.is_current = true;

        employee.employee_branch_assig = [
          ...(employee.employee_branch_assig ?? []),
          nuevaAsignacion,
        ];
      }
    }

    if (dto.firstName !== undefined) employee.firstName = dto.firstName;
    if (dto.lastName !== undefined) employee.lastName = dto.lastName;
    if (dto.phone !== undefined) employee.phone = dto.phone;
    if (dto.salaryBase !== undefined) {
      // Misma regla que al registrar: el salario debe ser mayor que cero
      employee.salary_base = Salary.create(dto.salaryBase).getvalue();
    }
    if (dto.hireDate !== undefined) {
      employee.hire_date = HireDate.create(
        dto.hireDate,
        getColombiaDate(new Date()),
      ).getValue();
    }

    try {
      const employeeActualizado = await this.employeeRepository.save(employee);

      this.auditPort.log({
        action: 'EMPLOYEE_UPDATED',
        module: 'Empleados',
        resource: 'Employee',
        resourceId: employeeActualizado.id,
        result: 'SUCCESS',
        message: `Se actualizó el empleado "${employeeActualizado.firstName} ${employeeActualizado.lastName}".`,
        metadata: { performedBy: actor.id },
      });

      return EmployeeResponseDto.fromEntity(employeeActualizado);
    } catch (error) {
      this.auditPort.log({
        action: 'EMPLOYEE_UPDATE_FAILED',
        module: 'Empleados',
        resource: 'Employee',
        resourceId: id,
        result: 'FAILED',
        message: 'Falló la actualización de un empleado.',
        metadata: {
          performedBy: actor.id,
          error: error instanceof Error ? error.message : String(error),
        },
      });

      throw error;
    }
  }

  async deactivate(id: number, actor: AuthUser): Promise<void> {
    const employee = await this.employeeRepository.findById(id);
    if (!employee) {
      throw new NotFoundException(
        `No se encontró un empleado con el identificador ${id}.`,
      );
    }

    if (employee.status !== 'ACTIVO') {
      throw new ConflictException(
        `El empleado con identificador ${id} ya se encuentra inactivo.`,
      );
    }

    const tieneRegistrosHistoricos =
      await this.employeeRepository.hasHistoricalRecords(id);
    if (tieneRegistrosHistoricos) {
      throw new ConflictException(
        'No se puede desactivar el empleado porque tiene registros de asistencia, nómina o incapacidades asociados.',
      );
    }

    try {
      await this.employeeRepository.deactivate(id);

      this.auditPort.log({
        action: 'EMPLOYEE_DEACTIVATED',
        module: 'Empleados',
        resource: 'Employee',
        resourceId: id,
        result: 'SUCCESS',
        message: `Se desactivó el empleado con identificador ${id}.`,
        metadata: { performedBy: actor.id },
      });
    } catch (error) {
      this.auditPort.log({
        action: 'EMPLOYEE_DEACTIVATE_FAILED',
        module: 'Empleados',
        resource: 'Employee',
        resourceId: id,
        result: 'FAILED',
        message: 'Falló la desactivación de un empleado.',
        metadata: {
          performedBy: actor.id,
          error: error instanceof Error ? error.message : String(error),
        },
      });

      throw error;
    }
  }
}
