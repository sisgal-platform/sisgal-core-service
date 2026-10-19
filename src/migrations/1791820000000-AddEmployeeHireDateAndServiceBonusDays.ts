import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * HU16 - Calcular primas.
 *
 * La prima de servicios es proporcional al tiempo trabajado en el semestre,
 * así que el empleado necesita su fecha de ingreso. Los empleados que ya
 * existen quedan sin fecha: el cálculo de la prima pide registrarla.
 *
 * Los días de prima por año (30 según la ley) quedan como parámetro
 * versionado de `system_config`, para poder cambiarlos sin tocar el código.
 */
export class AddEmployeeHireDateAndServiceBonusDays1791820000000 implements MigrationInterface {
    name = 'AddEmployeeHireDateAndServiceBonusDays1791820000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "employee" ADD "hire_date" date`);
        await queryRunner.query(`INSERT INTO "system_config" ("key", "value", "valid_from", "valid_to") VALUES ('SERVICE_BONUS_DAYS_PER_YEAR', 30, '2026-01-01', NULL)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "system_config" WHERE "key" = 'SERVICE_BONUS_DAYS_PER_YEAR'`);
        await queryRunner.query(`ALTER TABLE "employee" DROP COLUMN "hire_date"`);
    }
}
