import { UnprocessableEntityException } from '@nestjs/common';
import { PayrollPeriod } from 'src/entities/payroll-period.model';
import { Employee } from 'src/entities/employee.model';
import { Position } from 'src/entities/position.model';
import { PayrollLine } from 'src/entities/payroll_line.model';
import { EmployeeBranchAssignment } from 'src/entities/employee-branch-assignment.model';
import { Branch } from 'src/entities/branch.model';
import { Company } from 'src/entities/company.model';
import { findBranchAssignmentAt, toPayrollSlipData } from './payroll-slip.mapper';

describe('payroll-slip.mapper', () => {
  describe('findBranchAssignmentAt', () => {
    it('encuentra la asignación cuyo rango cubre la fecha indicada', () => {
      const envigado = crearAsignacion({ start_date: '2026-01-01', end_date: '2026-06-30', branch: crearSucursal({ name: 'Envigado' }) });
      const santana = crearAsignacion({ start_date: '2026-07-01', end_date: null, branch: crearSucursal({ name: 'Santana' }) });

      expect(findBranchAssignmentAt([envigado, santana], '2026-03-15')?.branch.name).toBe('Envigado');
      expect(findBranchAssignmentAt([envigado, santana], '2026-09-30')?.branch.name).toBe('Santana');
    });

    it('retorna null cuando ninguna asignación cubre la fecha', () => {
      const envigado = crearAsignacion({ start_date: '2026-07-01', end_date: null, branch: crearSucursal({ name: 'Envigado' }) });

      expect(findBranchAssignmentAt([envigado], '2026-01-01')).toBeNull();
    });

    it('trata end_date null como asignación vigente sin fecha de fin', () => {
      const vigente = crearAsignacion({ start_date: '2026-01-01', end_date: null, branch: crearSucursal({ name: 'Envigado' }) });

      expect(findBranchAssignmentAt([vigente], '2030-01-01')?.branch.name).toBe('Envigado');
    });
  });

  describe('toPayrollSlipData', () => {
    it('mapea los datos de la liquidación, la sucursal vigente al período y el NIT en blanco', () => {
      const liquidacion = crearLiquidacion();

      const data = toPayrollSlipData(liquidacion);

      expect(data.company).toEqual({ name: 'JS Burguer Parrilla', nit: null });
      expect(data.branch).toEqual({
        name: 'Envigado',
        city: 'Envigado',
        address: 'Calle 46 Sur # 42B-16, Zona 7',
      });
      expect(data.employee.fullName).toBe('Juan Pérez');
      expect(data.employee.documentType).toBe('CC');
      expect(data.employee.document).toBe('1020304050');
      expect(data.employee.position).toBe('Mesero');
    });

    it('separa los conceptos devengados de las deducciones', () => {
      const liquidacion = crearLiquidacion({
        payroll_lines: [
          Object.assign(new PayrollLine(), { concept_name: 'Salario base', type: 'DEVENGADO', amount: 1800000 }),
          Object.assign(new PayrollLine(), { concept_name: 'Préstamo', type: 'DEDUCCION', amount: 150000 }),
        ],
      });

      const data = toPayrollSlipData(liquidacion);

      expect(data.earnings).toEqual([{ conceptName: 'Salario base', amount: 1800000 }]);
      expect(data.deductions).toEqual([{ conceptName: 'Préstamo', amount: 150000 }]);
    });

    it('usa la sucursal vigente al período liquidado, no la vigente actualmente', () => {
      const liquidacion = crearLiquidacion({
        period_end: '2026-03-31' as unknown as Date,
        employee: Object.assign(new Employee(), {
          firstName: 'Juan',
          lastName: 'Pérez',
          document_type: 'CC',
          document: '1020304050',
          jobPosition: Object.assign(new Position(), { name: 'Mesero' }),
          employee_branch_assig: [
            crearAsignacion({ start_date: '2026-01-01', end_date: '2026-06-30', branch: crearSucursal({ name: 'Envigado' }) }),
            crearAsignacion({ start_date: '2026-07-01', end_date: null, branch: crearSucursal({ name: 'Santana' }) }),
          ],
        }),
      });

      const data = toPayrollSlipData(liquidacion);

      expect(data.branch.name).toBe('Envigado');
    });

    it('lanza un error cuando no hay sucursal vigente para la fecha liquidada', () => {
      const liquidacion = crearLiquidacion({
        employee: Object.assign(new Employee(), {
          firstName: 'Juan',
          lastName: 'Pérez',
          document_type: 'CC',
          document: '1020304050',
          jobPosition: null,
          employee_branch_assig: [],
        }),
      });

      expect(() => toPayrollSlipData(liquidacion)).toThrow(UnprocessableEntityException);
    });
  });
});

function crearSucursal(overrides: Partial<Branch> = {}): Branch {
  return Object.assign(new Branch(), {
    name: 'Envigado',
    city: 'Envigado',
    address: 'Calle 46 Sur # 42B-16, Zona 7',
    company: Object.assign(new Company(), { name: 'JS Burguer Parrilla', nit: '' }),
    ...overrides,
  });
}

type AsignacionOverrides = {
  start_date?: string;
  end_date?: string | null;
  branch?: Branch;
};

function crearAsignacion(overrides: AsignacionOverrides = {}): EmployeeBranchAssignment {
  return Object.assign(new EmployeeBranchAssignment(), {
    start_date: '2026-01-01',
    end_date: null,
    is_current: true,
    branch: crearSucursal(),
    ...overrides,
  });
}

function crearLiquidacion(overrides: Partial<PayrollPeriod> = {}): PayrollPeriod {
  return Object.assign(new PayrollPeriod(), {
    id: 1,
    period_start: '2026-09-01',
    period_end: '2026-09-30',
    total_earnings: 1800000,
    total_deductions: 150000,
    net_pay: 1650000,
    employee: Object.assign(new Employee(), {
      firstName: 'Juan',
      lastName: 'Pérez',
      document_type: 'CC',
      document: '1020304050',
      jobPosition: Object.assign(new Position(), { name: 'Mesero' }),
      employee_branch_assig: [crearAsignacion()],
    }),
    payroll_lines: [],
    ...overrides,
  });
}
