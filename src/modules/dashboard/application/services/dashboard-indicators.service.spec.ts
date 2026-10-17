import { BadRequestException } from '@nestjs/common';
import { AttendanceRecord, Employee, PayrollPeriod } from 'src/entities';
import { DashboardIndicatorsService } from './dashboard-indicators.service';

describe('DashboardIndicatorsService', () => {
  let service: DashboardIndicatorsService;

  const attendanceRecordRepositoryMock = {
    findCheckInsBetween: jest.fn(),
  };
  const payrollPeriodRepositoryMock = {
    findAll: jest.fn(),
  };
  const employeeRepositoryMock = {
    findAll: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    attendanceRecordRepositoryMock.findCheckInsBetween.mockResolvedValue([]);
    payrollPeriodRepositoryMock.findAll.mockResolvedValue([]);
    employeeRepositoryMock.findAll.mockResolvedValue([]);

    service = new DashboardIndicatorsService(
      attendanceRecordRepositoryMock as never,
      payrollPeriodRepositoryMock as never,
      employeeRepositoryMock as never,
    );
  });

  it('debe lanzar BadRequestException cuando el período inicial es posterior al final', async () => {
    await expect(service.getIndicators('2026-10-31', '2026-10-01')).rejects.toThrow(
      BadRequestException,
    );
  });

  describe('indicador de asistencia', () => {
    it('debe calcular el porcentaje promedio sobre marcaciones esperadas', async () => {
      employeeRepositoryMock.findAll.mockResolvedValue([
        crearEmpleado(1),
        crearEmpleado(2),
      ]);
      // Período de 2 días, 2 empleados activos: 4 marcaciones esperadas.
      attendanceRecordRepositoryMock.findCheckInsBetween.mockResolvedValueOnce([
        crearRegistro('2026-10-01'),
        crearRegistro('2026-10-01'),
        crearRegistro('2026-10-02'),
      ]);

      const resultado = await service.getIndicators('2026-10-01', '2026-10-02');

      expect(resultado.attendance.averagePercentage).toBe(75);
    });

    it('debe retornar null cuando no hay empleados activos', async () => {
      employeeRepositoryMock.findAll.mockResolvedValue([]);

      const resultado = await service.getIndicators('2026-10-01', '2026-10-02');

      expect(resultado.attendance.averagePercentage).toBeNull();
      expect(resultado.attendance.weeklyDistribution).toEqual([]);
    });

    it('debe calcular la variación en puntos porcentuales contra el período anterior', async () => {
      employeeRepositoryMock.findAll.mockResolvedValue([crearEmpleado(1)]);
      attendanceRecordRepositoryMock.findCheckInsBetween
        .mockResolvedValueOnce([crearRegistro('2026-10-01')]) // período actual: 100%
        .mockResolvedValueOnce([]); // período anterior: 0%

      const resultado = await service.getIndicators('2026-10-01', '2026-10-01');

      expect(resultado.attendance.averagePercentage).toBe(100);
      expect(resultado.attendance.changeVsPreviousPeriod).toBe(100);
    });

    it('debe agrupar la distribución semanal por día', async () => {
      employeeRepositoryMock.findAll.mockResolvedValue([crearEmpleado(1)]);
      // 2026-10-12 es lunes, 2026-10-13 es martes.
      attendanceRecordRepositoryMock.findCheckInsBetween.mockResolvedValueOnce([
        crearRegistro('2026-10-12'),
      ]);

      const resultado = await service.getIndicators('2026-10-12', '2026-10-13');

      expect(resultado.attendance.weeklyDistribution).toEqual([
        { day: 'Lun', percentage: 100 },
        { day: 'Mar', percentage: 0 },
      ]);
    });
  });

  describe('indicador de horas trabajadas', () => {
    it('debe sumar todos los tipos de minutos del período y convertirlos a horas', async () => {
      attendanceRecordRepositoryMock.findCheckInsBetween.mockResolvedValueOnce([
        crearRegistro('2026-10-01', {
          work_minutes: 480,
          extra_day_minutes: 60,
          extra_night_minutes: 0,
          holiday_minutes: 0,
        }),
      ]);

      const resultado = await service.getIndicators('2026-10-01', '2026-10-01');

      expect(resultado.workedHours.total).toBe(9); // 540 minutos = 9 horas
    });

    it('debe retornar null cuando no hay marcaciones en el período', async () => {
      const resultado = await service.getIndicators('2026-10-01', '2026-10-01');

      expect(resultado.workedHours.total).toBeNull();
      expect(resultado.workedHours.changeVsPreviousPeriod).toBeNull();
    });

    it('debe incluir la tendencia de los últimos 5 meses', async () => {
      const resultado = await service.getIndicators('2026-10-15', '2026-10-15');

      expect(resultado.workedHours.trend).toHaveLength(5);
      expect(resultado.workedHours.trend[4].month).toBe('Oct');
    });
  });

  describe('indicador de costos laborales', () => {
    it('debe sumar el neto pagado de las liquidaciones del período', async () => {
      payrollPeriodRepositoryMock.findAll.mockResolvedValueOnce([
        crearLiquidacion({ net_pay: 1650000, total_earnings: 1800000, total_deductions: 150000 }),
        crearLiquidacion({ net_pay: 1870000, total_earnings: 2100000, total_deductions: 230000 }),
      ]);

      const resultado = await service.getIndicators('2026-10-01', '2026-10-31');

      expect(resultado.laborCosts.total).toBe(3520000);
    });

    it('debe distribuir entre devengado y deducción', async () => {
      payrollPeriodRepositoryMock.findAll.mockResolvedValueOnce([
        crearLiquidacion({ net_pay: 1650000, total_earnings: 1800000, total_deductions: 200000 }),
      ]);

      const resultado = await service.getIndicators('2026-10-01', '2026-10-31');

      expect(resultado.laborCosts.distribution).toEqual([
        { category: 'Devengado', amount: 1800000, percentage: 90 },
        { category: 'Deduccion', amount: 200000, percentage: 10 },
      ]);
    });

    it('debe retornar null y distribución vacía cuando no hay liquidaciones', async () => {
      const resultado = await service.getIndicators('2026-10-01', '2026-10-31');

      expect(resultado.laborCosts.total).toBeNull();
      expect(resultado.laborCosts.distribution).toEqual([]);
    });
  });
});

function crearEmpleado(id: number): Employee {
  return Object.assign(new Employee(), { id, status: 'ACTIVO' });
}

function crearRegistro(
  fecha: string,
  overrides: Partial<AttendanceRecord> = {},
): AttendanceRecord {
  return Object.assign(new AttendanceRecord(), {
    check_in: new Date(`${fecha}T13:00:00.000Z`),
    work_minutes: 0,
    extra_day_minutes: 0,
    extra_night_minutes: 0,
    holiday_minutes: 0,
    ...overrides,
  });
}

function crearLiquidacion(overrides: Partial<PayrollPeriod> = {}): PayrollPeriod {
  return Object.assign(new PayrollPeriod(), overrides);
}
