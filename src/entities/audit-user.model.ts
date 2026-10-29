import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { AuditEvent } from './audit-event.model';

/**
 * Usuario que aparece en la auditoría. Es una copia mínima de la identidad del
 * momento (el id es el del usuario de Supabase), para que el historial se
 * conserve aunque el usuario cambie de correo o de rol o se elimine después.
 */
@Entity({ schema: 'auditoria', name: 'audit_user' })
export class AuditUser {
  // El id lo define el origen de la identidad (Supabase), no la base de datos.
  @PrimaryColumn('uuid')
  id!: string;

  @Column('varchar')
  username!: string;

  @Column('varchar')
  email!: string;

  @Column('varchar')
  role!: string;

  @OneToMany(() => AuditEvent, (event) => event.user)
  events!: AuditEvent[];
}
