import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * HU10 - Descontar cuotas de préstamos automáticamente.
 *
 * Cada préstamo tiene una periodicidad (MENSUAL o QUINCENAL) que define en
 * qué liquidaciones se descuenta su cuota; los préstamos que ya existen
 * quedan como mensuales.
 *
 * `loan_installment` guarda cada cuota descontada con el saldo y las cuotas
 * pendientes antes y después del descuento. Un préstamo no puede tener dos
 * cuotas en la misma liquidación y un concepto de la liquidación corresponde
 * a una sola cuota. La tabla tiene RLS activo sin políticas, como
 * `employee_loans`: solo el backend, dueño de la tabla, la consulta.
 */
export class AddLoanInstallments1791810000000 implements MigrationInterface {
    name = 'AddLoanInstallments1791810000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "employee_loans" ADD "periodicity" character varying(20) NOT NULL DEFAULT 'MENSUAL'`);
        await queryRunner.query(`ALTER TABLE "employee_loans" ADD CONSTRAINT "CHK_employee_loans_periodicity" CHECK ("periodicity" IN ('MENSUAL', 'QUINCENAL'))`);
        await queryRunner.query(`CREATE TABLE "loan_installment" ("id" SERIAL NOT NULL, "loan_id" integer NOT NULL, "employee_id" integer NOT NULL, "payroll_period_id" integer NOT NULL, "payroll_line_id" integer NOT NULL, "installments_applied" integer NOT NULL, "scheduled_amount" numeric(15,2) NOT NULL, "amount" numeric(15,2) NOT NULL, "previous_balance" numeric(15,2) NOT NULL, "new_balance" numeric(15,2) NOT NULL, "previous_pending_installments" integer NOT NULL, "remaining_installments" integer NOT NULL, "applied_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_loan_installment" PRIMARY KEY ("id"), CONSTRAINT "UQ_loan_installment_loan_payroll_period" UNIQUE ("loan_id", "payroll_period_id"), CONSTRAINT "UQ_loan_installment_payroll_line" UNIQUE ("payroll_line_id"), CONSTRAINT "CHK_loan_installment_amount" CHECK ("amount" > 0 AND "amount" <= "scheduled_amount" AND "amount" <= "previous_balance"), CONSTRAINT "CHK_loan_installment_balance" CHECK ("new_balance" >= 0 AND "new_balance" = "previous_balance" - "amount"), CONSTRAINT "CHK_loan_installment_installments" CHECK ("installments_applied" > 0 AND "remaining_installments" >= 0 AND "remaining_installments" <= "previous_pending_installments"))`);
        await queryRunner.query(`CREATE INDEX "IDX_loan_installment_payroll_period" ON "loan_installment" ("payroll_period_id")`);
        await queryRunner.query(`ALTER TABLE "loan_installment" ADD CONSTRAINT "FK_loan_installment_loan" FOREIGN KEY ("loan_id") REFERENCES "employee_loans"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "loan_installment" ADD CONSTRAINT "FK_loan_installment_employee" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "loan_installment" ADD CONSTRAINT "FK_loan_installment_payroll_period" FOREIGN KEY ("payroll_period_id") REFERENCES "payroll_period"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "loan_installment" ADD CONSTRAINT "FK_loan_installment_payroll_line" FOREIGN KEY ("payroll_line_id") REFERENCES "payroll_line"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "loan_installment" ENABLE ROW LEVEL SECURITY`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Se pierde la trazabilidad de las cuotas descontadas; el saldo de cada préstamo se conserva.
        await queryRunner.query(`DROP TABLE "loan_installment"`);
        await queryRunner.query(`ALTER TABLE "employee_loans" DROP CONSTRAINT "CHK_employee_loans_periodicity"`);
        await queryRunner.query(`ALTER TABLE "employee_loans" DROP COLUMN "periodicity"`);
    }
}
