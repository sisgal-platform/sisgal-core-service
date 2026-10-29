import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditEvent } from './audit-event.model';

/** Valor anterior y nuevo de un campo que cambió durante el evento. */
@Entity({ schema: 'auditoria', name: 'audit_field_change' })
export class AuditFieldChange {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => AuditEvent, (event) => event.fieldChanges, {
    nullable: false,
  })
  @JoinColumn({ name: 'event_id' })
  event!: AuditEvent;

  // Incluye la tabla y el id del registro, por ejemplo "employee[12].salary_base".
  @Column('varchar')
  field_name!: string;

  @Column('text', { nullable: true })
  old_value!: string | null;

  @Column('text', { nullable: true })
  new_value!: string | null;
}
