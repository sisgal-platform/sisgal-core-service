import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * HU01 - Registrar entrada con huella / HU03 - Almacenar registros de asistencia.
 *
 * Cada marcación debe conservar el método con el que se hizo (huella o QR), y
 * la clave de idempotencia debe ser única para que un reintento del lector no
 * duplique la marcación. Los tipos y métodos permitidos quedan restringidos
 * también en la base. Las marcaciones existentes vienen de lectores de huella.
 */
export class AddAttendanceLogMethodAndIdempotency1791830000000 implements MigrationInterface {
    name = 'AddAttendanceLogMethodAndIdempotency1791830000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "attendance_log" ADD "auth_method" character varying(20) NOT NULL DEFAULT 'HUELLA'`);
        await queryRunner.query(`ALTER TABLE "attendance_log" ALTER COLUMN "auth_method" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "attendance_log" ADD CONSTRAINT "CHK_attendance_log_auth_method" CHECK ("auth_method" IN ('HUELLA', 'QR'))`);
        await queryRunner.query(`ALTER TABLE "attendance_log" ADD CONSTRAINT "CHK_attendance_log_event_type" CHECK ("event_type" IN ('ENTRADA', 'SALIDA'))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_attendance_log_idempotency_key" ON "attendance_log" ("idempotency_key")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."UQ_attendance_log_idempotency_key"`);
        await queryRunner.query(`ALTER TABLE "attendance_log" DROP CONSTRAINT "CHK_attendance_log_event_type"`);
        await queryRunner.query(`ALTER TABLE "attendance_log" DROP CONSTRAINT "CHK_attendance_log_auth_method"`);
        await queryRunner.query(`ALTER TABLE "attendance_log" DROP COLUMN "auth_method"`);
    }
}
