import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditEvent } from './audit-event.model';

/** Dato adicional del evento en formato clave-valor (método, ruta, duración, etc.). */
@Entity({ schema: 'auditoria', name: 'audit_metadata' })
export class AuditMetadata {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => AuditEvent, (event) => event.metadata, { nullable: false })
  @JoinColumn({ name: 'event_id' })
  event!: AuditEvent;

  @Column('varchar')
  key!: string;

  @Column('text', { nullable: true })
  value!: string | null;
}
