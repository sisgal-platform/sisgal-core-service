import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AUDIT_PORT } from 'src/application/ports/audit/audit.port';
import type { AuditPort } from 'src/application/ports/audit/audit.port';
import { Branch, Employee } from 'src/entities';
import {
  LecturaBiometricaError,
  RegistroDuplicadoError,
} from '../../domain/errors/marcacion.errors';
import {
  LECTOR_BIOMETRICO_PORT,
  type LecturaBiometrica,
  type LectorBiometricoPort,
} from '../../domain/ports/lector-biometrico.port';
import {
  MARCACION_REPOSITORY_PORT,
  type MarcacionRepositoryPort,
} from '../../domain/ports/marcacion.repository.port';
import { MetodoMarcacion } from '../../domain/value-objects/metodo-marcacion.enum';
import { MarcacionResponseDto } from '../../infrastructure/http/dtos';

/** Motivos por los que se rechaza una marcación, para la auditoría. */
type MotivoRechazo =
  | 'LECTURA_FALLIDA'
  | 'HUELLA_NO_RECONOCIDA'
  | 'EMPLEADO_INACTIVO'
  | 'EMPLEADO_SIN_SUCURSAL'
  | 'REGISTRO_DUPLICADO';

@Injectable()
export class RegistrarMarcacionService {
  constructor(
    @Inject(LECTOR_BIOMETRICO_PORT)
    private readonly lectorBiometrico: LectorBiometricoPort,

    @Inject(MARCACION_REPOSITORY_PORT)
    private readonly marcacionRepository: MarcacionRepositoryPort,

    @Inject(AUDIT_PORT)
    private readonly auditPort: AuditPort,
  ) {}

  async registrarMarcacionBiometrica(
    lectura: LecturaBiometrica,
    idempotencyKey: string,
  ): Promise<MarcacionResponseDto> {
    const documento = await this.identificarHuella(lectura);
    const empleado = documento
      ? await this.marcacionRepository.findEmpleadoPorDocumento(documento)
      : null;

    if (!empleado) {
      throw this.rechazar(
        'HUELLA_NO_RECONOCIDA',
        new NotFoundException('Huella no reconocida'),
      );
    }

    if (empleado.status !== 'ACTIVO') {
      throw this.rechazar(
        'EMPLEADO_INACTIVO',
        new BadRequestException('El empleado no se encuentra activo.'),
        empleado.id,
      );
    }

    // La marcación queda en el restaurante al que pertenece el empleado.
    const sucursal = empleado.employee_branch_assig?.[0]?.branch;

    if (!sucursal) {
      throw this.rechazar(
        'EMPLEADO_SIN_SUCURSAL',
        new BadRequestException(
          'El empleado no tiene un restaurante asignado.',
        ),
        empleado.id,
      );
    }

    return this.registrar(empleado, sucursal, idempotencyKey);
  }

  private async identificarHuella(
    lectura: LecturaBiometrica,
  ): Promise<string | null> {
    if (!lectura.capturaExitosa || !lectura.huella) {
      throw this.rechazarLecturaFallida(
        new LecturaBiometricaError('El lector no capturó la huella.'),
      );
    }

    try {
      return await this.lectorBiometrico.identificar(lectura.huella);
    } catch (error) {
      if (error instanceof LecturaBiometricaError) {
        throw this.rechazarLecturaFallida(error);
      }

      throw error;
    }
  }

  private rechazarLecturaFallida(error: LecturaBiometricaError): HttpException {
    return this.rechazar(
      'LECTURA_FALLIDA',
      new ServiceUnavailableException(error.message),
      undefined,
      { detalle: error.detalle },
    );
  }

  private async registrar(
    empleado: Employee,
    sucursal: Branch,
    idempotencyKey: string,
  ): Promise<MarcacionResponseDto> {
    try {
      const marcacion = await this.marcacionRepository.registrar({
        empleadoId: empleado.id,
        sucursal,
        metodo: MetodoMarcacion.HUELLA,
        idempotencyKey,
        // La hora oficial es la del servidor, nunca la del dispositivo.
        fechaHora: new Date(),
      });

      // Un reintento con la misma clave devuelve la marcación original y ya
      // quedó auditada la primera vez.
      if (!marcacion.repetida) {
        this.auditPort.log({
          action: 'ATTENDANCE_MARK_REGISTERED',
          module: 'Integración',
          resource: 'AttendanceLog',
          resourceId: marcacion.id,
          result: 'SUCCESS',
          message: `Se registró la ${marcacion.tipo.toLowerCase()} de ${empleado.firstName} ${empleado.lastName}.`,
          metadata: {
            empleadoId: empleado.id,
            tipo: marcacion.tipo,
            metodo: marcacion.metodo,
            sucursalId: marcacion.sucursalId,
            registroAsistenciaId: marcacion.registroAsistenciaId,
          },
        });
      }

      return MarcacionResponseDto.from(marcacion, empleado);
    } catch (error) {
      if (error instanceof RegistroDuplicadoError) {
        throw this.rechazar(
          'REGISTRO_DUPLICADO',
          new ConflictException(error.message),
          empleado.id,
        );
      }

      // La transacción se revirtió: no queda ninguna marcación a medias.
      this.auditPort.log({
        action: 'ATTENDANCE_MARK_FAILED',
        module: 'Integración',
        resource: 'AttendanceLog',
        result: 'FAILED',
        message: `Falló el registro de la marcación del empleado con identificador ${empleado.id}.`,
        metadata: {
          empleadoId: empleado.id,
          error: error instanceof Error ? error.message : String(error),
        },
      });

      throw error;
    }
  }

  /** Audita el rechazo y devuelve la excepción para lanzarla. */
  private rechazar(
    motivo: MotivoRechazo,
    excepcion: HttpException,
    empleadoId?: number,
    metadata: Record<string, unknown> = {},
  ): HttpException {
    this.auditPort.log({
      action: 'ATTENDANCE_MARK_REJECTED',
      module: 'Integración',
      resource: 'AttendanceLog',
      result: 'FAILED',
      message: `Se rechazó una marcación: ${excepcion.message}`,
      metadata: { motivo, empleadoId, ...metadata },
    });

    return excepcion;
  }
}
