import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AUDIT_PORT } from 'src/application/ports/audit/audit.port';
import type { AuditPort } from 'src/application/ports/audit/audit.port';
import type { AuthUser } from 'src/application/ports/auth/auth-user';
import { WorkdayConfig } from 'src/entities';
import { getColombiaDate } from 'src/shared/common/utils/colombia-date.util';
import { VigenciaSuperpuestaError } from '../../domain/errors/vigencia-superpuesta.error';
import {
  WORKDAY_CONFIG_REPOSITORY_PORT,
  type WorkdayConfigRepositoryPort,
} from '../../domain/ports/workday-config.repository.port';
import { aDate, aFechaCalendario, diaAnterior } from '../../domain/vigencia';
import { RegistrarJornadaLaboralCommand } from '../commands/workday-config.commands';

const DIAS_POR_SEMANA = 7;

const CAMPOS_JORNADA = [
  'maxWeekHours',
  'maxDayHours',
  'dayStart',
  'dayEnd',
  'nightStart',
  'nightEnd',
] as const;

type ValoresJornada = Pick<
  RegistrarJornadaLaboralCommand,
  (typeof CAMPOS_JORNADA)[number]
>;

@Injectable()
export class WorkdayConfigService {
  constructor(
    @Inject(WORKDAY_CONFIG_REPOSITORY_PORT)
    private readonly workdayConfigRepository: WorkdayConfigRepositoryPort,

    @Inject(AUDIT_PORT)
    private readonly auditPort: AuditPort,
  ) {}

  obtenerHistorial(): Promise<WorkdayConfig[]> {
    return this.workdayConfigRepository.findAll();
  }

  async obtenerVigente(fecha?: string): Promise<WorkdayConfig> {
    const fechaConsulta = fecha ?? this.fechaActual();
    const version =
      await this.workdayConfigRepository.findVigente(fechaConsulta);

    if (!version) {
      throw new NotFoundException(
        `No existe una configuración de jornada laboral vigente para la fecha ${fechaConsulta}.`,
      );
    }

    return version;
  }

  /**
   * Las versiones existentes nunca se modifican: cada cambio crea una versión
   * nueva y solo cierra la vigencia de la anterior, de modo que los cálculos
   * ya procesados conservan los valores con los que se hicieron.
   */
  async registrar(
    command: RegistrarJornadaLaboralCommand,
    actor: AuthUser,
  ): Promise<WorkdayConfig> {
    try {
      this.validarJornada(command);
      this.validarInicioDeVigencia(command.validFrom);

      const anterior = await this.workdayConfigRepository.findUltima();

      if (anterior) {
        this.validarVigenciaPosterior(command.validFrom, anterior);
      }

      const cambios = this.construirCambios(
        anterior ? this.obtenerValores(anterior) : null,
        command,
      );

      if (anterior && Object.keys(cambios).length === 0) {
        throw new BadRequestException(
          'Los valores indicados son iguales a los de la última versión de la jornada laboral: no hay cambios para guardar.',
        );
      }

      const versionCreada = await this.workdayConfigRepository.registrarVersion(
        this.construirVersion(command),
        anterior
          ? {
              id: anterior.id,
              validTo: aDate(diaAnterior(command.validFrom)),
            }
          : undefined,
      );

      // Se audita quién hizo el cambio y el valor anterior y nuevo de cada parámetro.
      this.auditPort.log({
        action: 'WORKDAY_CONFIG_VERSION_CREATED',
        module: 'Parámetros de nómina',
        resource: 'WorkdayConfig',
        resourceId: versionCreada.id,
        result: 'SUCCESS',
        message: `Se registró una versión de la jornada laboral vigente desde ${command.validFrom}.`,
        metadata: {
          performedBy: actor.id,
          performedByEmail: actor.email,
          validFrom: command.validFrom,
          previousVersionId: anterior?.id ?? null,
          changes: cambios,
        },
      });

      return versionCreada;
    } catch (error) {
      this.auditPort.log({
        action: 'WORKDAY_CONFIG_VERSION_CREATE_FAILED',
        module: 'Parámetros de nómina',
        resource: 'WorkdayConfig',
        result: 'FAILED',
        message: 'Falló el registro de una versión de la jornada laboral.',
        metadata: {
          performedBy: actor.id,
          performedByEmail: actor.email,
          validFrom: command.validFrom,
          error: error instanceof Error ? error.message : String(error),
        },
      });

      throw this.traducirError(error);
    }
  }

  /**
   * Además de las restricciones que exige el cálculo de horas al usar la
   * jornada, la franja nocturna debe ser el complemento de la diurna: una hora
   * que no pertenezca a ninguna quedaría sin clasificar y no se liquidaría.
   */
  private validarJornada(command: RegistrarJornadaLaboralCommand): void {
    if (command.maxWeekHours < command.maxDayHours) {
      throw new BadRequestException(
        'La jornada máxima semanal no puede ser menor que la jornada máxima diaria.',
      );
    }

    if (command.maxWeekHours > command.maxDayHours * DIAS_POR_SEMANA) {
      throw new BadRequestException(
        'La jornada máxima semanal no puede superar siete veces la jornada máxima diaria.',
      );
    }

    const dayStart = this.aMinutos(command.dayStart);
    const dayEnd = this.aMinutos(command.dayEnd);
    const nightStart = this.aMinutos(command.nightStart);
    const nightEnd = this.aMinutos(command.nightEnd);

    if (dayStart >= dayEnd) {
      throw new BadRequestException(
        'La jornada diurna debe terminar después de iniciar.',
      );
    }

    if (nightStart !== dayEnd || nightEnd !== dayStart) {
      throw new BadRequestException(
        'La jornada nocturna debe iniciar cuando termina la diurna y terminar cuando esta inicia, para que todas las horas del día queden clasificadas.',
      );
    }
  }

  /** Los cambios solo aplican hacia adelante: no se reescribe qué valor regía en una fecha pasada. */
  private validarInicioDeVigencia(validFrom: string): void {
    const hoy = this.fechaActual();

    if (validFrom < hoy) {
      throw new BadRequestException(
        `La fecha de inicio de vigencia no puede ser anterior a la fecha actual (${hoy}).`,
      );
    }
  }

  private validarVigenciaPosterior(
    validFrom: string,
    anterior: WorkdayConfig,
  ): void {
    const inicioAnterior = aFechaCalendario(anterior.valid_from);

    if (validFrom <= inicioAnterior) {
      throw new ConflictException(
        `Ya existe una versión de la jornada laboral con vigencia desde ${inicioAnterior}. La nueva vigencia debe iniciar después de esa fecha para no superponerse.`,
      );
    }
  }

  private construirVersion(
    command: RegistrarJornadaLaboralCommand,
  ): WorkdayConfig {
    const version = new WorkdayConfig();

    version.max_week_hours = command.maxWeekHours;
    version.max_day_hours = command.maxDayHours;
    version.day_start = command.dayStart;
    version.day_end = command.dayEnd;
    version.night_start = command.nightStart;
    version.night_end = command.nightEnd;
    version.valid_from = aDate(command.validFrom);
    // Sin fecha de fin: rige hasta que se registre la siguiente versión.
    version.valid_to = null;

    return version;
  }

  private obtenerValores(version: WorkdayConfig): ValoresJornada {
    return {
      maxWeekHours: version.max_week_hours,
      maxDayHours: version.max_day_hours,
      dayStart: this.aHoraCorta(version.day_start),
      dayEnd: this.aHoraCorta(version.day_end),
      nightStart: this.aHoraCorta(version.night_start),
      nightEnd: this.aHoraCorta(version.night_end),
    };
  }

  private construirCambios(
    valoresAnteriores: ValoresJornada | null,
    valoresNuevos: ValoresJornada,
  ): Record<string, unknown> {
    const cambios: Record<string, unknown> = {};

    for (const campo of CAMPOS_JORNADA) {
      const anterior = valoresAnteriores ? valoresAnteriores[campo] : null;

      if (anterior !== valoresNuevos[campo]) {
        cambios[campo] = {
          anterior,
          nuevo: valoresNuevos[campo],
        };
      }
    }

    return cambios;
  }

  private fechaActual(): string {
    return getColombiaDate(new Date());
  }

  private aMinutos(hora: string): number {
    const [horas, minutos] = hora.split(':').map(Number);

    return horas * 60 + minutos;
  }

  /** La columna `time` devuelve HH:mm:ss; los valores se manejan como HH:mm. */
  private aHoraCorta(hora: string): string {
    return hora.slice(0, 5);
  }

  private traducirError(error: unknown): unknown {
    if (error instanceof VigenciaSuperpuestaError) {
      return new ConflictException(error.message);
    }

    return error;
  }
}
