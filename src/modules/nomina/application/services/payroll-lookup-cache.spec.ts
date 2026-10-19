import type { WorkRateConfig, WorkdayConfig } from 'src/entities';
import type { PayrollHoursRepositoryPort } from '../../domain/ports/payroll-hours.repository.port';
import type { SystemConfigRepositoryPort } from '../../domain/ports/system-config-repository.port';
import {
  cachePayrollHoursLookups,
  cacheSystemConfigLookups,
} from './payroll-lookup-cache';

describe('cacheSystemConfigLookups', () => {
  const repository: jest.Mocked<SystemConfigRepositoryPort> = {
    getValue: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repository.getValue.mockResolvedValue(4);
  });

  it('consulta cada clave una sola vez por fecha', async () => {
    const cached = cacheSystemConfigLookups(repository);
    const payrollDate = new Date(2026, 8, 30, 12);

    await Promise.all([
      cached.getValue('HEALTH_RATE', payrollDate),
      cached.getValue('HEALTH_RATE', payrollDate),
      cached.getValue('PENSION_RATE', payrollDate),
    ]);
    await cached.getValue('HEALTH_RATE', new Date(2026, 9, 31, 12));

    expect(repository.getValue).toHaveBeenCalledTimes(3);
  });

  it('entrega el valor consultado al repositorio', async () => {
    repository.getValue.mockResolvedValue(null);

    await expect(
      cacheSystemConfigLookups(repository).getValue(
        'MINIMUM_WAGE',
        new Date(2026, 8, 30, 12),
      ),
    ).resolves.toBeNull();
  });
});

describe('cachePayrollHoursLookups', () => {
  const repository: jest.Mocked<PayrollHoursRepositoryPort> = {
    findWorkdayConfig: jest.fn(),
    findWorkRateConfig: jest.fn(),
    isHoliday: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findWorkdayConfig.mockResolvedValue({
      max_day_hours: 8,
    } as WorkdayConfig);
    repository.findWorkRateConfig.mockResolvedValue({
      multiplier: 1.25,
    } as WorkRateConfig);
    repository.isHoliday.mockResolvedValue(false);
  });

  it('consulta una sola vez cada parámetro por día colombiano', async () => {
    const cached = cachePayrollHoursLookups(repository);
    const morning = new Date('2026-09-07T08:00:00-05:00');
    const night = new Date('2026-09-07T23:30:00-05:00');

    await Promise.all([
      cached.findWorkdayConfig(morning),
      cached.findWorkdayConfig(night),
      cached.findWorkRateConfig('EXTRA_DIURNA', morning),
      cached.findWorkRateConfig('EXTRA_DIURNA', night),
      cached.isHoliday(morning),
      cached.isHoliday(night),
    ]);

    expect(repository.findWorkdayConfig).toHaveBeenCalledTimes(1);
    expect(repository.findWorkRateConfig).toHaveBeenCalledTimes(1);
    expect(repository.isHoliday).toHaveBeenCalledTimes(1);
  });

  it('distingue los días y los tipos de hora', async () => {
    const cached = cachePayrollHoursLookups(repository);
    const monday = new Date('2026-09-07T08:00:00-05:00');
    const tuesday = new Date('2026-09-08T08:00:00-05:00');

    await cached.findWorkRateConfig('EXTRA_DIURNA', monday);
    await cached.findWorkRateConfig('EXTRA_NOCTURNA', monday);
    await cached.findWorkRateConfig('EXTRA_DIURNA', tuesday);
    await cached.isHoliday(monday);
    await cached.isHoliday(tuesday);

    expect(repository.findWorkRateConfig).toHaveBeenCalledTimes(3);
    expect(repository.isHoliday).toHaveBeenCalledTimes(2);
  });

  it('usa el día colombiano y no el día UTC', async () => {
    const cached = cachePayrollHoursLookups(repository);

    // 20:00 y 23:00 del 7 de septiembre en Colombia ya son 8 de septiembre en UTC.
    await cached.isHoliday(new Date('2026-09-07T20:00:00-05:00'));
    await cached.isHoliday(new Date('2026-09-07T23:00:00-05:00'));
    await cached.isHoliday(new Date('2026-09-07T10:00:00-05:00'));

    expect(repository.isHoliday).toHaveBeenCalledTimes(1);
  });

  it('no comparte valores entre cálculos distintos', async () => {
    const date = new Date('2026-09-07T08:00:00-05:00');

    await cachePayrollHoursLookups(repository).findWorkdayConfig(date);
    await cachePayrollHoursLookups(repository).findWorkdayConfig(date);

    expect(repository.findWorkdayConfig).toHaveBeenCalledTimes(2);
  });
});
