import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Agrega los índices que usa la consulta de liquidaciones: filtro por
 * empleado combinado con el orden por período, y el join con las líneas
 * de la liquidación en el detalle.
 */
export class AddPayrollPeriodIndexes1791200000000 implements MigrationInterface {
    name = 'AddPayrollPeriodIndexes1791200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX "IDX_payroll_period_employee_period_start" ON "payroll_period" ("employee_id", "period_start")`);
        await queryRunner.query(`CREATE INDEX "IDX_payroll_line_payroll_period" ON "payroll_line" ("payroll_period_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_payroll_line_payroll_period"`);
        await queryRunner.query(`DROP INDEX "IDX_payroll_period_employee_period_start"`);
    }
}
