import { Logger } from '@nestjs/common';
import type { AuditInput } from '../../domain/audit-input';
import { MAX_FIELD_CHANGES_PER_EVENT } from '../../domain/audit-context';
import { ANONYMOUS_AUDIT_ACTOR } from '../../domain/audit-record';
import type { AuditRecord } from '../../domain/audit-record';
import { REDACTED } from '../../domain/audit-sanitizer';
import type { AuditRecordRepositoryPort } from '../../domain/ports/audit-record.repository.port';
import { AuditService } from './audit.service';

const USER_ID = '3f0c9f2e-6a43-4d5b-9c1e-2b7a8d4e5f60';

describe('AuditService', () => {
  let service: AuditService;
  let repository: jest.Mocked<AuditRecordRepositoryPort>;
  let loggerError: jest.SpyInstance;

  function crearEntrada(overrides: Partial<AuditInput> = {}): AuditInput {
    return {
      actor: { id: USER_ID, email: 'admin@sisgal.com', role: 'ADMINISTRADOR' },
      action: 'PATCH /empleados/:id',
      entity: 'empleados',
      entityId: '12',
      status: 'SUCCESS',
      httpStatus: 200,
      ...overrides,
    };
  }

  function registroGuardado(): AuditRecord {
    return repository.save.mock.calls[0][0];
  }

  beforeEach(() => {
    repository = { save: jest.fn().mockResolvedValue(undefined) };
    service = new AuditService(repository);
    loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('debe guardar el evento con el usuario autenticado', async () => {
    await service.record(crearEntrada());

    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(registroGuardado()).toMatchObject({
      actor: {
        id: USER_ID,
        username: 'admin@sisgal.com',
        role: 'ADMINISTRADOR',
      },
      action: 'PATCH /empleados/:id',
      entity: 'empleados',
      entityId: '12',
      status: 'SUCCESS',
      httpStatus: 200,
      error: null,
      snapshot: null,
    });
    expect(registroGuardado().createdAt).toBeInstanceOf(Date);
  });

  it('debe atribuir al usuario anónimo un evento sin sesión', async () => {
    await service.record(crearEntrada({ actor: null }));

    expect(registroGuardado().actor).toBe(ANONYMOUS_AUDIT_ACTOR);
  });

  it('debe respetar la fecha del evento cuando se informa', async () => {
    const createdAt = new Date('2026-10-27T10:00:00.000Z');

    await service.record(crearEntrada({ createdAt }));

    expect(registroGuardado().createdAt).toBe(createdAt);
  });

  it('debe redactar los metadatos sensibles y convertir los demás a texto', async () => {
    await service.record(
      crearEntrada({
        metadata: {
          method: 'PATCH',
          duration_ms: 35,
          token: 'abc',
          request_body: { phone: '300', password: 'x' },
          omitido: undefined,
        },
      }),
    );

    expect(registroGuardado().metadata).toEqual([
      { key: 'method', value: 'PATCH' },
      { key: 'duration_ms', value: '35' },
      { key: 'token', value: REDACTED },
      {
        key: 'request_body',
        value: `{"phone":"300","password":"${REDACTED}"}`,
      },
    ]);
  });

  it('debe redactar el valor de los cambios de campos sensibles', async () => {
    await service.record(
      crearEntrada({
        fieldChanges: [
          { fieldName: 'employee[1].phone', oldValue: '1', newValue: '2' },
          { fieldName: 'user[1].password', oldValue: 'a', newValue: 'b' },
        ],
      }),
    );

    expect(registroGuardado().fieldChanges).toEqual([
      { fieldName: 'employee[1].phone', oldValue: '1', newValue: '2' },
      { fieldName: 'user[1].password', oldValue: REDACTED, newValue: REDACTED },
    ]);
  });

  it('debe limitar la cantidad de cambios de campos por evento', async () => {
    const fieldChanges = Array.from(
      { length: MAX_FIELD_CHANGES_PER_EVENT + 25 },
      (_, index) => ({
        fieldName: `t[${index}].c`,
        oldValue: '1',
        newValue: '2',
      }),
    );

    await service.record(crearEntrada({ fieldChanges }));

    expect(registroGuardado().fieldChanges).toHaveLength(
      MAX_FIELD_CHANGES_PER_EVENT,
    );
  });

  it('debe guardar el estado completo ya redactado', async () => {
    await service.record(crearEntrada({ snapshot: { id: 12, token: 'abc' } }));

    expect(registroGuardado().snapshot).toEqual({ id: 12, token: REDACTED });
  });

  it('debe omitir un estado demasiado grande y dejar constancia en los metadatos', async () => {
    // Muchos campos grandes: cada texto cabe, pero el conjunto supera el máximo.
    const lineas = Array.from({ length: 150 }, () => 'x'.repeat(1_000));

    await service.record(crearEntrada({ snapshot: { lineas } }));

    expect(registroGuardado().snapshot).toBeNull();
    expect(registroGuardado().metadata).toContainEqual({
      key: 'snapshot_omitted',
      value: 'true',
    });
  });

  it('debe recortar un texto individual desmesurado en vez de guardarlo completo', async () => {
    await service.record(
      crearEntrada({ snapshot: { texto: 'x'.repeat(150_000) } }),
    );

    const snapshot = registroGuardado().snapshot as { texto: string };
    expect(snapshot.texto.length).toBeLessThan(10_100);
    expect(snapshot.texto.endsWith('[recortado]')).toBe(true);
  });

  it('debe guardar el error recortado', async () => {
    await service.record(
      crearEntrada({
        status: 'FAILED',
        error: { message: 'x'.repeat(20_000), stackTrace: null },
      }),
    );

    expect(registroGuardado().error?.message?.length).toBeLessThan(8_100);
    expect(registroGuardado().error?.stackTrace).toBeNull();
  });

  describe('cuando la auditoría falla', () => {
    it('no debe lanzar error: la operación auditada no puede fallar por la auditoría', async () => {
      repository.save.mockRejectedValue(new Error('conexión perdida'));

      await expect(service.record(crearEntrada())).resolves.toBeUndefined();
    });

    it('debe dejar el fallo en el log sin incluir los datos del evento', async () => {
      repository.save.mockRejectedValue(new Error('conexión perdida'));

      await service.record(
        crearEntrada({ snapshot: { document: '1020304050' } }),
      );

      expect(loggerError).toHaveBeenCalledTimes(1);
      const mensaje = String(loggerError.mock.calls[0][0]);
      expect(mensaje).toContain('conexión perdida');
      expect(mensaje).not.toContain('1020304050');
    });

    it('no debe permitir que un texto del cliente falsifique líneas del log', async () => {
      repository.save.mockRejectedValue(
        new Error('falló\nFALSO [ERROR] otra línea'),
      );

      await service.record(crearEntrada({ action: 'POST /x\r\nINYECTADO' }));

      expect(String(loggerError.mock.calls[0][0])).not.toMatch(/[\r\n]/);
    });
  });
});
