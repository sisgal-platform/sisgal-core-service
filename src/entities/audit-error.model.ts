import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditEvent } from './audit-event.model';

/** Error que hizo fallar el evento. */
@Entity({ schema: 'auditoria', name: 'audit_error' })
export class AuditError {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => AuditEvent, (event) => event.errors, { nullable: false })
  @JoinColumn({ name: 'event_id' })
  event!: AuditEvent;

  @Column('text', { nullable: true })
  error_message!: string | null;

  // Solo se guarda en errores internos (500); en los de negocio no aporta.
  @Column('text', { nullable: true })
  stack_trace!: string | null;
}
