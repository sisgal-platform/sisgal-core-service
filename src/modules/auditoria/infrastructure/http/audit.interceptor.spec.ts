import { ExecutionContext, Logger, StreamableFile } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Observable, lastValueFrom, of, throwError } from 'rxjs';
import { AuditService } from '../../application/services/audit.service';
import { auditContext } from '../../domain/audit-context';
import type { AuditableRequest } from '../../domain/audit-request';
import { AuditInterceptor, CORRELATION_ID_HEADER } from './audit.interceptor';

const USER_ID = '3f0c9f2e-6a43-4d5b-9c1e-2b7a8d4e5f60';

class EmployeeController {
  update() {
    return undefined;
  }
  create() {
    return undefined;
  }
}

describe('AuditInterceptor', () => {
  let auditService: { record: jest.Mock };
  let interceptor: AuditInterceptor;
  let response: {
    statusCode: number;
    headersSent: boolean;
    setHeader: jest.Mock;
  };

  function crearPeticion(
    overrides: Partial<AuditableRequest> = {},
  ): AuditableRequest {
    return {
      method: 'PATCH',
      originalUrl: '/empleados/12',
      route: { path: '/empleados/:id' },
      params: { id: '12' },
      headers: { 'user-agent': 'jest' },
      ip: '10.0.0.5',
      user: { id: USER_ID, email: 'admin@sisgal.com', role: 'ADMINISTRADOR' },
      ...overrides,
    };
  }

  function crearContexto(
    request: AuditableRequest,
    handler: () => unknown = EmployeeController.prototype.update,
    type = 'http',
  ): ExecutionContext {
    return {
      getType: () => type,
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
      getHandler: () => handler,
      getClass: () => EmployeeController,
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    interceptor = new AuditInterceptor(auditService as unknown as AuditService);
    response = { statusCode: 200, headersSent: false, setHeader: jest.fn() };
    // Algunas pruebas provocan errores a propósito; se evita el ruido en el log.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('no debe auditar las consultas', async () => {
    const request = crearPeticion({ method: 'GET' });

    const result = await lastValueFrom(
      interceptor.intercept(crearContexto(request), { handle: () => of('ok') }),
    );

    expect(result).toBe('ok');
    expect(auditService.record).not.toHaveBeenCalled();
  });

  it('no debe intervenir en contextos que no son HTTP', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(crearContexto(crearPeticion(), undefined, 'rpc'), {
        handle: () => of('ok'),
      }),
    );

    expect(result).toBe('ok');
    expect(auditService.record).not.toHaveBeenCalled();
  });

  it('debe registrar una modificación exitosa sin alterar la respuesta', async () => {
    const body = { id: 12, phone: '3001234567' };

    const result = await lastValueFrom(
      interceptor.intercept(crearContexto(crearPeticion()), {
        handle: () => of(body),
      }),
    );

    expect(result).toBe(body);
    expect(auditService.record).toHaveBeenCalledTimes(1);
    expect(auditService.record.mock.calls[0][0]).toMatchObject({
      action: 'PATCH /empleados/:id',
      entity: 'empleados',
      entityId: '12',
      status: 'SUCCESS',
      httpStatus: 200,
      snapshot: body,
      actor: { id: USER_ID },
    });
    expect(auditService.record.mock.calls[0][0].metadata).toMatchObject({
      handler: 'EmployeeController.update',
    });
  });

  it('debe tomar el id del recurso creado de la respuesta y usar 201 en un POST', async () => {
    const request = crearPeticion({
      method: 'POST',
      route: { path: '/empleados' },
      params: {},
    });

    await lastValueFrom(
      interceptor.intercept(
        crearContexto(request, EmployeeController.prototype.create),
        { handle: () => of({ id: 44 }) },
      ),
    );

    expect(auditService.record.mock.calls[0][0]).toMatchObject({
      entityId: '44',
      httpStatus: 201,
    });
  });

  it('debe respetar el código declarado con @HttpCode', async () => {
    const handler = function aceptar() {
      return undefined;
    };
    Reflect.defineMetadata(HTTP_CODE_METADATA, 202, handler);

    await lastValueFrom(
      interceptor.intercept(
        crearContexto(crearPeticion({ method: 'POST' }), handler),
        { handle: () => of({ ok: true }) },
      ),
    );

    expect(auditService.record.mock.calls[0][0].httpStatus).toBe(202);
  });

  it('no debe guardar como estado un archivo ni un flujo', async () => {
    await lastValueFrom(
      interceptor.intercept(crearContexto(crearPeticion({ method: 'POST' })), {
        handle: () => of(new StreamableFile(Buffer.from('%PDF'))),
      }),
    );

    expect(auditService.record.mock.calls[0][0].snapshot).toBeUndefined();
  });

  it('debe incluir los cambios de campos que se detecten mientras se ejecuta el handler', async () => {
    await lastValueFrom(
      interceptor.intercept(crearContexto(crearPeticion()), {
        handle: () => {
          // Lo mismo que hace el suscriptor de TypeORM durante el handler.
          auditContext.getStore()?.fieldChanges.push({
            fieldName: 'employee[12].phone',
            oldValue: '1',
            newValue: '2',
          });
          return of({ id: 12 });
        },
      }),
    );

    expect(auditService.record.mock.calls[0][0].fieldChanges).toEqual([
      { fieldName: 'employee[12].phone', oldValue: '1', newValue: '2' },
    ]);
  });

  it('no debe mezclar los cambios de dos peticiones simultáneas', async () => {
    const cambioDe = (id: string) => ({
      fieldName: `employee[${id}].phone`,
      oldValue: null,
      newValue: id,
    });
    const peticion = (id: string) =>
      lastValueFrom(
        interceptor.intercept(
          crearContexto(crearPeticion({ params: { id } })),
          {
            // La petición 1 termina después que la 2, para que se crucen.
            handle: () =>
              new Observable<unknown>((subscriber) => {
                setTimeout(
                  () => {
                    auditContext.getStore()?.fieldChanges.push(cambioDe(id));
                    subscriber.next({ id });
                    subscriber.complete();
                  },
                  id === '1' ? 20 : 5,
                );
              }),
          },
        ),
      );

    await Promise.all([peticion('1'), peticion('2')]);

    const porId = new Map(
      auditService.record.mock.calls.map(([input]) => [input.entityId, input]),
    );
    expect(porId.get('1').fieldChanges).toEqual([cambioDe('1')]);
    expect(porId.get('2').fieldChanges).toEqual([cambioDe('2')]);
  });

  it('debe exponer el identificador de seguimiento en la respuesta', async () => {
    await lastValueFrom(
      interceptor.intercept(crearContexto(crearPeticion()), {
        handle: () => of({}),
      }),
    );

    expect(response.setHeader).toHaveBeenCalledWith(
      CORRELATION_ID_HEADER,
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
  });

  it('no debe registrar el éxito cuando el handler falla (lo hace el filtro)', async () => {
    await expect(
      lastValueFrom(
        interceptor.intercept(crearContexto(crearPeticion()), {
          handle: () => throwError(() => new Error('falló')),
        }),
      ),
    ).rejects.toThrow('falló');

    expect(auditService.record).not.toHaveBeenCalled();
  });

  it('no debe afectar la respuesta si falla la preparación del evento', async () => {
    const request = crearPeticion();
    // Un getter que lanza simula una petición con datos imposibles de leer.
    Object.defineProperty(request, 'params', {
      get() {
        throw new Error('petición ilegible');
      },
    });

    const result = await lastValueFrom(
      interceptor.intercept(crearContexto(request), { handle: () => of('ok') }),
    );

    expect(result).toBe('ok');
    expect(auditService.record).not.toHaveBeenCalled();
  });

  it('no debe esperar a que se guarde la auditoría para responder', async () => {
    // Un guardado que nunca termina no debe bloquear la respuesta.
    auditService.record.mockReturnValue(new Promise(() => undefined));

    const result = await lastValueFrom(
      interceptor.intercept(crearContexto(crearPeticion()), {
        handle: () => of('rápido'),
      }),
    );

    expect(result).toBe('rápido');
  });
});
