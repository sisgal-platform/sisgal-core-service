import type { DataSource, EntityManager } from 'typeorm';
import {
  AuditError,
  AuditEvent,
  AuditFieldChange,
  AuditMetadata,
  AuditSnapshot,
  AuditUser,
} from 'src/entities';
import type { AuditRecord } from '../../../domain/audit-record';
import { AuditRecordTypeOrmRepository } from './audit-record.typeorm.repository';

const USER_ID = '3f0c9f2e-6a43-4d5b-9c1e-2b7a8d4e5f60';
const EVENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('AuditRecordTypeOrmRepository', () => {
  let repository: AuditRecordTypeOrmRepository;
  let queryBuilder: Record<string, jest.Mock>;
  let manager: {
    createQueryBuilder: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    insert: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };

  function crearRegistro(overrides: Partial<AuditRecord> = {}): AuditRecord {
    return {
      actor: {
        id: USER_ID,
        username: 'admin@sisgal.com',
        email: 'admin@sisgal.com',
        role: 'ADMINISTRADOR',
      },
      action: 'PATCH /empleados/:id',
      entity: 'empleados',
      entityId: '12',
      status: 'SUCCESS',
      httpStatus: 200,
      ipAddress: '10.0.0.5',
      userAgent: 'jest',
      createdAt: new Date('2026-10-27T10:00:00.000Z'),
      correlationId: '11111111-1111-4111-8111-111111111111',
      fieldChanges: [],
      metadata: [],
      error: null,
      snapshot: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    queryBuilder = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orUpdate: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    manager = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      create: jest.fn((_entity, data) => data),
      save: jest.fn().mockResolvedValue({ id: EVENT_ID }),
      insert: jest.fn().mockResolvedValue(undefined),
    };
    dataSource = {
      transaction: jest.fn(async (work: (m: EntityManager) => Promise<void>) =>
        work(manager as unknown as EntityManager),
      ),
    };
    repository = new AuditRecordTypeOrmRepository(
      dataSource as unknown as DataSource,
    );
  });

  it('debe guardar todo en una sola transacción', async () => {
    await repository.save(crearRegistro());

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('debe crear o refrescar al usuario antes del evento', async () => {
    await repository.save(crearRegistro());

    expect(queryBuilder.into).toHaveBeenCalledWith(AuditUser);
    expect(queryBuilder.values).toHaveBeenCalledWith({
      id: USER_ID,
      username: 'admin@sisgal.com',
      email: 'admin@sisgal.com',
      role: 'ADMINISTRADOR',
    });
    expect(queryBuilder.orUpdate).toHaveBeenCalledWith(
      ['username', 'email', 'role'],
      ['id'],
      { skipUpdateIfNoValuesChanged: true },
    );
  });

  it('debe guardar el evento con todos sus datos', async () => {
    await repository.save(crearRegistro());

    expect(manager.save).toHaveBeenCalledWith(
      AuditEvent,
      expect.objectContaining({
        user: { id: USER_ID },
        action: 'PATCH /empleados/:id',
        entity: 'empleados',
        entity_id: '12',
        status: 'SUCCESS',
        http_status: 200,
        ip_address: '10.0.0.5',
        user_agent: 'jest',
        correlation_id: '11111111-1111-4111-8111-111111111111',
      }),
    );
  });

  it('no debe insertar detalle cuando el evento no lo tiene', async () => {
    await repository.save(crearRegistro());

    expect(manager.insert).not.toHaveBeenCalled();
  });

  it('debe guardar el detalle asociado al evento', async () => {
    await repository.save(
      crearRegistro({
        fieldChanges: [
          { fieldName: 'employee[12].phone', oldValue: '1', newValue: '2' },
        ],
        metadata: [{ key: 'method', value: 'PATCH' }],
        error: { message: 'falló', stackTrace: 'traza' },
        snapshot: { id: 12 },
      }),
    );

    expect(manager.insert).toHaveBeenCalledWith(AuditFieldChange, [
      {
        event: { id: EVENT_ID },
        field_name: 'employee[12].phone',
        old_value: '1',
        new_value: '2',
      },
    ]);
    expect(manager.insert).toHaveBeenCalledWith(AuditMetadata, [
      { event: { id: EVENT_ID }, key: 'method', value: 'PATCH' },
    ]);
    expect(manager.insert).toHaveBeenCalledWith(AuditError, {
      event: { id: EVENT_ID },
      error_message: 'falló',
      stack_trace: 'traza',
    });
    expect(manager.insert).toHaveBeenCalledWith(AuditSnapshot, {
      event: { id: EVENT_ID },
      full_state: { id: 12 },
    });
  });

  it('debe propagar el fallo para que la transacción se revierta', async () => {
    manager.insert.mockRejectedValue(new Error('violación de restricción'));

    await expect(
      repository.save(crearRegistro({ metadata: [{ key: 'a', value: 'b' }] })),
    ).rejects.toThrow('violación de restricción');
  });
});
