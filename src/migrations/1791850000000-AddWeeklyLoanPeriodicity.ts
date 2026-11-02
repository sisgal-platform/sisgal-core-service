import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Los préstamos también pueden descontarse cada semana: se amplía la
 * restricción de la periodicidad para admitir SEMANAL.
 */
export class AddWeeklyLoanPeriodicity1791850000000 implements MigrationInterface {
    name = 'AddWeeklyLoanPeriodicity1791850000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "employee_loans" DROP CONSTRAINT "CHK_employee_loans_periodicity"`);
        await queryRunner.query(`ALTER TABLE "employee_loans" ADD CONSTRAINT "CHK_employee_loans_periodicity" CHECK ("periodicity" IN ('MENSUAL', 'QUINCENAL', 'SEMANAL'))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "employee_loans" DROP CONSTRAINT "CHK_employee_loans_periodicity"`);
        // Falla si queda un préstamo semanal: debe cambiarse su periodicidad antes de revertir.
        await queryRunner.query(`ALTER TABLE "employee_loans" ADD CONSTRAINT "CHK_employee_loans_periodicity" CHECK ("periodicity" IN ('MENSUAL', 'QUINCENAL'))`);
    }
}
