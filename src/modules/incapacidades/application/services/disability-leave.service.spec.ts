import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { DisabilityLeaveService } from './disability-leave.service';
import { DISABILITY_LEAVE_REPOSITORY_PORT } from '../../domain/ports/disability-leave-repository.port';
import { EMPLOYEE_REPOSITORY_PORT } from 'src/modules/empleados/domain/ports/employee-repository.port';
import { AUDIT_PORT } from 'src/application/ports/audit/audit.port';
import { Role } from 'src/application/ports/auth/auth-user';
import type { AuthUser } from 'src/application/ports/auth/auth-user';
import { DisabilityType } from '../../domain/value-objects/disability-type.enum';
import { RegisterDisabilityLeaveDto } from '../../infraestructure/http/dtos/register-disability-leave.dto';
import { Employee } from 'src/entities/employee.model';
import { DisabilityLeave } from 'src/entities/disability_leave.model';
import { aFechaCalendario } from 'src/modules/parametros-nomina/domain/vigencia';

describe('DisabilityLeaveService', () => {
  let service: DisabilityLeaveService;

  const disabilityLeaveRepositoryMock: {
    save: jest.Mock;
    findAll: jest.Mock;
    findOverlapping: jest.Mock;
    findById: jest.Mock;
    delete: jest.Mock;
    findOverlappingPayrollPeriods: jest.Mock;
  } = {
    save: jest.fn(),
    findAll: jest.fn(),
    findOverlapping: jest.fn(),
    findById: jest.fn(),
    delete: jest.fn(),
    findOverlappingPayrollPeriods: jest.fn(),
  };

  const employeeRepositoryMock: {
    findById: jest.Mock;
  } = {
    findById: jest.fn(),
  };

  const auditPortMock: {
    log: jest.Mock;
  } = {
    log: jest.fn(),
  };

  const actor: AuthUser = {
    id: 'a1b2c3d4-uuid-admin',
    email: 'admin@sisgal.com',
    role: Role.ADMINISTRADOR,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DisabilityLeaveService,
        {
          provide: DISABILITY_LEAVE_REPOSITORY_PORT,
          useValue: disabilityLeaveRepositoryMock,
        },
        {
          provide: EMPLOYEE_REPOSITORY_PORT,
          useValue: employeeRepositoryMock,
        },
        {
          provide: AUDIT_PORT,
          useValue: auditPortMock,
        },
      ],
    }).compile();

    service = module.get<DisabilityLeaveService>(DisabilityLeaveService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  // =========================================================
  // register
  // =========================================================

  describe('register', () => {
    beforeEach(() => {
      employeeRepositoryMock.findById.mockResolvedValue(crearEmpleado());
      disabilityLeaveRepositoryMock.findOverlapping.mockResolvedValue([]);
      disabilityLeaveRepositoryMock.save.mockImplementation(
        (registro: DisabilityLeave) =>
          Promise.resolve(Object.assign(registro, { id: 1 })),
      );
    });

    it('debe registrar la incapacidad y calcular los días del período', async () => {
      const resultado = await service.register(
        crearDto({ startDate: '2026-09-10', endDate: '2026-09-15' }),
        actor,
      );

      expect(resultado.id).toBe(1);
      expect(resultado.total_days).toBe(6);
      expect(resultado.employee_days).toBe(0);
      expect(resultado.eps_days).toBe(0);
      expect(disabilityLeaveRepositoryMock.save).toHaveBeenCalledTimes(1);
      // TypeORM guarda las columnas `date` con el día local de la fecha.
      const [saved] = disabilityLeaveRepositoryMock.save.mock.calls[0] as [
        DisabilityLeave,
      ];
      expect(aFechaCalendario(saved.start_date)).toBe('2026-09-10');
      expect(aFechaCalendario(saved.end_date)).toBe('2026-09-15');
    });

    it('debe calcular un solo día cuando inicio y fin son la misma fecha', async () => {
      const resultado = await service.register(
        crearDto({ startDate: '2026-09-10', endDate: '2026-09-10' }),
        actor,
      );

      expect(resultado.total_days).toBe(1);
    });

    it('debe guardar la descripción cuando el tipo es Otros', async () => {
      const resultado = await service.register(
        crearDto({
          type: DisabilityType.OTROS,
          otherTypeDescription: 'Cita médica prolongada',
        }),
        actor,
      );

      expect(resultado.other_type_description).toBe('Cita médica prolongada');
    });

    it('debe lanzar NotFoundException cuando el empleado no existe', async () => {
      employeeRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.register(crearDto(), actor)).rejects.toThrow(
        NotFoundException,
      );

      expect(disabilityLeaveRepositoryMock.save).not.toHaveBeenCalled();
    });

    it('debe lanzar BadRequestException cuando el empleado no está activo', async () => {
      employeeRepositoryMock.findById.mockResolvedValue(
        crearEmpleado({ status: 'INACTIVO' }),
      );

      await expect(service.register(crearDto(), actor)).rejects.toThrow(
        BadRequestException,
      );

      expect(disabilityLeaveRepositoryMock.save).not.toHaveBeenCalled();
    });

    it('debe lanzar BadRequestException cuando la fecha de fin es anterior a la de inicio', async () => {
      await expect(
        service.register(
          crearDto({ startDate: '2026-09-15', endDate: '2026-09-10' }),
          actor,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(disabilityLeaveRepositoryMock.save).not.toHaveBeenCalled();
    });

    it('debe lanzar ConflictException cuando el período se cruza con uno existente', async () => {
      disabilityLeaveRepositoryMock.findOverlapping.mockResolvedValue([
        { id: 9 } as DisabilityLeave,
      ]);

      await expect(service.register(crearDto(), actor)).rejects.toThrow(
        ConflictException,
      );

      expect(disabilityLeaveRepositoryMock.save).not.toHaveBeenCalled();
    });

    it('debe consultar la superposición con las fechas y el empleado recibidos', async () => {
      await service.register(
        crearDto({ employeeId: 3, startDate: '2026-09-10', endDate: '2026-09-15' }),
        actor,
      );

      expect(disabilityLeaveRepositoryMock.findOverlapping).toHaveBeenCalledWith(
        3,
        '2026-09-10',
        '2026-09-15',
      );
    });

    it('debe propagar el error cuando falla el guardado', async () => {
      disabilityLeaveRepositoryMock.save.mockRejectedValue(
        new Error('Error de BD'),
      );

      await expect(service.register(crearDto(), actor)).rejects.toThrow(
        'Error de BD',
      );
    });

    // =========================================================
    // Auditoría
    // =========================================================

    it('debe auditar el registro exitoso indicando quién lo realizó', async () => {
      await service.register(crearDto(), actor);

      expect(auditPortMock.log).toHaveBeenCalledTimes(1);
      expect(auditPortMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DISABILITY_LEAVE_REGISTERED',
          module: 'Incapacidades',
          resource: 'DisabilityLeave',
          resourceId: 1,
          result: 'SUCCESS',
          metadata: expect.objectContaining({ performedBy: actor.id }),
        }),
      );
    });

    it('debe auditar el fallo cuando no se puede guardar el registro', async () => {
      disabilityLeaveRepositoryMock.save.mockRejectedValue(
        new Error('Error de BD'),
      );

      await expect(service.register(crearDto(), actor)).rejects.toThrow(
        'Error de BD',
      );

      expect(auditPortMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DISABILITY_LEAVE_REGISTER_FAILED',
          result: 'FAILED',
          metadata: expect.objectContaining({
            performedBy: actor.id,
            error: 'Error de BD',
          }),
        }),
      );
    });

    it('no debe auditar cuando la validación falla antes de guardar', async () => {
      employeeRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.register(crearDto(), actor)).rejects.toThrow(
        NotFoundException,
      );

      expect(auditPortMock.log).not.toHaveBeenCalled();
    });
  });

  // =========================================================
  // findAll
  // =========================================================

  describe('findAll', () => {
    it('debe delegar la consulta al repositorio con los filtros recibidos', async () => {
      const registros = [{ id: 1 } as DisabilityLeave];
      disabilityLeaveRepositoryMock.findAll.mockResolvedValue(registros);

      const resultado = await service.findAll({ employeeId: 5 });

      expect(resultado).toEqual(registros);
      expect(disabilityLeaveRepositoryMock.findAll).toHaveBeenCalledWith({
        employeeId: 5,
      });
    });

    it('debe lanzar BadRequestException cuando la fecha inicial es posterior a la final', async () => {
      await expect(
        service.findAll({ startDate: '2026-09-15', endDate: '2026-09-10' }),
      ).rejects.toThrow(BadRequestException);

      expect(disabilityLeaveRepositoryMock.findAll).not.toHaveBeenCalled();
    });

    it('no debe lanzar error cuando las fechas están en orden válido', async () => {
      disabilityLeaveRepositoryMock.findAll.mockResolvedValue([]);

      await expect(
        service.findAll({ startDate: '2026-09-01', endDate: '2026-09-30' }),
      ).resolves.toEqual([]);
    });
  });


  describe('update y delete', () => {
    const stored = () =>
      ({
        id: 5,
        // TypeORM entrega las columnas `date` como texto.
        start_date: '2026-09-10',
        end_date: '2026-09-15',
        total_days: 6,
        type: DisabilityType.ENFERMEDAD_GENERAL,
        other_type_description: null,
        employee: { id: 3, firstName: 'Ana', lastName: 'Ruiz' },
      }) as unknown as DisabilityLeave;
    const savedPayroll = {
      period_start: '2026-09-01',
      period_end: '2026-09-30',
    };

    beforeEach(() => {
      disabilityLeaveRepositoryMock.findById.mockResolvedValue(stored());
      disabilityLeaveRepositoryMock.findOverlapping.mockResolvedValue([]);
      disabilityLeaveRepositoryMock.findOverlappingPayrollPeriods.mockResolvedValue(
        [],
      );
      disabilityLeaveRepositoryMock.save.mockImplementation(
        async (leave: DisabilityLeave) => leave,
      );
    });

    it('actualiza las fechas y recalcula los días sin cruzarse consigo misma', async () => {
      const result = await service.update(
        5,
        { startDate: '2026-10-01', endDate: '2026-10-03' },
        actor,
      );

      expect(result.total_days).toBe(3);
      expect(aFechaCalendario(result.start_date)).toBe('2026-10-01');
      expect(aFechaCalendario(result.end_date)).toBe('2026-10-03');
      expect(
        disabilityLeaveRepositoryMock.findOverlapping,
      ).toHaveBeenCalledWith(3, '2026-10-01', '2026-10-03', 5);
      expect(auditPortMock.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DISABILITY_LEAVE_UPDATED' }),
      );
    });

    it('revisa las liquidaciones de las fechas anteriores y de las nuevas', async () => {
      await service.update(
        5,
        { startDate: '2026-10-01', endDate: '2026-10-03' },
        actor,
      );

      expect(
        disabilityLeaveRepositoryMock.findOverlappingPayrollPeriods.mock.calls,
      ).toEqual([
        [3, '2026-09-10', '2026-09-15'],
        [3, '2026-10-01', '2026-10-03'],
      ]);
    });

    it('no actualiza las fechas si una liquidación guardada las incluye', async () => {
      disabilityLeaveRepositoryMock.findOverlappingPayrollPeriods.mockResolvedValue(
        [savedPayroll],
      );

      await expect(
        service.update(5, { endDate: '2026-09-16' }, actor),
      ).rejects.toThrow(
        'La liquidación del 01/09/2026 al 30/09/2026 incluye estas fechas.',
      );
      expect(disabilityLeaveRepositoryMock.save).not.toHaveBeenCalled();
    });

    it('permite corregir la descripción aunque exista una liquidación', async () => {
      disabilityLeaveRepositoryMock.findById.mockResolvedValue(
        Object.assign(stored(), {
          type: DisabilityType.OTROS,
          other_type_description: 'Cita',
        }),
      );
      disabilityLeaveRepositoryMock.findOverlappingPayrollPeriods.mockResolvedValue(
        [savedPayroll],
      );

      const result = await service.update(
        5,
        { otherTypeDescription: ' Cita médica ' },
        actor,
      );

      expect(result.other_type_description).toBe('Cita médica');
    });

    it('borra la descripción al cambiar a un tipo distinto de Otros', async () => {
      disabilityLeaveRepositoryMock.findById.mockResolvedValue(
        Object.assign(stored(), {
          type: DisabilityType.OTROS,
          other_type_description: 'Cita',
        }),
      );

      const result = await service.update(
        5,
        { type: DisabilityType.ENFERMEDAD_GENERAL },
        actor,
      );

      expect(result.other_type_description).toBeNull();
    });

    it('exige la descripción al cambiar a Otros', async () => {
      await expect(
        service.update(5, { type: DisabilityType.OTROS }, actor),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza un fin anterior al inicio', async () => {
      await expect(
        service.update(5, { endDate: '2026-09-01' }, actor),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza cruzarse con otro registro', async () => {
      disabilityLeaveRepositoryMock.findOverlapping.mockResolvedValue([
        { id: 6 },
      ]);

      await expect(
        service.update(5, { endDate: '2026-09-20' }, actor),
      ).rejects.toThrow(ConflictException);
    });

    it('rechaza editar o eliminar un registro que no existe', async () => {
      disabilityLeaveRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.update(99, {}, actor)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.delete(99, actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('elimina el registro y deja la trazabilidad', async () => {
      await service.delete(5, actor);

      expect(disabilityLeaveRepositoryMock.delete).toHaveBeenCalledWith(5);
      expect(auditPortMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DISABILITY_LEAVE_DELETED',
          resourceId: 5,
        }),
      );
    });

    it('no elimina si una liquidación guardada incluye sus fechas', async () => {
      disabilityLeaveRepositoryMock.findOverlappingPayrollPeriods.mockResolvedValue(
        [savedPayroll],
      );

      await expect(service.delete(5, actor)).rejects.toThrow(ConflictException);
      expect(disabilityLeaveRepositoryMock.delete).not.toHaveBeenCalled();
    });
  });
});

// =========================================================
// Utilidades
// =========================================================

function crearDto(
  overrides: Partial<RegisterDisabilityLeaveDto> = {},
): RegisterDisabilityLeaveDto {
  return {
    employeeId: 1,
    type: DisabilityType.ENFERMEDAD_GENERAL,
    startDate: '2026-09-10',
    endDate: '2026-09-15',
    ...overrides,
  };
}

function crearEmpleado(overrides: Partial<Employee> = {}): Employee {
  return Object.assign(new Employee(), {
    id: 1,
    firstName: 'Juan',
    lastName: 'Pérez',
    status: 'ACTIVO',
    ...overrides,
  });
}
