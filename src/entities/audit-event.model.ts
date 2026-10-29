import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditUser } from './audit-user.model';
import { AuditFieldChange } from './audit-field-change.model';
import { AuditMetadata } from './audit-metadata.model';
import { AuditError } from './audit-error.model';
import { AuditSnapshot } from './audit-snapshot.model';

/**
 * Hecho auditado: quién hizo qué, sobre qué, cuándo, desde dónde y con qué
 * resultado. El detalle (cambios de campos, metadatos, error y estado
 * completo) cuelga de este registro en tablas aparte.
 *
 * Los registros son de solo inserción: la base de datos rechaza cualquier
 * UPDATE o DELETE sobre ellos.
 */
@Entity({ schema: 'auditoria', name: 'audit_event' })
export class AuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => AuditUser, (user) => user.events, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user!: AuditUser;

  // Acción identificable, por ejemplo "POST /liquidaciones/:employeeId".
  @Column('varchar')
  action!: string;

  // Recurso afectado, por ejemplo "liquidaciones".
  @Column('varchar')
  entity!: string;

  @Column('varchar', { nullable: true })
  entity_id!: string | null;

  // SUCCESS o FAILED.
  @Column('varchar')
  status!: string;

  @Column('int', { nullable: true })
  http_status!: number | null;

  @Column('varchar', { nullable: true })
  ip_address!: string | null;

  @Column('varchar', { nullable: true })
  user_agent!: string | null;

  @Column('timestamptz', { default: () => 'now()' })
  created_at!: Date;

  // Une todos los registros que salen de una misma petición.
  @Column('uuid', { nullable: true })
  correlation_id!: string | null;

  @OneToMany(() => AuditFieldChange, (change) => change.event)
  fieldChanges!: AuditFieldChange[];

  @OneToMany(() => AuditMetadata, (metadata) => metadata.event)
  metadata!: AuditMetadata[];

  @OneToMany(() => AuditError, (error) => error.event)
  errors!: AuditError[];

  @OneToMany(() => AuditSnapshot, (snapshot) => snapshot.event)
  snapshots!: AuditSnapshot[];
}
