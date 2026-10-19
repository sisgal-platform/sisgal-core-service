import { Employee } from 'src/entities/employee.model';
import { PayrollLine } from 'src/entities/payroll_line.model';
import { PayrollPeriod } from 'src/entities/payroll-period.model';
import { PayrollPeriodDetailResponseDto } from './payroll-period-detail-response.dto';

describe('PayrollPeriodDetailResponseDto', () => {
  function line(id: number, concept: string, type: string, amount: string) {
    return Object.assign(new PayrollLine(), {
      id,
      concept_name: concept,
      type,
      amount,
    });
  }

  function payrollPeriod(configSnapshot: Record<string, unknown>) {
    return Object.assign(new PayrollPeriod(), {
      id: 9,
      period_start: '2026-06-01',
      period_end: '2026-06-30',
      total_earnings: '2120000.00',
      total_deductions: '120000.00',
      net_pay: '2000000.00',
      config_snapshot: configSnapshot,
      employee: Object.assign(new Employee(), {
        id: 1,
        firstName: 'Ana',
        lastName: 'Gómez',
        document_type: 'CC',
        document: '1020304050',
      }),
      payroll_lines: [
        line(1, 'Salario base', 'DEVENGADO', '1500000.00'),
        line(
          2,
          'Prima de servicios 1.er semestre 2026',
          'DEVENGADO',
          '620000.00',
        ),
        line(3, 'Salud', 'DEDUCCION', '60000.00'),
      ],
    });
  }

  it('identifica la prima guardada con su semestre y si fue proporcional', () => {
    const dto = PayrollPeriodDetailResponseDto.fromEntity(
      payrollPeriod({
        serviceBonuses: [
          {
            conceptName: 'Prima de servicios 1.er semestre 2026',
            semesterStart: '2026-01-01',
            semesterEnd: '2026-06-30',
            workedDays: 120,
            semesterDays: 180,
            baseAmount: 1_860_000,
            isProportional: true,
          },
        ],
      }),
    );

    expect(dto.earnings).toEqual([
      { conceptName: 'Salario base', amount: 1_500_000 },
      {
        conceptName: 'Prima de servicios 1.er semestre 2026',
        amount: 620_000,
        serviceBonus: {
          semesterStart: '2026-01-01',
          semesterEnd: '2026-06-30',
          workedDays: 120,
          semesterDays: 180,
          baseAmount: 1_860_000,
          isProportional: true,
        },
      },
    ]);
  });

  it('muestra los conceptos sin detalle de prima en liquidaciones anteriores a la HU16', () => {
    const dto = PayrollPeriodDetailResponseDto.fromEntity(payrollPeriod({}));

    expect(dto.earnings[1]).toEqual({
      conceptName: 'Prima de servicios 1.er semestre 2026',
      amount: 620_000,
    });
    expect(dto.observations).toEqual([]);
  });
});
