import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { WorkRateConfig } from 'src/entities/work-rate-config.model';
import type { WorkdayConfig } from 'src/entities/workday-config.model';
import {
  PAYROLL_HOURS_REPOSITORY_PORT,
  type PayrollHoursRepositoryPort,
} from '../../domain/ports/payroll-hours.repository.port';
import { PayrollHoursService } from './payroll-hours.service';

describe('PayrollHoursService', () => {
  const repository: jest.Mocked<PayrollHoursRepositoryPort> = {
    findWorkdayConfig: jest.fn(),
    findWorkRateConfig: jest.fn(),
    isHoliday: jest.fn(),
  };

  let service: PayrollHoursService;

  beforeEach(() => {
    jest.clearAllMocks();
    repository.isHoliday.mockResolvedValue(false);
    service = new PayrollHoursService(repository);
  });

  const workdayConfig = {
    id: 1,
    max_week_hours: 44,
    max_day_hours: 8,
    day_start: '08:00',
    day_end: '17:00',
    night_start: '21:00',
    night_end: '06:00',
    valid_from: new Date('2026-01-01'),
    valid_to: null,
  } as WorkdayConfig;

  const rate = {
    type: 'DIURNA',
    multiplier: 1,
    valid_from: new Date('2026-01-01'),
    valid_to: null,
  } as WorkRateConfig;

  it('divide un intervalo que atraviesa la noche en segmentos diurnos y nocturnos', async () => {
    repository.findWorkdayConfig.mockResolvedValue({
      ...workdayConfig,
      max_day_hours: 12,
      day_start: '20:00',
      day_end: '21:00',
      night_start: '21:00',
      night_end: '06:00',
    } as WorkdayConfig);
    repository.findWorkRateConfig.mockImplementation(
      async (type) =>
        ({
          ...rate,
          type,
          multiplier: type.includes('NOCTURNA') ? 1.25 : 1,
        }) as WorkRateConfig,
    );

    const start = new Date('2026-03-10T20:00:00-05:00');
    const end = new Date('2026-03-11T06:00:00-05:00');

    const result = await service.classifyWorkedInterval(7, start, end);

    expect(result).toEqual([
      expect.objectContaining({
        start,
        end: new Date('2026-03-10T21:00:00-05:00'),
        hours: 1,
        period: 'DIURNA',
        type: 'ORDINARIA_DIURNA',
      }),
      expect.objectContaining({
        start: new Date('2026-03-10T21:00:00-05:00'),
        end: new Date('2026-03-11T00:00:00-05:00'),
        hours: 3,
        period: 'NOCTURNA',
        type: 'ORDINARIA_NOCTURNA',
      }),
      expect.objectContaining({
        start: new Date('2026-03-11T00:00:00-05:00'),
        end,
        hours: 6,
        period: 'NOCTURNA',
        type: 'ORDINARIA_NOCTURNA',
        multiplier: 1.25,
        adjustedHours: 7.5,
      }),
    ]);
    expect(repository.findWorkdayConfig).toHaveBeenCalledWith(start);
  });

  it('usa la configuración válida más reciente para la fecha de inicio', async () => {
    const currentConfig = {
      ...workdayConfig,
      id: 2,
      day_start: '07:00',
      day_end: '16:00',
      night_start: '20:00',
      night_end: '05:00',
    };

    repository.findWorkdayConfig.mockResolvedValue(currentConfig);
    repository.findWorkRateConfig.mockResolvedValue(rate);

    // 09:00 a 10:00, hora colombiana (UTC-5).
    const start = new Date('2026-07-01T09:00:00-05:00');
    const end = new Date('2026-07-01T10:00:00-05:00');

    const result = await service.classifyWorkedInterval(7, start, end);

    expect(result).toEqual([
      expect.objectContaining({
        start,
        end,
        hours: 1,
        period: 'DIURNA',
        type: 'ORDINARIA_DIURNA',
        multiplier: 1,
        adjustedHours: 1,
      }),
    ]);

    expect(repository.findWorkdayConfig).toHaveBeenCalledWith(start);
  });

  it('lanza 404 cuando no existe una configuración vigente', async () => {
    repository.findWorkdayConfig.mockResolvedValue(null);

    await expect(
      service.classifyWorkedInterval(
        7,
        new Date('2026-03-10T20:00:00.000Z'),
        new Date('2026-03-10T21:00:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza un intervalo con fecha de salida anterior a la entrada', async () => {
    repository.findWorkdayConfig.mockResolvedValue(workdayConfig);

    await expect(
      service.classifyWorkedInterval(
        7,
        new Date('2026-03-10T21:00:00.000Z'),
        new Date('2026-03-10T20:00:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('separa las horas ordinarias y extra dentro del mismo día', async () => {
    repository.findWorkdayConfig.mockResolvedValue(workdayConfig);

    repository.findWorkRateConfig.mockImplementation(
      async (type) =>
        ({
          ...rate,
          type,
          multiplier: type.includes('EXTRA') ? 1.5 : 1,
        }) as WorkRateConfig,
    );

    // 08:00 a 18:00 en hora colombiana (UTC-5).
    const start = new Date('2026-03-11T08:00:00-05:00');
    const end = new Date('2026-03-11T18:00:00-05:00');

    const result = await service.classifyWorkedInterval(7, start, end);

    expect(result).toHaveLength(2);

    expect(result).toEqual([
      expect.objectContaining({
        start,
        end: new Date('2026-03-11T16:00:00-05:00'),
        hours: 8,
        period: 'DIURNA',
        dayType: 'ORDINARY',
        isExtra: false,
        type: 'ORDINARIA_DIURNA',
        multiplier: 1,
        adjustedHours: 8,
      }),
      expect.objectContaining({
        start: new Date('2026-03-11T16:00:00-05:00'),
        end: new Date('2026-03-11T17:00:00-05:00'),
        hours: 1,
        period: 'DIURNA',
        dayType: 'ORDINARY',
        isExtra: true,
        type: 'EXTRA_DIURNA',
        multiplier: 1.5,
        adjustedHours: 1.5,
      }),
    ]);

    expect(repository.findWorkRateConfig).toHaveBeenCalledTimes(2);
  });

  it('clasifica un domingo como DOMINICAL y un festivo como HOLIDAY', async () => {
    repository.findWorkdayConfig.mockResolvedValue(workdayConfig);
    repository.findWorkRateConfig.mockResolvedValue(rate);

    const sundayStart = new Date('2026-03-15T08:00:00-05:00');
    const sundayEnd = new Date('2026-03-15T09:00:00-05:00');

    // El 15 de marzo de 2026 es domingo.
    repository.isHoliday.mockResolvedValueOnce(false);

    const sundayResult = await service.classifyWorkedInterval(
      7,
      sundayStart,
      sundayEnd,
    );

    expect(sundayResult[0]).toMatchObject({
      period: 'DIURNA',
      type: 'DOMINICAL_DIURNA',
      dayType: 'SUNDAY',
    });

    // Simula que la fecha se encuentra registrada como festivo.
    repository.isHoliday.mockResolvedValueOnce(true);

    const holidayResult = await service.classifyWorkedInterval(
      7,
      sundayStart,
      sundayEnd,
    );

    expect(holidayResult[0]).toMatchObject({
      period: 'DIURNA',
      type: 'DOMINICAL_DIURNA',
      dayType: 'HOLIDAY',
    });
  });

  it('rechaza una configuración de jornada con horarios solapados', async () => {
    repository.findWorkdayConfig.mockResolvedValue({
      ...workdayConfig,
      day_start: '17:00',
      day_end: '08:00',
      night_start: '21:00',
      night_end: '06:00',
    });

    await expect(
      service.classifyWorkedInterval(
        7,
        new Date('2026-03-10T20:00:00.000Z'),
        new Date('2026-03-10T21:00:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('horas extra entre marcaciones', () => {
    const jornada = {
      ...workdayConfig,
      max_day_hours: 8,
      max_week_hours: 42,
      day_start: '06:00',
      day_end: '19:00',
      night_start: '19:00',
      night_end: '06:00',
    } as WorkdayConfig;
    const intervalo = (inicio: string, fin: string) => ({
      start: new Date(`${inicio}-05:00`),
      end: new Date(`${fin}-05:00`),
    });
    const horasExtra = (
      resultado: Awaited<ReturnType<typeof service.classifyWorkedIntervals>>,
    ) =>
      resultado.flatMap((item) =>
        'error' in item
          ? []
          : item.segments
              .filter((segment) => segment.isExtra)
              .map((segment) => [segment.type, segment.hours]),
      );

    beforeEach(() => {
      repository.findWorkdayConfig.mockResolvedValue(jornada);
      repository.findWorkRateConfig.mockImplementation(
        async (type) => ({ ...rate, type, multiplier: 1.25 }) as WorkRateConfig,
      );
    });

    it('suma los turnos del mismo día para la jornada diaria', async () => {
      // Martes 3 de noviembre: 5 h + 5 h, las 2 últimas son extra.
      const resultado = await service.classifyWorkedIntervals(7, [
        intervalo('2026-11-03T08:00:00', '2026-11-03T13:00:00'),
        intervalo('2026-11-03T15:00:00', '2026-11-03T20:00:00'),
      ]);

      expect(horasExtra(resultado)).toEqual([
        ['EXTRA_DIURNA', 1],
        ['EXTRA_NOCTURNA', 1],
      ]);
    });

    it('cuenta como una sola jornada el turno que cruza la medianoche', async () => {
      const resultado = await service.classifyWorkedIntervals(7, [
        intervalo('2026-11-03T16:00:00', '2026-11-04T02:00:00'),
      ]);

      expect(horasExtra(resultado)).toEqual([['EXTRA_NOCTURNA', 2]]);
    });

    it('no suma para la jornada el turno de otro día', async () => {
      const resultado = await service.classifyWorkedIntervals(7, [
        intervalo('2026-11-03T22:00:00', '2026-11-04T02:00:00'),
        intervalo('2026-11-04T08:00:00', '2026-11-04T16:00:00'),
      ]);

      expect(horasExtra(resultado)).toEqual([]);
    });

    it('paga como extra lo que supera el límite semanal', async () => {
      // Lunes a sábado, 8 h diarias: 48 h con un límite de 42.
      const resultado = await service.classifyWorkedIntervals(
        7,
        ['02', '03', '04', '05', '06', '07'].map((dia) =>
          intervalo(`2026-11-${dia}T08:00:00`, `2026-11-${dia}T16:00:00`),
        ),
      );

      expect(horasExtra(resultado)).toEqual([['EXTRA_DIURNA', 6]]);
    });

    it('no cuenta para el límite semanal las horas que ya fueron extra por el día', async () => {
      // 10 h de lunes a jueves (8 ordinarias y 2 extra cada día) y 8 h el viernes: 40 ordinarias.
      const resultado = await service.classifyWorkedIntervals(7, [
        ...['02', '03', '04', '05'].map((dia) =>
          intervalo(`2026-11-${dia}T07:00:00`, `2026-11-${dia}T17:00:00`),
        ),
        intervalo('2026-11-06T08:00:00', '2026-11-06T16:00:00'),
      ]);

      expect(horasExtra(resultado)).toEqual([
        ['EXTRA_DIURNA', 2],
        ['EXTRA_DIURNA', 2],
        ['EXTRA_DIURNA', 2],
        ['EXTRA_DIURNA', 2],
      ]);
    });

    it('reinicia el acumulado semanal cada lunes', async () => {
      const semana = (dias: string[]) =>
        dias.map((dia) =>
          intervalo(`2026-11-${dia}T08:00:00`, `2026-11-${dia}T16:00:00`),
        );

      const resultado = await service.classifyWorkedIntervals(7, [
        ...semana(['02', '03', '04', '05', '06']),
        ...semana(['09', '10']),
      ]);

      expect(horasExtra(resultado)).toEqual([]);
    });

    it('cuenta las marcaciones previas de la semana sin clasificarlas', async () => {
      const previas = ['02', '03', '04', '05', '06'].map((dia) =>
        intervalo(`2026-11-${dia}T08:00:00`, `2026-11-${dia}T16:00:00`),
      );

      const resultado = await service.classifyWorkedIntervals(
        7,
        [intervalo('2026-11-07T08:00:00', '2026-11-07T16:00:00')],
        previas,
      );

      expect(resultado).toHaveLength(1);
      expect(horasExtra(resultado)).toEqual([['EXTRA_DIURNA', 6]]);
      // Solo se consultan los multiplicadores de la marcación clasificada.
      expect(repository.findWorkRateConfig).toHaveBeenCalledTimes(2);
    });

    it('informa el error de una marcación sin afectar las demás', async () => {
      const resultado = await service.classifyWorkedIntervals(7, [
        intervalo('2026-11-03T13:00:00', '2026-11-03T08:00:00'),
        intervalo('2026-11-04T08:00:00', '2026-11-04T16:00:00'),
      ]);

      expect(resultado[0]).toEqual({ error: expect.any(BadRequestException) });
      expect(resultado[1]).toMatchObject({
        segments: [expect.objectContaining({ hours: 8, isExtra: false })],
      });
    });
  });
});
