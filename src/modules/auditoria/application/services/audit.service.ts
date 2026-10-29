import { Inject, Injectable, Logger } from '@nestjs/common';
import { resolveAuditActor } from '../../domain/audit-actor';
import type { AuditInput } from '../../domain/audit-input';
import { MAX_FIELD_CHANGES_PER_EVENT } from '../../domain/audit-context';
import type {
  AuditFieldChangeRecord,
  AuditMetadataRecord,
  AuditRecord,
} from '../../domain/audit-record';
import {
  MAX_ERROR_TEXT,
  MAX_SHORT_TEXT,
  REDACTED,
  isSensitiveKey,
  toAuditText,
  toBoundedSnapshot,
  truncate,
} from '../../domain/audit-sanitizer';
import { AUDIT_RECORD_REPOSITORY_PORT } from '../../domain/ports/audit-record.repository.port';
import type { AuditRecordRepositoryPort } from '../../domain/ports/audit-record.repository.port';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @Inject(AUDIT_RECORD_REPOSITORY_PORT)
    private readonly auditRecordRepository: AuditRecordRepositoryPort,
  ) {}

  /**
   * Registra un evento de auditoría. Nunca lanza error: si la auditoría
   * falla, la operación del negocio que se estaba auditando no debe fallar con
   * ella. El fallo queda en el log, sin los datos del evento, para no filtrar
   * información sensible.
   */
  async record(input: AuditInput): Promise<void> {
    try {
      await this.auditRecordRepository.save(this.toRecord(input));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `No se pudo registrar el evento de auditoría "${this.forLog(input.action)}": ${this.forLog(reason)}`,
      );
    }
  }

  /** Depura la entrada: quita datos sensibles y acota todos los tamaños. */
  private toRecord(input: AuditInput): AuditRecord {
    const { snapshot, omitted } = toBoundedSnapshot(input.snapshot);

    const metadata = this.toMetadataRecords(input.metadata ?? {});
    if (omitted) {
      metadata.push({ key: 'snapshot_omitted', value: 'true' });
    }

    return {
      actor: resolveAuditActor(input.actor),
      action: truncate(input.action, MAX_SHORT_TEXT),
      entity: truncate(input.entity, MAX_SHORT_TEXT),
      entityId: input.entityId
        ? truncate(input.entityId, MAX_SHORT_TEXT)
        : null,
      status: input.status,
      httpStatus: input.httpStatus ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      createdAt: input.createdAt ?? new Date(),
      correlationId: input.correlationId ?? null,
      fieldChanges: this.toFieldChangeRecords(input.fieldChanges ?? []),
      metadata,
      error: input.error
        ? {
            message: input.error.message
              ? truncate(input.error.message, MAX_ERROR_TEXT)
              : null,
            stackTrace: input.error.stackTrace
              ? truncate(input.error.stackTrace, MAX_ERROR_TEXT)
              : null,
          }
        : null,
      snapshot,
    };
  }

  private toMetadataRecords(
    metadata: Record<string, unknown>,
  ): AuditMetadataRecord[] {
    return Object.entries(metadata)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => ({
        key: truncate(key, MAX_SHORT_TEXT),
        value: isSensitiveKey(key) ? REDACTED : toAuditText(value),
      }));
  }

  private toFieldChangeRecords(
    changes: AuditFieldChangeRecord[],
  ): AuditFieldChangeRecord[] {
    return changes.slice(0, MAX_FIELD_CHANGES_PER_EVENT).map((change) => {
      const sensitive = isSensitiveKey(change.fieldName);
      return {
        fieldName: truncate(change.fieldName, MAX_SHORT_TEXT),
        oldValue: sensitive ? REDACTED : toAuditText(change.oldValue),
        newValue: sensitive ? REDACTED : toAuditText(change.newValue),
      };
    });
  }

  /** Quita saltos de línea para que un texto del cliente no pueda falsificar líneas del log. */
  private forLog(text: string): string {
    return truncate(text.replace(/[\r\n]+/g, ' '), MAX_SHORT_TEXT);
  }
}
