import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { AUDIT_PORT } from 'src/application/ports/audit/audit.port';
import type { AuditPort } from 'src/application/ports/audit/audit.port';
import type { AuthUser } from 'src/application/ports/auth/auth-user';
import { SystemConfig } from 'src/entities';
import { getColombiaDate } from 'src/shared/common/utils/colombia-date.util';
import { VigenciaSuperpuestaError } from '../../domain/errors/vigencia-superpuesta.error';
import {
  LegalDeductionType,
  NOMBRE_DESCUENTO,
} from '../../domain/legal-deduction-type.enum';
import {
  LEGAL_DEDUCTION_CONFIG_REPOSITORY_PORT,
  type LegalDeductionConfigRepositoryPort,
} from '../../domain/ports/legal-deduction-config.repository.port';
import {
  aDate,
  aFechaCalendario,
  diaAnterior,
  type CierreDeVersion,
} from '../../domain/vigencia';
import {
  DescuentoLegalCommand,
  RegistrarDescuentosLegalesCommand,
} from '../commands/legal-deduction-config.commands';

/** Claves de `system_config` que son descuentos legales, en el orden del catálogo. */
const CLAVES_DESCUENTOS: string[] = Object.values(LegalDeductionType);

@Injectable()
export class LegalDeductionConfigService {
  constructor(
    @Inject(LEGAL_DEDUCTION_CONFIG_REPOSITORY_PORT)
    private readonly legalDeductionConfigRepository: LegalDeductionConfigRepositoryPort,

    @Inject(AUDIT_PORT)
    private readonly auditPort: AuditPort,
  ) {}

  async obtenerHistorial(): Promise<SystemConfig[]> {
    const versiones =
      await this.legalDeductionConfigRepository.findAll(CLAVES_DESCUENTOS);

    return this.ordenar(versiones);
  }

  async obtenerVigentes(fecha?: string): Promise<SystemConfig[]> {
    const versiones = await this.legalDeductionConfigRepository.findVigentes(
      CLAVES_DESCUENTOS,
      fecha ?? this.fechaActual(),
    );

    return this.ordenar(versiones);
  }

  /**
   * Cada descuento se versiona por separado, pero todos los cambios de una
   * solicitud se guardan juntos o no se guarda ninguno. Las versiones
   * existentes nunca se modifican: solo se cierra su vigencia, de modo que las
   * liquidaciones ya procesadas conservan los porcentajes con los que se hicieron.
   */
  async registrar(
    command: RegistrarDescuentosLegalesCommand,
    actor: AuthUser,
  ): Promise<SystemConfig[]> {
    try {
      this.validarDescuentosSinRepetir(command.deductions);
      this.validarInicioDeVigencia(command.validFrom);

      const ultimas = await this.legalDeductionConfigRepository.findUltimas(
        command.deductions.map((deduction) => deduction.type),
      );
      const ultimaPorClave = new Map(
        ultimas.map((version) => [version.key, version]),
      );

      const versiones: SystemConfig[] = [];
      const cierres: CierreDeVersion[] = [];
      const cambios: Record<string, unknown> = {};

      for (const deduction of command.deductions) {
        const anterior = ultimaPorClave.get(deduction.type) ?? null;

        if (anterior) {
          this.validarVigenciaPosterior(
            command.validFrom,
            anterior,
            deduction.type,
          );
          this.validarCambio(deduction, anterior);

          cierres.push({
            id: anterior.id,
            validTo: aDate(diaAnterior(command.validFrom)),
          });
        }

        versiones.push(this.construirVersion(deduction, command.validFrom));
        cambios[deduction.type] = {
          anterior: anterior ? Number(anterior.value) : null,
          nuevo: deduction.percentage,
        };
      }

      const versionesCreadas =
        await this.legalDeductionConfigRepository.registrarVersiones(
          versiones,
          cierres,
        );

      // Se audita quién hizo el cambio y el valor anterior y nuevo de cada descuento.
      this.auditPort.log({
        action: 'LEGAL_DEDUCTION_CONFIG_VERSIONS_CREATED',
        module: 'Parámetros de nómina',
        resource: 'SystemConfig',
        result: 'SUCCESS',
        message: `Se registraron ${versionesCreadas.length} descuentos legales vigentes desde ${command.validFrom}.`,
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
        action: 'LEGAL_DEDUCTION_CONFIG_VERSIONS_CREATE_FAILED',
        module: 'Parámetros de nómina',
        resource: 'SystemConfig',
        result: 'FAILED',
        message: 'Falló el registro de los descuentos legales.',
        metadata: {
          performedBy: actor.id,
          performedByEmail: actor.email,
          validFrom: command.validFrom,
          types: command.deductions.map((deduction) => deduction.type),
          error: error instanceof Error ? error.message : String(error),
        },
      });

      throw this.traducirError(error);
    }
  }

  private validarDescuentosSinRepetir(
    deductions: readonly DescuentoLegalCommand[],
  ): void {
    const tipos = new Set<LegalDeductionType>();

    for (const deduction of deductions) {
      if (tipos.has(deduction.type)) {
        throw new BadRequestException(
          `El descuento de ${NOMBRE_DESCUENTO[deduction.type]} está repetido en la solicitud.`,
        );
      }

      tipos.add(deduction.type);
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
    anterior: SystemConfig,
    type: LegalDeductionType,
  ): void {
    const inicioAnterior = aFechaCalendario(anterior.valid_from);

    if (validFrom <= inicioAnterior) {
      throw new ConflictException(
        `Ya existe una versión del descuento de ${NOMBRE_DESCUENTO[type]} con vigencia desde ${inicioAnterior}. La nueva vigencia debe iniciar después de esa fecha para no superponerse.`,
      );
    }
  }

  private validarCambio(
    deduction: DescuentoLegalCommand,
    anterior: SystemConfig,
  ): void {
    if (Number(anterior.value) === deduction.percentage) {
      throw new BadRequestException(
        `El descuento de ${NOMBRE_DESCUENTO[deduction.type]} ya tiene el porcentaje ${deduction.percentage} %: no hay cambios para guardar.`,
      );
    }
  }

  private construirVersion(
    deduction: DescuentoLegalCommand,
    validFrom: string,
  ): SystemConfig {
    const version = new SystemConfig();

    version.key = deduction.type;
    version.value = deduction.percentage;
    version.valid_from = aDate(validFrom);
    // Sin fecha de fin: rige hasta que se registre la siguiente versión.
    version.valid_to = null;

    return version;
  }

  /** Por descuento en el orden del catálogo y, dentro de cada uno, de la versión más reciente a la más antigua. */
  private ordenar(versiones: SystemConfig[]): SystemConfig[] {
    return [...versiones].sort((a, b) => {
      const porDescuento =
        CLAVES_DESCUENTOS.indexOf(a.key) - CLAVES_DESCUENTOS.indexOf(b.key);

      if (porDescuento !== 0) {
        return porDescuento;
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
