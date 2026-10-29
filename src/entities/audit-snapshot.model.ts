import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditEvent } from './audit-event.model';

/** Estado completo del recurso después del evento (la respuesta entregada). */
@Entity({ schema: 'auditoria', name: 'audit_snapshot' })
export class AuditSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => AuditEvent, (event) => event.snapshots, { nullable: false })
  @JoinColumn({ name: 'event_id' })
  event!: AuditEvent;

  @Column('json', { nullable: true })
  full_state!: unknown;
}
