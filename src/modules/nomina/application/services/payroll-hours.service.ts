import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { WorkRateConfig } from 'src/entities/work-rate-config.model';
import type { WorkdayConfig } from 'src/entities/workday-config.model';
import {
  PAYROLL_HOURS_REPOSITORY_PORT,
  type PayrollHoursRepositoryPort,
} from '../../domain/ports/payroll-hours.repository.port';
import {
  getColombiaDate,
  getColombiaMinutes,
} from 'src/shared/common/utils/colombia-date.util';
import { startOfWeek } from '../../domain/payroll-days';

export type TimePeriod = 'DIURNA' | 'NOCTURNA';
export type DayType = 'ORDINARY' | 'SUNDAY' | 'HOLIDAY';
export type WorkHourType =
  | 'ORDINARIA_DIURNA'
  | 'ORDINARIA_NOCTURNA'
  | 'EXTRA_DIURNA'
  | 'EXTRA_NOCTURNA'
  | 'DOMINICAL_DIURNA'
  | 'DOMINICAL_NOCTURNA'
  | 'EXTRA_DOMINICAL_DIURNA'
  | 'EXTRA_DOMINICAL_NOCTURNA';

export interface ClassifiedHour {
  start: Date;
  end: Date;
  hours: number;
  period: TimePeriod;
  dayType: DayType;
  isExtra: boolean;
  type: WorkHourType;
  multiplier: number;
  adjustedHours: number;
}

interface TimeSegment {
  start: Date;
  end: Date;
  hours: number;
  period: TimePeriod;
}

export interface WorkedInterval {
  start: Date;
  end: Date;
}

/** Resultado de una marcación: sus horas o el error que impide clasificarla. */
export type IntervalClassification =
  { segments: ClassifiedHour[] } | { error: HttpException };

/** Una marcación ya dividida en tramos diurnos y nocturnos. */
interface PreparedInterval {
  start: Date;
  config: WorkdayConfig;
  segments: TimeSegment[];
}

/** Horas ordinarias acumuladas por jornada (día de la entrada) y por semana. */
interface OrdinaryHours {
  byWorkday: Map<string, number>;
  byWeek: Map<string, number>;
}

@Injectable()
export class PayrollHoursService {
  constructor(
    @Inject(PAYROLL_HOURS_REPOSITORY_PORT)
    private readonly payrollHoursRepository: PayrollHoursRepositoryPort,
  ) {}

  async classifyWorkedInterval(
    employeeId: number,
    start: Date,
    end: Date,
  ): Promise<ClassifiedHour[]> {
    const [result] = await this.classifyWorkedIntervals(employeeId, [
      { start, end },
    ]);

    if ('error' in result) {
      throw result.error;
    }

    return result.segments;
  }

  /**
   * Clasifica las marcaciones de un empleado, en orden cronológico. Una hora es
   * extra si supera la jornada diaria o la semanal, así que las horas se
   * acumulan entre marcaciones:
   * - Por jornada: una marcación cuenta completa en el día de su entrada, aunque
   *   termine después de medianoche, y los turnos de un mismo día se suman.
   * - Por semana (lunes a domingo): las horas que ya fueron extra por la jornada
   *   diaria no vuelven a contar para el límite semanal.
   *
   * `previousIntervals` son marcaciones anteriores de la semana, que no se
   * clasifican: solo cuentan para el acumulado.
   */
  async classifyWorkedIntervals(
    employeeId: number,
    intervals: WorkedInterval[],
    previousIntervals: WorkedInterval[] = [],
  ): Promise<IntervalClassification[]> {
    this.validateEmployeeId(employeeId);

    const [previous, current] = await Promise.all([
      Promise.all(previousIntervals.map((item) => this.prepareInterval(item))),
      Promise.all(intervals.map((item) => this.prepareInterval(item))),
    ]);
    const ordinaryHours: OrdinaryHours = {
      byWorkday: new Map(),
      byWeek: new Map(),
    };

    for (const prepared of previous) {
      if (!('error' in prepared)) {
        this.splitExtraHours(prepared, ordinaryHours);
      }
    }

    const splitIntervals = current.map((prepared) =>
      'error' in prepared
        ? prepared
        : { segments: this.splitExtraHours(prepared, ordinaryHours) },
    );

    return Promise.all(
      splitIntervals.map(async (interval) => {
        if ('error' in interval) {
          return interval;
        }

        try {
          return {
            segments: await Promise.all(
              interval.segments.map((segment) =>
                this.classifySegment(employeeId, segment),
              ),
            ),
          };
        } catch (error) {
          return { error: this.asHttpException(error) };
        }
      }),
    );
  }

  private async prepareInterval({
    start,
    end,
  }: WorkedInterval): Promise<PreparedInterval | { error: HttpException }> {
    try {
      this.validateInterval(start, end);

      const config = await this.getWorkdayConfig(start);

      return {
        start,
        config,
        segments: this.classifyTimePeriod(start, end, config),
      };
    } catch (error) {
      return { error: this.asHttpException(error) };
    }
  }

  private asHttpException(error: unknown): HttpException {
    if (error instanceof HttpException) {
      return error;
    }

    throw error;
  }

  private async classifySegment(
    employeeId: number,
    segment: TimeSegment & { isExtra: boolean },
  ): Promise<ClassifiedHour> {
    const dayType = await this.determineDayType(employeeId, segment.start);
    const type = this.buildWorkHourType(
      segment.period,
      dayType,
      segment.isExtra,
    );
    const rate = await this.getWorkRate(type, segment.start);

    return {
      ...segment,
      dayType,
      type,
      multiplier: Number(rate.multiplier),
      adjustedHours: this.calculateAdjustedHours(
        segment.hours,
        Number(rate.multiplier),
      ),
    };
  }

  private async getWorkdayConfig(date: Date): Promise<WorkdayConfig> {
    const config = await this.payrollHoursRepository.findWorkdayConfig(date);

    if (!config) {
      throw new NotFoundException(
        `No existe configuración de jornada vigente para ${date.toISOString()}`,
      );
    }

    this.validateWorkdayConfig(config);
    return config;
  }

  private async getWorkRate(
    type: WorkHourType,
    date: Date,
  ): Promise<WorkRateConfig> {
    const rate = await this.payrollHoursRepository.findWorkRateConfig(
      type,
      date,
    );

    if (!rate) {
      throw new NotFoundException(
        `No existe multiplicador para ${type} vigente para ${date.toISOString()}`,
      );
    }

    return rate;
  }

  private classifyTimePeriod(
    start: Date,
    end: Date,
    config: WorkdayConfig,
  ): TimeSegment[] {
    const boundaries = this.getBoundaries(start, end, config);
    const segments: TimeSegment[] = [];

    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const segmentStart = boundaries[index];
      const segmentEnd = boundaries[index + 1];
      const period = this.determinePeriod(segmentStart, config);

      if (period) {
        segments.push({
          start: segmentStart,
          end: segmentEnd,
          hours: this.calculateHours(segmentStart, segmentEnd),
          period,
        });
      }
    }

    return segments;
  }

  private getBoundaries(start: Date, end: Date, config: WorkdayConfig): Date[] {
    const boundaries = new Set<number>([start.getTime(), end.getTime()]);

    let currentDate = this.getColombiaDate(start);
    const lastDate = this.getColombiaDate(end);

    while (currentDate <= lastDate) {
      // Límites de la jornada para este día colombiano.
      for (const time of [
        config.day_start,
        config.day_end,
        config.night_start,
        config.night_end,
      ]) {
        const boundary = this.createColombiaDateTime(currentDate, time);

        if (boundary > start && boundary < end) {
          boundaries.add(boundary.getTime());
        }
      }

      // Medianoche colombiana del día siguiente.
      const nextDate = this.addColombiaDays(currentDate, 1);
      const midnight = this.createColombiaDateTime(nextDate, '00:00');

      if (midnight > start && midnight < end) {
        boundaries.add(midnight.getTime());
      }

      currentDate = nextDate;
    }

    return [...boundaries]
      .sort((a, b) => a - b)
      .map((timestamp) => new Date(timestamp));
  }

  private addColombiaDays(date: string, days: number): string {
    const calendarDate = new Date(`${date}T12:00:00Z`);
    calendarDate.setUTCDate(calendarDate.getUTCDate() + days);
    return calendarDate.toISOString().slice(0, 10);
  }

  private createColombiaDateTime(date: string, time: string): Date {
    const minutes = this.parseTime(time);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    const timeString =
      `${String(hours).padStart(2, '0')}:` +
      `${String(remainingMinutes).padStart(2, '0')}:00`;

    // Colombia utiliza UTC-5 y no aplica horario de verano.
    return new Date(`${date}T${timeString}-05:00`);
  }

  private determinePeriod(
    date: Date,
    config: WorkdayConfig,
  ): TimePeriod | null {
    const time = this.getMinutesFromMidnight(date);
    const dayStart = this.parseTime(config.day_start);
    const dayEnd = this.parseTime(config.day_end);
    const nightStart = this.parseTime(config.night_start);
    const nightEnd = this.parseTime(config.night_end);

    if (time >= dayStart && time < dayEnd) {
      return 'DIURNA';
    }

    if (nightStart > nightEnd) {
      if (time >= nightStart || time < nightEnd) {
        return 'NOCTURNA';
      }
    } else if (time >= nightStart && time < nightEnd) {
      return 'NOCTURNA';
    }

    return null;
  }

  private async determineDayType(
    employeeId: number,
    date: Date,
  ): Promise<DayType> {
    const isHoliday = await this.payrollHoursRepository.isHoliday(date);

    if (isHoliday) {
      return 'HOLIDAY';
    }

    const colombiaDate = this.getColombiaDate(date);
    const calendarDate = new Date(`${colombiaDate}T12:00:00Z`);

    return calendarDate.getUTCDay() === 0 ? 'SUNDAY' : 'ORDINARY';
  }

  private splitExtraHours(
    { start, config, segments }: PreparedInterval,
    ordinaryHours: OrdinaryHours,
  ): Array<TimeSegment & { isExtra: boolean }> {
    const workday = this.getColombiaDate(start);
    const week = startOfWeek(workday);
    const result: Array<TimeSegment & { isExtra: boolean }> = [];

    for (const segment of segments) {
      const dayHours = ordinaryHours.byWorkday.get(workday) ?? 0;
      const weekHours = ordinaryHours.byWeek.get(week) ?? 0;
      const remainingCapacity = Math.max(
        0,
        Math.min(
          Number(config.max_day_hours) - dayHours,
          Number(config.max_week_hours) - weekHours,
        ),
      );
      const ordinary = Math.min(segment.hours, remainingCapacity);
      const extra = Number((segment.hours - ordinary).toFixed(2));
      const splitAt = segment.start.getTime() + ordinary * 3_600_000;

      if (ordinary > 0) {
        result.push({
          ...segment,
          end: new Date(splitAt),
          hours: ordinary,
          isExtra: false,
        });
      }

      if (extra > 0) {
        result.push({
          ...segment,
          start: new Date(splitAt),
          hours: extra,
          isExtra: true,
        });
      }

      ordinaryHours.byWorkday.set(workday, dayHours + ordinary);
      ordinaryHours.byWeek.set(week, weekHours + ordinary);
    }

    return result;
  }

  private getColombiaDate(date: Date): string {
    return getColombiaDate(date);
  }

  private buildWorkHourType(
    period: TimePeriod,
    dayType: DayType,
    isExtra: boolean,
  ): WorkHourType {
    const periodSuffix = period === 'DIURNA' ? 'DIURNA' : 'NOCTURNA';
    const dayPrefix =
      dayType === 'SUNDAY' || dayType === 'HOLIDAY' ? 'DOMINICAL' : 'ORDINARIA';

    if (isExtra) {
      return `${dayType === 'ORDINARY' ? 'EXTRA' : 'EXTRA_DOMINICAL'}_${periodSuffix}` as WorkHourType;
    }

    return `${dayPrefix}_${periodSuffix}` as WorkHourType;
  }

  private calculateAdjustedHours(hours: number, multiplier: number): number {
    return Number((hours * multiplier).toFixed(2));
  }

  private calculateHours(start: Date, end: Date): number {
    return Number(((end.getTime() - start.getTime()) / 3_600_000).toFixed(2));
  }

  private parseTime(value: string): number {
    const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value);

    if (!match) {
      throw new BadRequestException(`Horario inválido: ${value}`);
    }

    return Number(match[1]) * 60 + Number(match[2]);
  }

  private getMinutesFromMidnight(date: Date): number {
    return getColombiaMinutes(date);
  }

  private startOfUtcDay(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private createDateWithTime(date: Date, time: string): Date {
    const minutes = this.parseTime(time);
    return new Date(
      date.getTime() +
        Math.floor(minutes / 60) * 3_600_000 +
        (minutes % 60) * 60_000,
    );
  }

  private validateEmployeeId(employeeId: number): void {
    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      throw new BadRequestException(
        'El identificador del empleado debe ser un entero mayor que cero.',
      );
    }
  }

  private validateInterval(start: Date, end: Date): void {
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException(
        'Las fechas de entrada y salida deben ser válidas.',
      );
    }

    if (end <= start) {
      throw new BadRequestException(
        'La fecha de salida debe ser posterior a la fecha de entrada.',
      );
    }
  }

  private validateWorkdayConfig(config: WorkdayConfig): void {
    const dayStart = this.parseTime(config.day_start);
    const dayEnd = this.parseTime(config.day_end);
    const nightStart = this.parseTime(config.night_start);
    const nightEnd = this.parseTime(config.night_end);

    if (dayStart >= dayEnd) {
      throw new BadRequestException(
        'La jornada diurna debe terminar después de iniciar.',
      );
    }

    if (nightStart === nightEnd) {
      throw new BadRequestException(
        'La configuración nocturna debe definir horarios distintos.',
      );
    }

    if (config.max_day_hours <= 0 || config.max_week_hours <= 0) {
      throw new BadRequestException(
        'Los máximos diarios y semanales deben ser mayores que cero.',
      );
    }

    const dayStartInDay = dayStart;
    const dayEndInDay = dayEnd;
    const nightStartInDay = nightStart;
    const nightEndInDay = nightEnd;
    const dayEndNormalized =
      dayEndInDay > dayStartInDay ? dayEndInDay : dayEndInDay + 24 * 60;
    const nightEndNormalized =
      nightEndInDay > nightStartInDay ? nightEndInDay : nightEndInDay + 24 * 60;

    if (
      dayStartInDay < nightEndNormalized &&
      nightStartInDay < dayEndNormalized
    ) {
      throw new BadRequestException(
        'La configuración nocturna no puede solaparse con la jornada diurna.',
      );
    }
  }
}
