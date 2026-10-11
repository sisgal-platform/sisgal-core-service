import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * HU37 - Configurar parámetros de nómina: descuentos legales.
 *
 * Hasta ahora `system_config` admitía una sola fila por parámetro (la llave
 * primaria era `key`). Para conservar el historial, cada parámetro pasa a
 * tener varias versiones: la llave primaria es un `id` propio, la versión más
 * reciente puede no tener fecha de fin y la base de datos impide que dos
 * versiones de un mismo parámetro tengan períodos de vigencia superpuestos.
 *
 * La restricción usa la extensión `btree_gist`, que ya instala la migración
 * de los recargos laborales.
 */
export class VersionSystemConfigValidity1791740000000 implements MigrationInterface {
    name = 'VersionSystemConfigValidity1791740000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "system_config" DROP CONSTRAINT "PK_eedd3cd0f227c7fb5eff2204e93"`);
        await queryRunner.query(`ALTER TABLE "system_config" ADD "id" SERIAL NOT NULL`);
        await queryRunner.query(`ALTER TABLE "system_config" ADD CONSTRAINT "PK_system_config_id" PRIMARY KEY ("id")`);
        await queryRunner.query(`ALTER TABLE "system_config" ALTER COLUMN "valid_to" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "system_config" ADD CONSTRAINT "EXCL_system_config_valid_period" EXCLUDE USING gist ("key" WITH =, daterange("valid_from", "valid_to", '[]') WITH &&)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "system_config" DROP CONSTRAINT "EXCL_system_config_valid_period"`);
        // Falla si queda una versión sin fecha de fin: debe cerrarse antes de revertir.
        await queryRunner.query(`ALTER TABLE "system_config" ALTER COLUMN "valid_to" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "system_config" DROP CONSTRAINT "PK_system_config_id"`);
        await queryRunner.query(`ALTER TABLE "system_config" DROP COLUMN "id"`);
        // Falla si algún parámetro tiene más de una versión: solo debe quedar una por clave.
        await queryRunner.query(`ALTER TABLE "system_config" ADD CONSTRAINT "PK_eedd3cd0f227c7fb5eff2204e93" PRIMARY KEY ("key")`);
    }
}
