import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  AuditError,
  AuditEvent,
  AuditFieldChange,
  AuditMetadata,
  AuditSnapshot,
  AuditUser,
} from 'src/entities';
import type { AuditRecord } from '../../../domain/audit-record';
import type { AuditRecordRepositoryPort } from '../../../domain/ports/audit-record.repository.port';

@Injectable()
export class AuditRecordTypeOrmRepository implements AuditRecordRepositoryPort {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async save(record: AuditRecord): Promise<void> {
    // Una sola transacción: el evento nunca queda sin su detalle ni al revés.
    await this.dataSource.transaction(async (manager) => {
      // El usuario se crea la primera vez que actúa y se refresca después, por
      // si cambió de correo o de rol. Si nada cambió, no se escribe.
      await manager
        .createQueryBuilder()
        .insert()
        .into(AuditUser)
        .values({
          id: record.actor.id,
          username: record.actor.username,
          email: record.actor.email,
          role: record.actor.role,
        })
        .orUpdate(['username', 'email', 'role'], ['id'], {
          skipUpdateIfNoValuesChanged: true,
        })
        .execute();

      const event = await manager.save(
        AuditEvent,
        manager.create(AuditEvent, {
          user: { id: record.actor.id },
          action: record.action,
          entity: record.entity,
          entity_id: record.entityId,
          status: record.status,
          http_status: record.httpStatus,
          ip_address: record.ipAddress,
          user_agent: record.userAgent,
          created_at: record.createdAt,
          correlation_id: record.correlationId,
        }),
      );

      if (record.fieldChanges.length > 0) {
        await manager.insert(
          AuditFieldChange,
          record.fieldChanges.map((change) => ({
            event: { id: event.id },
            field_name: change.fieldName,
            old_value: change.oldValue,
            new_value: change.newValue,
          })),
        );
      }

      if (record.metadata.length > 0) {
        await manager.insert(
          AuditMetadata,
          record.metadata.map((item) => ({
            event: { id: event.id },
            key: item.key,
            value: item.value,
          })),
        );
      }

      if (record.error) {
        await manager.insert(AuditError, {
          event: { id: event.id },
          error_message: record.error.message,
          stack_trace: record.error.stackTrace,
        });
      }

      if (record.snapshot !== null) {
        await manager.insert(AuditSnapshot, {
          event: { id: event.id },
          full_state: record.snapshot,
        });
      }
    });
  }
}
