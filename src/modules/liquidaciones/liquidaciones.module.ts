import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoanInstallment } from 'src/entities/loan-installment.model';
import { PayrollPeriod } from 'src/entities/payroll-period.model';
import { AUDIT_PORT } from 'src/application/ports/audit/audit.port';
import { WinstonAuditAdapter } from 'src/infraestructure/logging/winston/winston-audit.adapter';
import { PayrollPeriodController } from './infraestructure/http/controllers/payroll-period.controller';
import { PayrollPeriodService } from './application/services/payroll-period.service';
import { PAYROLL_PERIOD_REPOSITORY_PORT } from './domain/ports/payroll-period-repository.port';
import { PayrollPeriodTypeOrmRepository } from './infraestructure/persistence/repositories/payroll-period.typeorm.repository';
import { PayrollSlipPdfService } from './application/services/payroll-slip-pdf.service';
import { PayrollCsvService } from './application/services/payroll-csv.service';
import { AuthModule } from '../../infraestructure/auth/auth.module';
import { EmployeeModule } from '../empleados/employee.module';
import { NominaModule } from '../nomina/nomina.module';
import { PreLiquidationService } from './application/services/pre-liquidation.service';

@Module({
  // AuthModule aporta los guards de JWT y rol
  imports: [
    AuthModule,
    EmployeeModule,
    NominaModule,
    TypeOrmModule.forFeature([PayrollPeriod, LoanInstallment]),
  ],
  controllers: [PayrollPeriodController],
  providers: [
    PayrollPeriodService,
    PreLiquidationService,
    PayrollSlipPdfService,
    PayrollCsvService,
    {
      provide: PAYROLL_PERIOD_REPOSITORY_PORT,
      useClass: PayrollPeriodTypeOrmRepository,
    },
    {
      provide: AUDIT_PORT,
      useClass: WinstonAuditAdapter,
    },
  ],
  exports: [PAYROLL_PERIOD_REPOSITORY_PORT],
})
export class LiquidacionesModule {}
