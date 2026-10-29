import type { DataSource, ObjectLiteral, UpdateEvent } from 'typeorm';
import {
  MAX_FIELD_CHANGES_PER_EVENT,
  auditContext,
} from '../../domain/audit-context';
import type { AuditContext } from '../../domain/audit-context';
import { AuditFieldChangeSubscriber } from './audit-field-change.subscriber';

interface ColumnDouble {
  propertyName: string;
  getEntityValue: (entity: ObjectLiteral) => unknown;
}

function columna(propertyName: string): ColumnDouble {
  return {
    propertyName,
    getEntityValue: (entity) => entity[propertyName],
  };
}

function crearEvento(
  overrides: Partial<{
    schema: string | undefined;
    entity: ObjectLiteral | undefined;
    databaseEntity: ObjectLiteral | undefined;
    updatedColumns: ColumnDouble[];
  }> = {},
): UpdateEvent<ObjectLiteral> {
  const {
    schema,
    entity = { id: 12, status: 'INACTIVO', salary_base: 1200000 },
    databaseEntity = { id: 12, status: 'ACTIVO', salary_base: '1200000.00' },
    updatedColumns = [columna('status'), columna('salary_base')],
  } = overrides;

  return {
    entity,
    databaseEntity,
    updatedColumns,
    metadata: {
      schema,
      tableName: 'employee',
      primaryColumns: [columna('id')],
    },
  } as unknown as UpdateEvent<ObjectLiteral>;
}

describe('AuditFieldChangeSubscriber', () => {
  let subscriber: AuditFieldChangeSubscriber;
  let subscribers: unknown[];

  /** Ejecuta la actualización dentro del contexto de una petición, como lo hace el interceptor. */
  function dentroDeUnaPeticion(
    event: UpdateEvent<ObjectLiteral>,
  ): AuditContext {
    const store: AuditContext = { fieldChanges: [] };
    auditContext.run(store, () => subscriber.afterUpdate(event));
    return store;
  }

  beforeEach(() => {
    subscribers = [];
    subscriber = new AuditFieldChangeSubscriber({
      subscribers,
    } as unknown as DataSource);
  });

  it('debe registrarse en el DataSource de TypeORM', () => {
    expect(subscribers).toEqual([subscriber]);
  });

  it('debe registrar solo los campos que realmente cambiaron', () => {
    const store = dentroDeUnaPeticion(crearEvento());

    // salary_base solo cambia de "1200000.00" (texto de la BD) a 1200000: no es un cambio.
    expect(store.fieldChanges).toEqual([
      {
        fieldName: 'employee[12].status',
        oldValue: 'ACTIVO',
        newValue: 'INACTIVO',
      },
    ]);
  });

  it('debe ignorar las actualizaciones fuera de una petición', () => {
    expect(() => subscriber.afterUpdate(crearEvento())).not.toThrow();
  });

  it('debe ignorar los cambios de la propia auditoría para no entrar en bucle', () => {
    const store = dentroDeUnaPeticion(crearEvento({ schema: 'auditoria' }));

    expect(store.fieldChanges).toEqual([]);
  });

  it('debe ignorar una actualización que no trae el valor anterior (update o query builder)', () => {
    const evento = crearEvento();
    evento.databaseEntity = undefined as unknown as ObjectLiteral;

    const store = dentroDeUnaPeticion(evento);

    expect(store.fieldChanges).toEqual([]);
  });

  it('debe respetar el máximo de cambios por evento', () => {
    const store: AuditContext = {
      fieldChanges: Array.from({ length: MAX_FIELD_CHANGES_PER_EVENT }, () => ({
        fieldName: 'x',
        oldValue: null,
        newValue: null,
      })),
    };

    auditContext.run(store, () => subscriber.afterUpdate(crearEvento()));

    expect(store.fieldChanges).toHaveLength(MAX_FIELD_CHANGES_PER_EVENT);
  });

  it('nunca debe interrumpir el guardado del negocio, aunque falle por dentro', () => {
    const evento = crearEvento({
      updatedColumns: [
        {
          propertyName: 'status',
          getEntityValue: () => {
            throw new Error('columna rota');
          },
        },
      ],
    });

    const store: AuditContext = { fieldChanges: [] };
    expect(() =>
      auditContext.run(store, () => subscriber.afterUpdate(evento)),
    ).not.toThrow();
  });

  it('no debe mezclar los cambios de dos peticiones simultáneas', async () => {
    const a: AuditContext = { fieldChanges: [] };
    const b: AuditContext = { fieldChanges: [] };

    await Promise.all([
      auditContext.run(a, async () => {
        await new Promise((resolve) => setTimeout(resolve, 15));
        subscriber.afterUpdate(
          crearEvento({
            entity: { id: 1, status: 'A', salary_base: 1 },
            databaseEntity: { id: 1, status: 'X', salary_base: 1 },
          }),
        );
      }),
      auditContext.run(b, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        subscriber.afterUpdate(
          crearEvento({
            entity: { id: 2, status: 'B', salary_base: 1 },
            databaseEntity: { id: 2, status: 'Y', salary_base: 1 },
          }),
        );
      }),
    ]);

    expect(a.fieldChanges.map((c) => c.fieldName)).toEqual([
      'employee[1].status',
    ]);
    expect(b.fieldChanges.map((c) => c.fieldName)).toEqual([
      'employee[2].status',
    ]);
  });
});
