import {
  buildRequestAuditInput,
  isMutatingMethod,
  isUuid,
  resolveAction,
  resolveCorrelationId,
  resolveEntity,
  resolveEntityId,
  resolveRoutePath,
  shouldAudit,
} from './audit-request';
import type { AuditableRequest } from './audit-request';
import { REDACTED } from './audit-sanitizer';

const USER_ID = '3f0c9f2e-6a43-4d5b-9c1e-2b7a8d4e5f60';

function crearPeticion(
  overrides: Partial<AuditableRequest> = {},
): AuditableRequest {
  return {
    method: 'PATCH',
    originalUrl: '/empleados/12?x=1',
    route: { path: '/empleados/:id' },
    params: { id: '12' },
    headers: {},
    ip: '10.0.0.5',
    user: { id: USER_ID, email: 'admin@sisgal.com', role: 'ADMINISTRADOR' },
    ...overrides,
  };
}

describe('audit-request', () => {
  describe('shouldAudit', () => {
    it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'patch'])(
      'debe auditar las peticiones %s aunque terminen bien',
      (method) => {
        expect(shouldAudit(method, 200)).toBe(true);
        expect(isMutatingMethod(method)).toBe(true);
      },
    );

    it('no debe auditar las consultas normales', () => {
      expect(shouldAudit('GET', 200)).toBe(false);
      expect(shouldAudit('GET', 404)).toBe(false);
      expect(shouldAudit('GET', 500)).toBe(false);
    });

    it.each([401, 403])(
      'debe auditar un acceso rechazado (%s) incluso en una consulta',
      (status) => {
        expect(shouldAudit('GET', status)).toBe(true);
      },
    );
  });

  describe('isUuid', () => {
    it('debe aceptar un UUID y rechazar cualquier otro valor', () => {
      expect(isUuid(USER_ID)).toBe(true);
      expect(isUuid('12')).toBe(false);
      expect(isUuid("'; DROP TABLE x;--")).toBe(false);
      expect(isUuid(undefined)).toBe(false);
      expect(isUuid(123)).toBe(false);
    });
  });

  describe('resolveCorrelationId', () => {
    it('debe respetar el identificador del cliente si es un UUID', () => {
      const request = crearPeticion({
        headers: { 'x-correlation-id': '11111111-1111-4111-8111-111111111111' },
      });

      expect(resolveCorrelationId(request)).toBe(
        '11111111-1111-4111-8111-111111111111',
      );
    });

    it('debe ignorar un identificador que no es UUID y generar otro', () => {
      const request = crearPeticion({
        headers: { 'x-correlation-id': 'texto-arbitrario-del-cliente' },
      });

      const id = resolveCorrelationId(request);

      expect(id).not.toBe('texto-arbitrario-del-cliente');
      expect(isUuid(id)).toBe(true);
    });

    it('debe usar siempre el mismo identificador dentro de una petición', () => {
      const request = crearPeticion();

      expect(resolveCorrelationId(request)).toBe(resolveCorrelationId(request));
    });
  });

  describe('ruta, acción y entidad', () => {
    it('debe usar la ruta declarada en el controlador, con sus parámetros sin valor', () => {
      expect(resolveRoutePath(crearPeticion())).toBe('/empleados/:id');
      expect(resolveAction(crearPeticion())).toBe('PATCH /empleados/:id');
    });

    it('debe usar la ruta solicitada, sin la consulta, cuando no hay una declarada', () => {
      const request = crearPeticion({
        route: undefined,
        path: undefined,
        originalUrl: '/no-existe?a=1',
      });

      expect(resolveRoutePath(request)).toBe('/no-existe');
    });

    it('debe tomar como entidad el primer segmento fijo de la ruta', () => {
      expect(resolveEntity('/liquidaciones/:id/pdf')).toBe('liquidaciones');
      expect(resolveEntity('/:id')).toBe('desconocido');
      expect(resolveEntity('/')).toBe('desconocido');
    });
  });

  describe('resolveEntityId', () => {
    it('debe tomar el identificador de los parámetros de la ruta', () => {
      expect(resolveEntityId(crearPeticion())).toBe('12');
      expect(
        resolveEntityId(crearPeticion({ params: { employeeId: '7' } })),
      ).toBe('7');
    });

    it('debe tomar el id del recurso creado cuando la ruta no tiene parámetros', () => {
      const request = crearPeticion({ method: 'POST', params: {} });

      expect(resolveEntityId(request, { id: 44, nombre: 'x' })).toBe('44');
    });

    it('debe devolver null cuando no hay ningún identificador', () => {
      expect(resolveEntityId(crearPeticion({ params: {} }))).toBeNull();
      expect(
        resolveEntityId(crearPeticion({ params: {} }), 'texto'),
      ).toBeNull();
    });
  });

  describe('buildRequestAuditInput', () => {
    it('debe describir una petición exitosa', () => {
      const input = buildRequestAuditInput(crearPeticion(), {
        status: 'SUCCESS',
        httpStatus: 200,
        durationMs: 35,
        handler: 'EmployeeController.update',
        responseBody: { id: 12 },
      });

      expect(input).toMatchObject({
        action: 'PATCH /empleados/:id',
        entity: 'empleados',
        entityId: '12',
        status: 'SUCCESS',
        httpStatus: 200,
        ipAddress: '10.0.0.5',
        snapshot: { id: 12 },
        error: null,
        fieldChanges: [],
      });
      expect(input.metadata).toMatchObject({
        method: 'PATCH',
        path: '/empleados/12',
        route: '/empleados/:id',
        handler: 'EmployeeController.update',
        duration_ms: 35,
      });
    });

    it('debe redactar los datos sensibles de la consulta y del cuerpo', () => {
      const input = buildRequestAuditInput(
        crearPeticion({
          query: { token: 'abc', page: '1' },
          body: { phone: '300', huella: '1020304050' },
        }),
        { status: 'SUCCESS', httpStatus: 200 },
      );

      expect(input.metadata?.query).toEqual({ token: REDACTED, page: '1' });
      expect(input.metadata?.request_body).toEqual({
        phone: '300',
        huella: REDACTED,
      });
    });

    it('no debe incluir cuerpo ni consulta cuando vienen vacíos', () => {
      const input = buildRequestAuditInput(
        crearPeticion({ query: {}, body: {} }),
        { status: 'SUCCESS', httpStatus: 200 },
      );

      expect(input.metadata).not.toHaveProperty('query');
      expect(input.metadata).not.toHaveProperty('request_body');
    });

    it('no debe inventar una duración cuando no se conoce', () => {
      const input = buildRequestAuditInput(crearPeticion(), {
        status: 'FAILED',
        httpStatus: 401,
      });

      expect(input.metadata).not.toHaveProperty('duration_ms');
    });

    it('debe dejar constancia de un id de usuario que no es un UUID', () => {
      const input = buildRequestAuditInput(
        crearPeticion({ user: { id: 'usuario-1', role: 'ADMINISTRADOR' } }),
        { status: 'SUCCESS', httpStatus: 200 },
      );

      expect(input.metadata?.invalid_user_id).toBe('usuario-1');
    });

    it('debe recortar un user-agent desmesurado', () => {
      const input = buildRequestAuditInput(
        crearPeticion({ headers: { 'user-agent': 'a'.repeat(5000) } }),
        { status: 'SUCCESS', httpStatus: 200 },
      );

      expect(input.userAgent?.length).toBeLessThan(600);
    });

    it('debe llevar el error y el estado de una petición fallida', () => {
      const input = buildRequestAuditInput(crearPeticion(), {
        status: 'FAILED',
        httpStatus: 404,
        error: { message: 'No existe', stackTrace: null },
      });

      expect(input).toMatchObject({
        status: 'FAILED',
        httpStatus: 404,
        error: { message: 'No existe', stackTrace: null },
      });
    });
  });
});
