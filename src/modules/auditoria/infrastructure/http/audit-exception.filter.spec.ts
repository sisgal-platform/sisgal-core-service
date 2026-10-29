import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { AuditService } from '../../application/services/audit.service';
import type { AuditableRequest } from '../../domain/audit-request';
import { AuditExceptionFilter } from './audit-exception.filter';
import { CORRELATION_ID_HEADER } from './audit.interceptor';

const USER_ID = '3f0c9f2e-6a43-4d5b-9c1e-2b7a8d4e5f60';

describe('AuditExceptionFilter', () => {
  let auditService: { record: jest.Mock };
  let filter: AuditExceptionFilter;
  let defaultCatch: jest.SpyInstance;
  let response: { headersSent: boolean; setHeader: jest.Mock };

  function crearPeticion(
    overrides: Partial<AuditableRequest> = {},
  ): AuditableRequest {
    return {
      method: 'PATCH',
      originalUrl: '/empleados/99',
      route: { path: '/empleados/:id' },
      params: { id: '99' },
      headers: {},
      ip: '10.0.0.5',
      user: { id: USER_ID, email: 'admin@sisgal.com', role: 'ADMINISTRADOR' },
      ...overrides,
    };
  }

  function crearHost(request: AuditableRequest, type = 'http'): ArgumentsHost {
    return {
      getType: () => type,
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
  }

  beforeEach(() => {
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    filter = new AuditExceptionFilter(auditService as unknown as AuditService);
    response = { headersSent: false, setHeader: jest.fn() };
    // El comportamiento por defecto de Nest necesita un servidor HTTP real.
    defaultCatch = jest
      .spyOn(BaseExceptionFilter.prototype, 'catch')
      .mockImplementation(() => undefined);
    // Una prueba provoca un error a propósito; se evita el ruido en el log.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('debe registrar una modificación que falla por regla de negocio', () => {
    const exception = new NotFoundException('No se encontró el empleado 99.');
    const host = crearHost(crearPeticion());

    filter.catch(exception, host);

    expect(auditService.record).toHaveBeenCalledTimes(1);
    expect(auditService.record.mock.calls[0][0]).toMatchObject({
      action: 'PATCH /empleados/:id',
      entity: 'empleados',
      entityId: '99',
      status: 'FAILED',
      httpStatus: 404,
      error: { message: 'No se encontró el empleado 99.', stackTrace: null },
      actor: { id: USER_ID },
    });
  });

  it('debe registrar los errores de validación con todos sus mensajes', () => {
    filter.catch(
      new BadRequestException({
        message: ['phone inválido', 'salary_base inválido'],
      }),
      crearHost(crearPeticion({ method: 'POST' })),
    );

    expect(auditService.record.mock.calls[0][0]).toMatchObject({
      httpStatus: 400,
      error: { message: 'phone inválido; salary_base inválido' },
    });
  });

  it('debe guardar la traza solo en un error interno', () => {
    filter.catch(
      new InternalServerErrorException('falló'),
      crearHost(crearPeticion()),
    );

    expect(auditService.record.mock.calls[0][0].error.stackTrace).toContain(
      'InternalServerErrorException',
    );
  });

  it.each([
    ['401', new UnauthorizedException('Sin token.')],
    ['403', new ForbiddenException('Sin permiso.')],
  ])(
    'debe registrar un acceso rechazado (%s) aunque sea una consulta',
    (_n, exception) => {
      filter.catch(
        exception,
        crearHost(
          crearPeticion({
            method: 'GET',
            route: { path: '/liquidaciones' },
            params: {},
            user: undefined,
          }),
        ),
      );

      expect(auditService.record).toHaveBeenCalledTimes(1);
      // Sin usuario autenticado, el evento queda a nombre del usuario anónimo.
      expect(auditService.record.mock.calls[0][0].actor).toBeNull();
      expect(auditService.record.mock.calls[0][0]).toMatchObject({
        action: 'GET /liquidaciones',
        status: 'FAILED',
      });
    },
  );

  it('no debe registrar las consultas que fallan por otros motivos', () => {
    filter.catch(
      new NotFoundException('No existe.'),
      crearHost(crearPeticion({ method: 'GET' })),
    );

    expect(auditService.record).not.toHaveBeenCalled();
  });

  it('no debe registrar un contexto que no es HTTP', () => {
    filter.catch(new Error('x'), crearHost(crearPeticion(), 'rpc'));

    expect(auditService.record).not.toHaveBeenCalled();
  });

  it('debe informar la duración solo cuando el handler llegó a ejecutarse', () => {
    filter.catch(
      new NotFoundException('x'),
      crearHost(crearPeticion({ auditStartedAt: Date.now() - 50 })),
    );
    filter.catch(
      new UnauthorizedException('x'),
      crearHost(crearPeticion({ method: 'GET', user: undefined })),
    );

    expect(
      auditService.record.mock.calls[0][0].metadata.duration_ms,
    ).toBeGreaterThanOrEqual(50);
    expect(auditService.record.mock.calls[1][0].metadata).not.toHaveProperty(
      'duration_ms',
    );
  });

  it('debe exponer el identificador de seguimiento en la respuesta de error', () => {
    filter.catch(new NotFoundException('x'), crearHost(crearPeticion()));

    expect(response.setHeader).toHaveBeenCalledWith(
      CORRELATION_ID_HEADER,
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
  });

  it('debe dejar que Nest responda al cliente exactamente igual que sin auditoría', () => {
    const exception = new NotFoundException('x');
    const host = crearHost(crearPeticion());

    filter.catch(exception, host);

    expect(defaultCatch).toHaveBeenCalledWith(exception, host);
  });

  it('debe responder igual aunque la auditoría falle al prepararse', () => {
    const exception = new NotFoundException('x');
    const request = crearPeticion();
    Object.defineProperty(request, 'params', {
      get() {
        throw new Error('petición ilegible');
      },
    });
    const host = crearHost(request);

    expect(() => filter.catch(exception, host)).not.toThrow();
    expect(defaultCatch).toHaveBeenCalledWith(exception, host);
  });
});
