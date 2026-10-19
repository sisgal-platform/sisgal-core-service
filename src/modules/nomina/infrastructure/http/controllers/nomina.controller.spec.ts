import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { NominaController } from './nomina.controller';
import { LegalDeductionsService } from '../../../application/services/legal-deductions.service';
import {
  NominaService,
  PayrollCalculationResult,
} from '../../../application/services/nomina.service';
import { PayrollHoursService } from '../../../application/services/payroll-hours.service';

import { Role } from 'src/application/ports/auth/auth-user';
import { ROLES_KEY } from 'src/infraestructure/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/infraestructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/infraestructure/auth/guards/roles.guard';
import type { Employee } from 'src/entities';

/** Clave con la que `@UseGuards` registra los guards en la metadata de Nest. */
const GUARDS_METADATA = '__guards__';

describe('NominaController', () => {
  let controller: NominaController;

  const nominaServiceMock = { calculatePayroll: jest.fn() };

  const ana = {
    id: 1,
    firstName: 'Ana',
    lastName: 'Gómez',
    document: '1020304050',
    document_type: 'CC',
    jobPosition: { name: 'Mesera' },
  } as Employee;
  const luis = {
    id: 2,
    firstName: 'Luis',
    lastName: 'Mora',
    document: '9080706050',
    document_type: 'CC',
  } as Employee;

  function calculation(totalEarnings: number, totalDeductions: number) {
    return {
      totalEarnings,
      totalDeductions,
      netPay: totalEarnings - totalDeductions,
      earnings: [{ conceptName: 'Salario base', amount: totalEarnings }],
      deductions: [{ conceptName: 'Salud', amount: totalDeductions }],
      workedHours: [
        {
          type: 'ORDINARIA_DIURNA' as const,
          label: 'Horas ordinarias diurnas',
          hours: 8,
        },
      ],
      loanInstallments: [],
      loanObservations: [
        {
          loanId: 4,
          reason: 'LIMITE_DEDUCCIONES' as const,
          message: 'La cuota del préstamo #4 se descontó parcialmente.',
          details: {},
        },
      ],
      configSnapshot: {},
    };
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NominaController],
      providers: [
        { provide: PayrollHoursService, useValue: {} },
        { provide: LegalDeductionsService, useValue: {} },
        { provide: NominaService, useValue: nominaServiceMock },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<NominaController>(NominaController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('control de acceso', () => {
    it('debe exigir autenticación y verificación de rol', () => {
      expect(Reflect.getMetadata(GUARDS_METADATA, NominaController)).toEqual([
        JwtAuthGuard,
        RolesGuard,
      ]);
    });

    it('debe permitir el acceso únicamente a administradores', () => {
      expect(Reflect.getMetadata(ROLES_KEY, NominaController)).toEqual([
        Role.ADMINISTRADOR,
      ]);
    });
  });

  describe('calculatePayroll', () => {
    it('presenta cada empleado calculado como preliquidación y totaliza el lote', async () => {
      const result: PayrollCalculationResult = {
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        status: 'CON_ERRORES',
        results: [
          { employee: ana, calculation: calculation(1_800_000.5, 150_000.2) },
        ],
        errors: [
          {
            employee: luis,
            causes: ['La marcación del 08/09/2026 no tiene hora de salida.'],
          },
        ],
      };
      nominaServiceMock.calculatePayroll.mockResolvedValue(result);

      const response = await controller.calculatePayroll({
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
      });

      expect(nominaServiceMock.calculatePayroll).toHaveBeenCalledWith(
        '2026-09-01',
        '2026-09-30',
      );
      expect(response).toMatchObject({
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        status: 'CON_ERRORES',
        totalEmployees: 2,
        totalEarnings: 1_800_000.5,
        totalDeductions: 150_000.2,
        totalNetPay: 1_650_000.3,
        errors: [
          {
            employeeId: 2,
            employeeName: 'Luis Mora',
            employeeDocumentType: 'CC',
            employeeDocument: '9080706050',
            causes: ['La marcación del 08/09/2026 no tiene hora de salida.'],
          },
        ],
      });
      expect(response.results).toHaveLength(1);
      expect(response.results[0]).toMatchObject({
        id: null,
        employeeId: 1,
        employeeName: 'Ana Gómez',
        employeePosition: 'Mesera',
        status: 'Preliquidación',
        periodStart: new Date('2026-09-01T00:00:00.000Z'),
        periodEnd: new Date('2026-09-30T00:00:00.000Z'),
        earnings: [{ conceptName: 'Salario base', amount: 1_800_000.5 }],
        deductions: [{ conceptName: 'Salud', amount: 150_000.2 }],
        workedHours: [
          {
            type: 'ORDINARIA_DIURNA',
            label: 'Horas ordinarias diurnas',
            hours: 8,
          },
        ],
        observations: ['La cuota del préstamo #4 se descontó parcialmente.'],
      });
    });

    it('propaga los errores del servicio', async () => {
      nominaServiceMock.calculatePayroll.mockRejectedValue(
        new BadRequestException(
          'El período inicial no puede ser posterior al período final.',
        ),
      );

      await expect(
        controller.calculatePayroll({
          periodStart: '2026-09-30',
          periodEnd: '2026-09-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
