import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type {
  DataSource,
  EntitySubscriberInterface,
  ObjectLiteral,
  UpdateEvent,
} from 'typeorm';
import {
  MAX_FIELD_CHANGES_PER_EVENT,
  auditContext,
} from '../../domain/audit-context';
import { describeFieldChange } from '../../domain/audit-diff';

/** Esquema de la propia auditoría: sus cambios nunca se auditan (evita el bucle). */
const AUDIT_SCHEMA = 'auditoria';

/**
 * Detecta, para cualquier entidad del sistema, qué campos cambiaron y de qué
 * valor a cuál, sin que los módulos tengan que hacer nada. Los entrega al
 * evento de la petición que se está ejecutando.
 *
 * Alcance: solo ve las actualizaciones hechas con `save()`, que es donde
 * TypeORM conoce el valor anterior. Las hechas con `update()` o con el query
 * builder no traen el valor anterior, así que no se registran campo a campo
 * (el evento de la petición sí queda registrado).
 */
@Injectable()
export class AuditFieldChangeSubscriber implements EntitySubscriberInterface {
  constructor(@InjectDataSource() dataSource: DataSource) {
    // TypeORM no registra por sí solo a un suscriptor creado por Nest.
    dataSource.subscribers.push(this);
  }

  afterUpdate(event: UpdateEvent<ObjectLiteral>): void {
    try {
      const store = auditContext.getStore();

      // Fuera de una petición (un script, una migración) no hay evento al
      // que asociar el cambio.
      if (!store || event.metadata.schema === AUDIT_SCHEMA) {
        return;
      }
      if (!event.entity || !event.databaseEntity) {
        return;
      }

      const recordId = event.metadata.primaryColumns[0]?.getEntityValue(
        event.databaseEntity,
      );

      for (const column of event.updatedColumns) {
        if (store.fieldChanges.length >= MAX_FIELD_CHANGES_PER_EVENT) {
          return;
        }

        const change = describeFieldChange(
          event.metadata.tableName,
          recordId,
          column.propertyName,
          column.getEntityValue(event.databaseEntity),
          column.getEntityValue(event.entity),
        );
        if (change) {
          store.fieldChanges.push(change);
        }
      }
    } catch {
      // Detectar cambios es secundario: un fallo aquí no debe afectar la
      // operación del negocio que se está guardando.
    }
  }
}
