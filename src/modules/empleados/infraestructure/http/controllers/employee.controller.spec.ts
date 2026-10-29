import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

import { EmployeeController } from './employee.controller';
import { EmployeeService } from 'src/modules/empleados/application/services/employee.service';
import { RegisterEmployeeDto } from '../dtos/register-employee.dto';
import { EmployeeResponseDto } from '../dtos/employee-response.dto';
import { DocumentType } from 'src/modules/empleados/domain/value-objects/document-type.enum';
import {
  DuplicateDocumentError,
  EmptyDocumentNumberError,
  FutureHireDateError,
  InvalidDocumentFormatError,
  InvalidSalaryError,
} from 'src/modules/empleados/domain/errors/employee.errors';

import { JwtAuthGuard } from 'src/infraestructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/infraestructure/auth/guards/roles.guard';
import { ROLES_KEY } from 'src/infraestructure/auth/decorators/roles.decorator';
import { Role } from 'src/application/ports/auth/auth-user';
import type { AuthUser } from 'src/application/ports/auth/auth-user';

import { Branch, Employee, EmployeeBranchAssignment, Position } from 'src/entities';

describe('EmployeeController', () => {
  let controller: EmployeeController;

  const employeeServiceMock = {
    register: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmployeeController],
      providers: [
        {
          provide: EmployeeService,
          useValue: employeeServiceMock,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
      .compile();

    controller = module.get<EmployeeController>(EmployeeController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  // =========================================================
  // Seguridad
  // =========================================================

  describe('seguridad', () => {
    it('debe aplicar JwtAuthGuard y RolesGuard al controller', () => {
      const guards = Reflect.getMetadata('__guards__', EmployeeController);

      expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
    });

    it('debe exigir el rol ADMINISTRADOR', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, EmployeeController);

      expect(roles).toEqual([Role.ADMINISTRADOR]);
    });
  });

  // =========================================================
  // POST /empleados
  // =========================================================

  describe('register', () => {
    it('debe registrar el empleado y retornar la respuesta con su sucursal', async () => {
      employeeServiceMock.register.mockResolvedValue(crearEmpleado());

      const dto = crearDto();
      const request = crearRequest();
      const resultado = await controller.register(dto, request);

      expect(resultado).toBeInstanceOf(EmployeeResponseDto);
      expect(resultado).toEqual({
        id: 5,
        firstName: 'Juan',
        lastName: 'Pérez',
        documentType: 'CC',
        document: '1020304050',
        phone: '3001234567',
        salaryBase: 1800000,
        position: 'Auxiliar de cocina',
        status: 'ACTIVO',
        hireDate: '2026-02-15',
        branchId: 3,
        positionId: 1,
      });

      expect(employeeServiceMock.register).toHaveBeenCalledTimes(1);
      expect(employeeServiceMock.register).toHaveBeenCalledWith(
        dto,
        request.user,
      );
    });

    it.each([
      ['InvalidSalaryError', new InvalidSalaryError()],
      ['EmptyDocumentNumberError', new EmptyDocumentNumberError()],
      ['InvalidDocumentFormatError', new InvalidDocumentFormatError()],
      ['FutureHireDateError', new FutureHireDateError()],
    ])(
      'debe traducir %s a BadRequestException',
      async (_nombre, error: Error) => {
        employeeServiceMock.register.mockRejectedValue(error);

        await expect(controller.register(crearDto(), crearRequest())).rejects.toThrow(
          BadRequestException,
        );
      },
    );

    it('debe conservar el mensaje del error de dominio', async () => {
      employeeServiceMock.register.mockRejectedValue(new InvalidSalaryError());

      await expect(controller.register(crearDto(), crearRequest())).rejects.toThrow(
        'El salario debe ser mayor que cero',
      );
    });

    it('debe traducir DuplicateDocumentError a ConflictException', async () => {
      employeeServiceMock.register.mockRejectedValue(
        new DuplicateDocumentError('1020304050'),
      );

      await expect(controller.register(crearDto(), crearRequest())).rejects.toThrow(
        ConflictException,
      );
    });

    it('debe dejar pasar las excepciones HTTP del servicio sin transformarlas', async () => {
      const error = new NotFoundException('No se encontró la sucursal');
      employeeServiceMock.register.mockRejectedValue(error);

      await expect(controller.register(crearDto(), crearRequest())).rejects.toBe(error);
    });

    it('debe propagar los errores inesperados', async () => {
      const error = new Error('Error inesperado');
      employeeServiceMock.register.mockRejectedValue(error);

      await expect(controller.register(crearDto(), crearRequest())).rejects.toBe(error);
    });
  });
});

// =========================================================
// Utilidades
// =========================================================

function crearRequest(): Request & { user: AuthUser } {
  return {
    user: {
      id: 'a1b2c3d4-uuid-admin',
      email: 'admin@sisgal.com',
      role: Role.ADMINISTRADOR,
    },
  } as Request & { user: AuthUser };
}

function crearDto(): RegisterEmployeeDto {
  return {
    firstName: 'Juan',
    lastName: 'Pérez',
    documentType: DocumentType.CC,
    documentNumber: '1020304050',
    phone: '3001234567',
    salaryBase: 1800000,
    positionId: 1,
    branchId: 3,
  };
}

function crearEmpleado(): Employee {
  const asignacion = Object.assign(new EmployeeBranchAssignment(), {
    is_current: true,
    end_date: null,
    branch: Object.assign(new Branch(), { id: 3 }),
  });

  return Object.assign(new Employee(), {
    id: 5,
    firstName: 'Juan',
    lastName: 'Pérez',
    document_type: 'CC',
    document: '1020304050',
    phone: '3001234567',
    salary_base: 1800000,
    hire_date: '2026-02-15',
    position: 'Auxiliar de cocina',
    jobPosition: Object.assign(new Position(), { id: 1 }),
    status: 'ACTIVO',
    employee_branch_assig: [asignacion],
  });
}
