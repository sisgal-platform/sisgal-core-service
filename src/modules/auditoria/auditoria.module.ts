import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AuditError,
  AuditEvent,
  AuditFieldChange,
  AuditMetadata,
  AuditSnapshot,
  AuditUser,
} from 'src/entities';
import { AuditService } from './application/services/audit.service';
import { AUDIT_RECORD_REPOSITORY_PORT } from './domain/ports/audit-record.repository.port';
import { AuditExceptionFilter } from './infrastructure/http/audit-exception.filter';
import { AuditInterceptor } from './infrastructure/http/audit.interceptor';
import { AuditFieldChangeSubscriber } from './infrastructure/persistence/audit-field-change.subscriber';
import { AuditRecordTypeOrmRepository } from './infrastructure/persistence/repositories/audit-record.typeorm.repository';

/**
 * Auditoría automática del sistema. Al importar este módulo en `AppModule`
 * queda activa para toda la aplicación, sin que los demás módulos tengan que
 * hacer nada:
 * - el interceptor registra las peticiones que modifican datos y terminan bien;
 * - el filtro registra las que fallan y los accesos rechazados (401 y 403);
 * - el suscriptor de TypeORM detecta qué campos cambiaron y de qué valor a cuál.
 *
 * No expone ningún endpoint: la auditoría solo se escribe desde el backend.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AuditUser,
      AuditEvent,
      AuditFieldChange,
      AuditMetadata,
      AuditError,
      AuditSnapshot,
    ]),
  ],
  providers: [
    AuditService,
    {
      provide: AUDIT_RECORD_REPOSITORY_PORT,
      useClass: AuditRecordTypeOrmRepository,
    },
    AuditFieldChangeSubscriber,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: AuditExceptionFilter },
  ],
  exports: [AuditService],
})
export class AuditoriaModule {}
