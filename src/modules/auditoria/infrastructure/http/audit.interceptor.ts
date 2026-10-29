import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Observable, tap } from 'rxjs';
import { AuditService } from '../../application/services/audit.service';
import { auditContext } from '../../domain/audit-context';
import type { AuditContext } from '../../domain/audit-context';
import {
  buildRequestAuditInput,
  isMutatingMethod,
  resolveCorrelationId,
} from '../../domain/audit-request';
import type { AuditableRequest } from '../../domain/audit-request';

interface AuditableResponse {
  statusCode?: number;
  headersSent?: boolean;
  setHeader?: (name: string, value: string) => unknown;
}

/** Nombre del encabezado con el que el cliente puede seguir una operación. */
export const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Audita automáticamente toda petición que modifica datos y termina bien.
 * Los fallos los registra `AuditExceptionFilter`, porque los guards (que
 * rechazan los accesos no autorizados) se ejecutan antes que cualquier
 * interceptor y solo un filtro de excepciones los ve.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<AuditableRequest>();
    const response = http.getResponse<AuditableResponse>();

    // Las consultas no cambian nada y serían la mayoría del tráfico.
    if (!isMutatingMethod(request.method)) {
      return next.handle();
    }

    const startedAt = Date.now();
    const state: AuditContext = { fieldChanges: [] };
    request.auditContext = state;
    // El filtro de excepciones lo usa para calcular la duración de los fallos.
    request.auditStartedAt = startedAt;

    this.exposeCorrelationId(request, response);

    return new Observable((subscriber) => {
      // Ejecutar el handler dentro del contexto permite que el suscriptor de
      // TypeORM asocie los cambios de campos a esta petición y no a otra.
      const subscription = auditContext.run(state, () =>
        next
          .handle()
          .pipe(
            tap((body) =>
              this.recordSuccess(
                context,
                request,
                response,
                state,
                body,
                startedAt,
              ),
            ),
          )
          .subscribe(subscriber),
      );

      return () => subscription.unsubscribe();
    });
  }

  private recordSuccess(
    context: ExecutionContext,
    request: AuditableRequest,
    response: AuditableResponse,
    state: AuditContext,
    body: unknown,
    startedAt: number,
  ): void {
    try {
      const input = buildRequestAuditInput(request, {
        status: 'SUCCESS',
        httpStatus: this.resolveHttpStatus(context, request, response),
        durationMs: Date.now() - startedAt,
        handler: `${context.getClass().name}.${context.getHandler().name}`,
        responseBody: this.isAuditableBody(body) ? body : undefined,
        fieldChanges: state.fieldChanges,
      });

      // No se espera el guardado: la auditoría no debe demorar la respuesta.
      // `record` atrapa sus propios errores.
      void this.auditService.record(input);
    } catch (error) {
      this.logger.error(
        `No se pudo preparar el evento de auditoría: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Nest fija el código de éxito después de los interceptores, así que aún no
   * está en la respuesta: se calcula igual que él (el declarado con
   * @HttpCode, o 201 para POST y 200 para el resto).
   */
  private resolveHttpStatus(
    context: ExecutionContext,
    request: AuditableRequest,
    response: AuditableResponse,
  ): number {
    const declared = Reflect.getMetadata(
      HTTP_CODE_METADATA,
      context.getHandler(),
    ) as number | undefined;
    if (declared) {
      return declared;
    }

    // Un handler que fijó su propio código con @Res({ passthrough: true }).
    if (response.statusCode && response.statusCode !== 200) {
      return response.statusCode;
    }
    return request.method.toUpperCase() === 'POST' ? 201 : 200;
  }

  /** Solo se guarda como estado completo lo que es JSON; no archivos ni flujos. */
  private isAuditableBody(body: unknown): boolean {
    return (
      typeof body === 'object' &&
      body !== null &&
      !(body instanceof StreamableFile) &&
      !Buffer.isBuffer(body) &&
      typeof (body as { pipe?: unknown }).pipe !== 'function'
    );
  }

  private exposeCorrelationId(
    request: AuditableRequest,
    response: AuditableResponse,
  ): void {
    try {
      const correlationId = resolveCorrelationId(request);
      if (!response.headersSent) {
        response.setHeader?.(CORRELATION_ID_HEADER, correlationId);
      }
    } catch {
      // El encabezado es una comodidad para el cliente; nunca debe fallar la petición.
    }
  }
}
