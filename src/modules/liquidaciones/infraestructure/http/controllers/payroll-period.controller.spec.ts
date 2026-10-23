import { StreamableFile } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PayrollPeriodController } from './payroll-period.controller';
import { PayrollPeriodService } from 'src/modules/liquidaciones/application/services/payroll-period.service';
import { PayrollSlipPdfService } from 'src/modules/liquidaciones/application/services/payroll-slip-pdf.service';
import { PayrollCsvService } from 'src/modules/liquidaciones/application/services/payroll-csv.service';
import { PreLiquidationService } from 'src/modules/liquidaciones/application/services/pre-liquidation.service';
import { PayrollPeriod } from 'src/entities/payroll-period.model';
import { Employee } from 'src/entities/employee.model';
import { Position } from 'src/entities/position.model';
import { PayrollLine } from 'src/entities/payroll_line.model';
import { EmployeeBranchAssignment } from 'src/entities/employee-branch-assignment.model';
import { Branch } from 'src/entities/branch.model';
import { Company } from 'src/entities/company.model';

import { Role } from 'src/application/ports/auth/auth-user';
import { ROLES_KEY } from 'src/infraestructure/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/infraestructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/infraestructure/auth/guards/roles.guard';

describe('PayrollPeriodController', () => {
  let controller: PayrollPeriodController;

  const payrollPeriodServiceMock = {
    findAll: jest.fn(),
    findById: jest.fn(),
    generate: jest.fn(),
  };

  const payrollSlipPdfServiceMock = {
    generate: jest.fn(),
  };
  const payrollCsvServiceMock = {
    generate: jest.fn(),
  };
  const preLiquidationServiceMock = { generate: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PayrollPeriodController],
      providers: [
        {
          provide: PayrollPeriodService,
          useValue: payrollPeriodServiceMock,
        },
        {
          provide: PayrollSlipPdfService,
          useValue: payrollSlipPdfServiceMock,
        },
        {
          provide: PayrollCsvService,
          useValue: payrollCsvServiceMock,
        },
        {
          provide: PreLiquidationService,
          useValue: preLiquidationServiceMock,
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

    controller = module.get<PayrollPeriodController>(PayrollPeriodController);
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
    it('debe exigir autenticación y validación de roles', () => {
      const guards = Reflect.getMetadata('__guards__', PayrollPeriodController);

      expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
    });

    it('debe estar restringido al rol administrador', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, PayrollPeriodController);

      expect(roles).toEqual([Role.ADMINISTRADOR]);
    });
  });

  // =========================================================
  // GET /liquidaciones
  // =========================================================

  describe('findAll', () => {
    it('debe retornar las liquidaciones mapeadas al DTO de respuesta', async () => {
      const liquidacion = crearLiquidacion();
      payrollPeriodServiceMock.findAll.mockResolvedValue([liquidacion]);

      const resultado = await controller.findAll({});

      expect(resultado).toEqual([
        expect.objectContaining({
          id: 1,
          employeeId: 1,
          employeeName: 'Juan Pérez',
          status: 'Confirmada',
        }),
      ]);
    });

    it('debe enviar al servicio los filtros recibidos', async () => {
      payrollPeriodServiceMock.findAll.mockResolvedValue([]);
      const query = {
        employeeId: 3,
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
      };

      await controller.findAll(query);

      expect(payrollPeriodServiceMock.findAll).toHaveBeenCalledWith(query);
    });

    it('debe propagar los errores del servicio', async () => {
      const error = new Error('Rango inválido');
      payrollPeriodServiceMock.findAll.mockRejectedValue(error);

      await expect(controller.findAll({})).rejects.toBe(error);
    });
  });

  // =========================================================
  // GET /liquidaciones/:id
  // =========================================================

  describe('findById', () => {
    it('debe retornar el detalle con los conceptos separados por tipo', async () => {
      const liquidacion = crearLiquidacion({
        payroll_lines: [
          Object.assign(new PayrollLine(), {
            concept_name: 'Salario base',
            type: 'DEVENGADO',
            amount: 1800000,
          }),
          Object.assign(new PayrollLine(), {
            concept_name: 'Préstamo',
            type: 'DEDUCCION',
            amount: 150000,
          }),
        ],
      });
      payrollPeriodServiceMock.findById.mockResolvedValue(liquidacion);

      const resultado = await controller.findById(1);

      expect(resultado.earnings).toEqual([
        expect.objectContaining({
          conceptName: 'Salario base',
          amount: 1800000,
        }),
      ]);
      expect(resultado.deductions).toEqual([
        expect.objectContaining({ conceptName: 'Préstamo', amount: 150000 }),
      ]);
    });

    it('debe incluir el documento y el cargo del empleado', async () => {
      payrollPeriodServiceMock.findById.mockResolvedValue(crearLiquidacion());

      const resultado = await controller.findById(1);

      expect(resultado.employeeDocumentType).toBe('CC');
      expect(resultado.employeeDocument).toBe('1020304050');
      expect(resultado.employeePosition).toBe('Mesero');
    });

    it('debe retornar el cargo en null cuando el empleado no tiene uno asignado', async () => {
      payrollPeriodServiceMock.findById.mockResolvedValue(
        crearLiquidacion({
          employee: Object.assign(new Employee(), {
            id: 1,
            firstName: 'Juan',
            lastName: 'Pérez',
            document_type: 'CC',
            document: '1020304050',
            jobPosition: null,
          }),
        }),
      );

      const resultado = await controller.findById(1);

      expect(resultado.employeePosition).toBeNull();
    });

    it('debe consultar el servicio con el identificador recibido', async () => {
      payrollPeriodServiceMock.findById.mockResolvedValue(crearLiquidacion());

      await controller.findById(7);

      expect(payrollPeriodServiceMock.findById).toHaveBeenCalledWith(7);
    });

    it('debe propagar los errores del servicio', async () => {
      const error = new Error('No encontrada');
      payrollPeriodServiceMock.findById.mockRejectedValue(error);

      await expect(controller.findById(99)).rejects.toBe(error);
    });
  });

  // =========================================================
  // GET /liquidaciones/:id/pdf
  // =========================================================

  describe('generatePdf', () => {
    function resSpy() {
      return { set: jest.fn() } as unknown as import('express').Response;
    }

    it('debe retornar el PDF generado como un StreamableFile', async () => {
      payrollPeriodServiceMock.findById.mockResolvedValue(
        crearLiquidacionConSucursal(),
      );
      const pdfBuffer = Buffer.from('%PDF-1.4');
      payrollSlipPdfServiceMock.generate.mockResolvedValue(pdfBuffer);

      const resultado = await controller.generatePdf(1, resSpy());

      expect(resultado).toBeInstanceOf(StreamableFile);
    });

    it('debe consultar la liquidación por el identificador recibido', async () => {
      payrollPeriodServiceMock.findById.mockResolvedValue(
        crearLiquidacionConSucursal(),
      );
      payrollSlipPdfServiceMock.generate.mockResolvedValue(
        Buffer.from('%PDF-1.4'),
      );

      await controller.generatePdf(7, resSpy());

      expect(payrollPeriodServiceMock.findById).toHaveBeenCalledWith(7);
    });

    it('debe establecer los encabezados de respuesta como PDF descargable', async () => {
      payrollPeriodServiceMock.findById.mockResolvedValue(
        crearLiquidacionConSucursal(),
      );
      payrollSlipPdfServiceMock.generate.mockResolvedValue(
        Buffer.from('%PDF-1.4'),
      );
      const res = resSpy();

      await controller.generatePdf(1, res);

      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({ 'Content-Type': 'application/pdf' }),
      );
    });

    it('debe propagar los errores de la liquidación no encontrada', async () => {
      const error = new Error('No encontrada');
      payrollPeriodServiceMock.findById.mockRejectedValue(error);

      await expect(controller.generatePdf(99, resSpy())).rejects.toBe(error);
      expect(payrollSlipPdfServiceMock.generate).not.toHaveBeenCalled();
    });

    it('debe propagar los errores de generación del PDF', async () => {
      payrollPeriodServiceMock.findById.mockResolvedValue(
        crearLiquidacionConSucursal(),
      );
      const error = new Error('Fallo al generar el PDF');
      payrollSlipPdfServiceMock.generate.mockRejectedValue(error);

      await expect(controller.generatePdf(1, resSpy())).rejects.toBe(error);
    });
  });

  describe('generatePayrollPeriod', () => {
    it('delega la generación y persistencia de la liquidación', async () => {
      const period = {
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
      };
      const liquidacion = { id: 9 } as PayrollPeriod;
      payrollPeriodServiceMock.generate.mockResolvedValue(liquidacion);

      await expect(controller.generatePayrollPeriod(3, period)).resolves.toBe(
        liquidacion,
      );
      expect(payrollPeriodServiceMock.generate).toHaveBeenCalledWith(3, period);
    });
  });
});

// =========================================================
// Utilidades
// =========================================================

function crearLiquidacion(
  overrides: Partial<PayrollPeriod> = {},
): PayrollPeriod {
  return Object.assign(new PayrollPeriod(), {
    id: 1,
    period_start: '2026-09-01',
    period_end: '2026-09-30',
    total_earnings: 1800000,
    total_deductions: 150000,
    net_pay: 1650000,
    employee: Object.assign(new Employee(), {
      id: 1,
      firstName: 'Juan',
      lastName: 'Pérez',
      document_type: 'CC',
      document: '1020304050',
      jobPosition: Object.assign(new Position(), { id: 1, name: 'Mesero' }),
    }),
    payroll_lines: [],
    ...overrides,
  });
}

// Variante con sucursal/compañía asignada, necesaria para los tests de
// generatePdf (el mapper exige una asignación vigente a la fecha liquidada).
function crearLiquidacionConSucursal(
  overrides: Partial<PayrollPeriod> = {},
): PayrollPeriod {
  const sucursal = Object.assign(new Branch(), {
    name: 'Envigado',
    city: 'Envigado',
    address: 'Calle 46 Sur # 42B-16, Zona 7',
    company: Object.assign(new Company(), {
      name: 'JS Burguer Parrilla',
      nit: '',
    }),
  });
  const asignacion = Object.assign(new EmployeeBranchAssignment(), {
    start_date: '2026-01-01',
    end_date: null,
    is_current: true,
    branch: sucursal,
  });

  return crearLiquidacion({
    employee: Object.assign(new Employee(), {
      id: 1,
      firstName: 'Juan',
      lastName: 'Pérez',
      document_type: 'CC',
      document: '1020304050',
      jobPosition: Object.assign(new Position(), { id: 1, name: 'Mesero' }),
      employee_branch_assig: [asignacion],
    }),
    ...overrides,
  });
}
