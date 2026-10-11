import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * HU45 - Configurar parámetros de nómina: jornada laboral.
 *
 * Permite que la versión más reciente de la jornada no tenga fecha de fin
 * (rige hasta que se registre la siguiente) e impide a nivel de base de datos
 * que dos versiones tengan períodos de vigencia superpuestos. En el rango, un
 * `valid_to` nulo equivale a un período sin límite superior.
 */
export class VersionWorkdayConfigValidity1791720000000 implements MigrationInterface {
    name = 'VersionWorkdayConfigValidity1791720000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "workday_config" ALTER COLUMN "valid_to" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "workday_config" ADD CONSTRAINT "EXCL_workday_config_valid_period" EXCLUDE USING gist (daterange("valid_from", "valid_to", '[]') WITH &&)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "workday_config" DROP CONSTRAINT "EXCL_workday_config_valid_period"`);
        // Falla si queda una versión sin fecha de fin: debe cerrarse antes de revertir.
        await queryRunner.query(`ALTER TABLE "workday_config" ALTER COLUMN "valid_to" SET NOT NULL`);
    }
}
