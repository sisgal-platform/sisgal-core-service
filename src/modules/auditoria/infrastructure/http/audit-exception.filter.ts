import { ArgumentsHost, Catch, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { AuditService } from '../../application/services/audit.service';
import {
  buildRequestAuditInput,
  resolveCorrelationId,
  shouldAudit,
} from '../../domain/audit-request';
import type { AuditableRequest } from '../../domain/audit-request';
import { describeException } from './describe-exception';
import { CORRELATION_ID_HEADER } from './audit.interceptor';

interface AuditableResponse {
  headersSent?: boolean;
  setHeader?: (name: string, value: string) => unknown;
}

/**
 * Audita las peticiones que fallan: errores de validación, de negocio e
 * internos, y los accesos rechazados por los guards (401 y 403), que ningún
 * interceptor llega a ver.
 *
 * Solo observa: después de registrar delega en el comportamiento por defecto
 * de Nest, así que la respuesta que recibe el cliente no cambia.
 */
@Catch()
export class AuditExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(AuditExceptionFilter.name);

  constructor(private readonly auditService: AuditService) {
    super();
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    this.recordFailure(exception, host);
    super.catch(exception, host);
  }

  private recordFailure(exception: unknown, host: ArgumentsHost): void {
    try {
      if (host.getType() !== 'http') {
        return;
      }

      const http = host.switchToHttp();
      const request = http.getRequest<AuditableRequest>();
      const response = http.getResponse<AuditableResponse>();
      const failure = describeException(exception);

      if (!shouldAudit(request.method, failure.httpStatus)) {
        return;
      }

      const input = buildRequestAuditInput(request, {
        status: 'FAILED',
        httpStatus: failure.httpStatus,
        // Si un guard rechazó la petición, el interceptor nunca corrió y no
        // hay hora de inicio: es mejor no informar duración que inventarla.
        durationMs:
          request.auditStartedAt === undefined
            ? undefined
            : Date.now() - request.auditStartedAt,
        error: { message: failure.message, stackTrace: failure.stackTrace },
      });

      if (!response.headersSent) {
        response.setHeader?.(
          CORRELATION_ID_HEADER,
          resolveCorrelationId(request),
        );
      }

      // No se espera el guardado; `record` atrapa sus propios errores.
      void this.auditService.record(input);
    } catch (error) {
      this.logger.error(
        `No se pudo preparar el evento de auditoría del fallo: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
