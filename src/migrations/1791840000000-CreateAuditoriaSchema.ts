import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Auditoría del sistema: quién hizo qué, sobre qué, cuándo y con qué resultado.
 *
 * Vive en su propio esquema (`auditoria`) para separarla de los datos del
 * negocio y de lo que expone la API pública de Supabase.
 *
 * Medidas de seguridad que deja la migración:
 * - Solo inserción: un trigger rechaza UPDATE, DELETE y TRUNCATE sobre los
 *   eventos y su detalle, así que el historial no se puede alterar ni borrar
 *   (ni siquiera desde el backend). Solo `audit_user` admite UPDATE, porque se
 *   refresca el correo y el rol del usuario cada vez que actúa.
 * - RLS activado sin políticas y permisos revocados a `anon` y `authenticated`:
 *   nadie puede leer ni escribir la auditoría por la API pública. El backend se
 *   conecta con el rol `postgres`, que no se ve afectado.
 *
 * Es idempotente: las tablas pueden existir ya (se crearon a mano a partir del
 * diagrama), y en ese caso solo se completan las restricciones que falten.
 */
export class CreateAuditoriaSchema1791840000000 implements MigrationInterface {
  name = 'CreateAuditoriaSchema1791840000000';

  /** Tablas cuyo contenido nunca debe modificarse ni borrarse. */
  private readonly appendOnlyTables = [
    'audit_event',
    'audit_field_change',
    'audit_metadata',
    'audit_error',
    'audit_snapshot',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "auditoria"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "auditoria"."audit_user" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "username" character varying NOT NULL,
        "email" character varying NOT NULL,
        "role" character varying NOT NULL,
        CONSTRAINT "PK_audit_user" PRIMARY KEY ("id")
      )`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "auditoria"."audit_event" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "action" character varying NOT NULL,
        "entity" character varying NOT NULL,
        "entity_id" character varying,
        "status" character varying NOT NULL,
        "http_status" integer,
        "ip_address" character varying,
        "user_agent" character varying,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "correlation_id" uuid,
        CONSTRAINT "PK_audit_event" PRIMARY KEY ("id"),
        CONSTRAINT "FK_audit_event_user" FOREIGN KEY ("user_id") REFERENCES "auditoria"."audit_user" ("id")
      )`);

    for (const [table, columns] of [
      [
        'audit_field_change',
        `"field_name" character varying NOT NULL, "old_value" text, "new_value" text`,
      ],
      ['audit_metadata', `"key" character varying NOT NULL, "value" text`],
      ['audit_error', `"error_message" text, "stack_trace" text`],
      ['audit_snapshot', `"full_state" json`],
    ]) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "auditoria"."${table}" (
          "id" uuid NOT NULL DEFAULT gen_random_uuid(),
          "event_id" uuid NOT NULL,
          ${columns},
          CONSTRAINT "PK_${table}" PRIMARY KEY ("id"),
          CONSTRAINT "FK_${table}_event" FOREIGN KEY ("event_id") REFERENCES "auditoria"."audit_event" ("id")
        )`);
    }

    // Si la tabla se creó a mano, puede tener user_id opcional.
    await queryRunner.query(
      `ALTER TABLE "auditoria"."audit_event" ALTER COLUMN "user_id" SET NOT NULL`,
    );

    // Valores válidos a nivel de base de datos (CREATE TABLE IF NOT EXISTS no
    // los agrega a tablas ya existentes, y ADD CONSTRAINT no tiene IF NOT EXISTS).
    await this.addCheck(
      queryRunner,
      'CHK_audit_event_status',
      `"status" IN ('SUCCESS', 'FAILED')`,
    );
    await this.addCheck(
      queryRunner,
      'CHK_audit_event_http_status',
      `"http_status" IS NULL OR "http_status" BETWEEN 100 AND 599`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audit_event_user_id" ON "auditoria"."audit_event" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audit_event_created_at" ON "auditoria"."audit_event" ("created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audit_event_correlation_id" ON "auditoria"."audit_event" ("correlation_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audit_event_entity" ON "auditoria"."audit_event" ("entity", "entity_id")`,
    );
    for (const table of this.appendOnlyTables.filter(
      (name) => name !== 'audit_event',
    )) {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_${table}_event_id" ON "auditoria"."${table}" ("event_id")`,
      );
    }

    await this.protectHistory(queryRunner);
    await this.restrictAccess(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Se deja el esquema: lo creó el equipo a mano y podría tener otros usos.
    for (const table of [
      'audit_snapshot',
      'audit_error',
      'audit_metadata',
      'audit_field_change',
      'audit_event',
      'audit_user',
    ]) {
      await queryRunner.query(
        `DROP TABLE IF EXISTS "auditoria"."${table}" CASCADE`,
      );
    }
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS "auditoria"."prevent_audit_modification"()`,
    );
  }

  private async addCheck(
    queryRunner: QueryRunner,
    name: string,
    expression: string,
  ): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = '${name}'
            AND conrelid = 'auditoria.audit_event'::regclass
        ) THEN
          ALTER TABLE "auditoria"."audit_event"
            ADD CONSTRAINT "${name}" CHECK (${expression});
        END IF;
      END $$`);
  }

  /** Triggers que vuelven la auditoría de solo inserción. */
  private async protectHistory(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "auditoria"."prevent_audit_modification"()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION 'Los registros de auditoría no se pueden modificar ni eliminar (tabla %, operación %).',
          TG_TABLE_NAME, TG_OP
          USING ERRCODE = 'restrict_violation';
      END;
      $$`);

    // Eventos y detalle: ni UPDATE, ni DELETE, ni TRUNCATE.
    for (const table of this.appendOnlyTables) {
      await queryRunner.query(
        `DROP TRIGGER IF EXISTS "trg_${table}_append_only" ON "auditoria"."${table}"`,
      );
      await queryRunner.query(`
        CREATE TRIGGER "trg_${table}_append_only"
        BEFORE UPDATE OR DELETE ON "auditoria"."${table}"
        FOR EACH ROW EXECUTE FUNCTION "auditoria"."prevent_audit_modification"()`);
      await queryRunner.query(`
        DROP TRIGGER IF EXISTS "trg_${table}_no_truncate" ON "auditoria"."${table}"`);
      await queryRunner.query(`
        CREATE TRIGGER "trg_${table}_no_truncate"
        BEFORE TRUNCATE ON "auditoria"."${table}"
        FOR EACH STATEMENT EXECUTE FUNCTION "auditoria"."prevent_audit_modification"()`);
    }

    // Usuarios: se permite UPDATE (refresca correo y rol), pero no DELETE.
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "trg_audit_user_no_delete" ON "auditoria"."audit_user"`,
    );
    await queryRunner.query(`
      CREATE TRIGGER "trg_audit_user_no_delete"
      BEFORE DELETE OR TRUNCATE ON "auditoria"."audit_user"
      FOR EACH STATEMENT EXECUTE FUNCTION "auditoria"."prevent_audit_modification"()`);
  }

  /** RLS sin políticas y sin permisos para los roles de la API pública. */
  private async restrictAccess(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['audit_user', ...this.appendOnlyTables]) {
      await queryRunner.query(
        `ALTER TABLE "auditoria"."${table}" ENABLE ROW LEVEL SECURITY`,
      );
    }

    // Los roles de Supabase pueden no existir en otros entornos (por ejemplo
    // una base local), así que solo se revoca si están.
    await queryRunner.query(`
      DO $$
      DECLARE
        role_name text;
      BEGIN
        FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
        LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format('REVOKE ALL ON SCHEMA auditoria FROM %I', role_name);
            EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA auditoria FROM %I', role_name);
          END IF;
        END LOOP;
      END $$`);
  }
}
