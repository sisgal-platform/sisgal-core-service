import { DataSource, DataSourceOptions } from 'typeorm';
import 'dotenv/config';
import {
  AuditError,
  AuditEvent,
  AuditFieldChange,
  AuditMetadata,
  AuditSnapshot,
  AuditUser,
} from '../entities';
import { CreateAuditoriaSchema1791840000000 } from '../migrations/1791840000000-CreateAuditoriaSchema';

/**
 * Nombre de la conexión de auditoría en Nest. Se usa en
 * `@InjectDataSource(AUDIT_DATA_SOURCE)` y en `TypeOrmModule.forFeature(...)`.
 */
export const AUDIT_DATA_SOURCE = 'auditoria';

/**
 * La auditoría vive en una base de datos aparte (otro proyecto de Supabase),
 * separada de los datos del negocio: así un problema o una carga alta en una
 * no afecta a la otra, y el acceso a cada una se controla por separado.
 *
 * Solo contiene las tablas del esquema `auditoria`. El suscriptor que detecta
 * los cambios de campos sigue escuchando la conexión principal (donde ocurren
 * los cambios del negocio); esta conexión solo se usa para escribir el evento.
 */
export const auditDataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.AUDIT_SUPABASE_DB_URL,
  synchronize: false,
  entities: [
    AuditUser,
    AuditEvent,
    AuditFieldChange,
    AuditMetadata,
    AuditError,
    AuditSnapshot,
  ],
  ssl: { rejectUnauthorized: false },
  migrations: [CreateAuditoriaSchema1791840000000],
};

export const AuditDataSource = new DataSource(auditDataSourceOptions);
