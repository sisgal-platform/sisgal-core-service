import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { AUDIT_PORT } from 'src/application/ports/audit/audit.port';
import type { AuditPort } from 'src/application/ports/audit/audit.port';
import type { AuthUser } from 'src/application/ports/auth/auth-user';
import { WorkRateConfig } from 'src/entities';
import { getColombiaDate } from 'src/shared/common/utils/colombia-date.util';
import { VigenciaSuperpuestaError } from '../../domain/errors/vigencia-superpuesta.error';
import {
  WORK_RATE_CONFIG_REPOSITORY_PORT,
  type WorkRateConfigRepositoryPort,
} from '../../domain/ports/work-rate-config.repository.port';
import {
  aDate,
  aFechaCalendario,
  diaAnterior,
  type CierreDeVersion,
} from '../../domain/vigencia';
import {
  NOMBRE_TIPO_HORA,
  WorkRateType,
} from '../../domain/work-rate-type.enum';
import {
  RecargoCommand,
  RegistrarRecargosCommand,
} from '../commands/work-rate-config.commands';

const ORDEN_TIPOS: string[] = Object.values(WorkRateType);

@Injectable()
export class WorkRateConfigService {
  constructor(
    @Inject(WORK_RATE_CONFIG_REPOSITORY_PORT)
    private readonly workRateConfigRepository: WorkRateConfigRepositoryPort,

    @Inject(AUDIT_PORT)
    private readonly auditPort: AuditPort,
  ) {}

  async obtenerHistorial(): Promise<WorkRateConfig[]> {
    const versiones = await this.workRateConfigRepository.findAll();

    return this.ordenar(versiones);
  }

  async obtenerVigentes(fecha?: string): Promise<WorkRateConfig[]> {
    const versiones = await this.workRateConfigRepository.findVigentes(
      fecha ?? this.fechaActual(),
    );

    return this.ordenar(versiones);
  }

  /**
   * Cada tipo de hora se versiona por separado, pero todos los cambios de una
   * solicitud se guardan juntos o no se guarda ninguno. Las versiones
   * existentes nunca se modifican: solo se cierra su vigencia, de modo que los
   * cálculos ya procesados conservan los multiplicadores con los que se hicieron.
   */
  async registrar(
    command: RegistrarRecargosCommand,
    actor: AuthUser,
  ): Promise<WorkRateConfig[]> {
    try {
      this.validarTiposSinRepetir(command.rates);
      this.validarInicioDeVigencia(command.validFrom);

      const ultimas = await this.workRateConfigRepository.findUltimas(
        command.rates.map((rate) => rate.type),
      );
      const ultimaPorTipo = new Map(
        ultimas.map((version) => [version.type, version]),
      );

      const versiones: WorkRateConfig[] = [];
      const cierres: CierreDeVersion[] = [];
      const cambios: Record<string, unknown> = {};

      for (const rate of command.rates) {
        const anterior = ultimaPorTipo.get(rate.type) ?? null;

        if (anterior) {
          this.validarVigenciaPosterior(command.validFrom, anterior, rate.type);
          this.validarCambio(rate, anterior);

          cierres.push({
            id: anterior.id,
            validTo: aDate(diaAnterior(command.validFrom)),
          });
        }

        versiones.push(this.construirVersion(rate, command.validFrom));
        cambios[rate.type] = {
          anterior: anterior ? Number(anterior.multiplier) : null,
          nuevo: rate.multiplier,
        };
      }

      const versionesCreadas =
        await this.workRateConfigRepository.registrarVersiones(
          versiones,
          cierres,
        );

      // Se audita quién hizo el cambio y el valor anterior y nuevo de cada recargo.
      this.auditPort.log({
        action: 'WORK_RATE_CONFIG_VERSIONS_CREATED',
        module: 'Parámetros de nómina',
        resource: 'WorkRateConfig',
        result: 'SUCCESS',
        message: `Se registraron ${versionesCreadas.length} recargos laborales vigentes desde ${command.validFrom}.`,
        metadata: {
          performedBy: actor.id,
          performedByEmail: actor.email,
          validFrom: command.validFrom,
          versionIds: versionesCreadas.map((version) => version.id),
          changes: cambios,
        },
      });

      return this.ordenar(versionesCreadas);
    } catch (error) {
      this.auditPort.log({
        action: 'WORK_RATE_CONFIG_VERSIONS_CREATE_FAILED',
        module: 'Parámetros de nómina',
        resource: 'WorkRateConfig',
        result: 'FAILED',
        message: 'Falló el registro de los recargos laborales.',
        metadata: {
          performedBy: actor.id,
          performedByEmail: actor.email,
          validFrom: command.validFrom,
          types: command.rates.map((rate) => rate.type),
          error: error instanceof Error ? error.message : String(error),
        },
      });

      throw this.traducirError(error);
    }
  }

  private validarTiposSinRepetir(rates: readonly RecargoCommand[]): void {
    const tipos = new Set<WorkRateType>();

    for (const rate of rates) {
      if (tipos.has(rate.type)) {
        throw new BadRequestException(
          `El recargo de la ${NOMBRE_TIPO_HORA[rate.type]} está repetido en la solicitud.`,
        );
      }

      tipos.add(rate.type);
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
    anterior: WorkRateConfig,
    type: WorkRateType,
  ): void {
    const inicioAnterior = aFechaCalendario(anterior.valid_from);

    if (validFrom <= inicioAnterior) {
      throw new ConflictException(
        `Ya existe una versión del recargo de la ${NOMBRE_TIPO_HORA[type]} con vigencia desde ${inicioAnterior}. La nueva vigencia debe iniciar después de esa fecha para no superponerse.`,
      );
    }
  }

  private validarCambio(rate: RecargoCommand, anterior: WorkRateConfig): void {
    if (Number(anterior.multiplier) === rate.multiplier) {
      throw new BadRequestException(
        `El recargo de la ${NOMBRE_TIPO_HORA[rate.type]} ya tiene el multiplicador ${rate.multiplier}: no hay cambios para guardar.`,
      );
    }
  }

  private construirVersion(
    rate: RecargoCommand,
    validFrom: string,
  ): WorkRateConfig {
    const version = new WorkRateConfig();

    version.type = rate.type;
    version.multiplier = rate.multiplier;
    version.valid_from = aDate(validFrom);
    // Sin fecha de fin: rige hasta que se registre la siguiente versión.
    version.valid_to = null;

    return version;
  }

  /** Por tipo de hora en el orden del catálogo y, dentro de cada tipo, de la versión más reciente a la más antigua. */
  private ordenar(versiones: WorkRateConfig[]): WorkRateConfig[] {
    return [...versiones].sort((a, b) => {
      const porTipo = ORDEN_TIPOS.indexOf(a.type) - ORDEN_TIPOS.indexOf(b.type);

      if (porTipo !== 0) {
        return porTipo;
      }

      return aFechaCalendario(b.valid_from).localeCompare(
        aFechaCalendario(a.valid_from),
      );
    });
  }

  private fechaActual(): string {
    return getColombiaDate(new Date());
  }

  private traducirError(error: unknown): unknown {
    if (error instanceof VigenciaSuperpuestaError) {
      return new ConflictException(error.message);
    }

    return error;
  }
}
