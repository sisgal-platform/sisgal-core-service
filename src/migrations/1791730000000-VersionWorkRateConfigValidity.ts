import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * HU39 - Configurar parámetros de nómina: recargos laborales.
 *
 * Hasta ahora `work_rate_config` admitía una sola fila por tipo de hora (la
 * llave primaria era `type`). Para conservar el historial, cada tipo pasa a
 * tener varias versiones: la llave primaria es un `id` propio, la versión más
 * reciente puede no tener fecha de fin y la base de datos impide que dos
 * versiones de un mismo tipo tengan períodos de vigencia superpuestos.
 *
 * La restricción combina igualdad sobre `type` con solapamiento de rangos, por
 * lo que requiere la extensión `btree_gist` (en el esquema `extensions`, como
 * las demás extensiones del proyecto en Supabase).
 */
export class VersionWorkRateConfigValidity1791730000000 implements MigrationInterface {
    name = 'VersionWorkRateConfigValidity1791730000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA "extensions"`);
        await queryRunner.query(`ALTER TABLE "work_rate_config" DROP CONSTRAINT "PK_f5c1551c605582725f09e488a15"`);
        await queryRunner.query(`ALTER TABLE "work_rate_config" ADD "id" SERIAL NOT NULL`);
        await queryRunner.query(`ALTER TABLE "work_rate_config" ADD CONSTRAINT "PK_work_rate_config_id" PRIMARY KEY ("id")`);
        await queryRunner.query(`ALTER TABLE "work_rate_config" ALTER COLUMN "valid_to" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "work_rate_config" ADD CONSTRAINT "EXCL_work_rate_config_valid_period" EXCLUDE USING gist ("type" WITH =, daterange("valid_from", "valid_to", '[]') WITH &&)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "work_rate_config" DROP CONSTRAINT "EXCL_work_rate_config_valid_period"`);
        // Falla si queda una versión sin fecha de fin: debe cerrarse antes de revertir.
        await queryRunner.query(`ALTER TABLE "work_rate_config" ALTER COLUMN "valid_to" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "work_rate_config" DROP CONSTRAINT "PK_work_rate_config_id"`);
        await queryRunner.query(`ALTER TABLE "work_rate_config" DROP COLUMN "id"`);
        // Falla si algún tipo tiene más de una versión: solo debe quedar una por tipo.
        await queryRunner.query(`ALTER TABLE "work_rate_config" ADD CONSTRAINT "PK_f5c1551c605582725f09e488a15" PRIMARY KEY ("type")`);
    }
}
