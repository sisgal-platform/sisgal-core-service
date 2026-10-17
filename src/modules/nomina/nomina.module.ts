import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkRateConfig } from 'src/entities/work-rate-config.model';
import { WorkdayConfig } from 'src/entities/workday-config.model';
import { PayrollHoursService } from './application/services/payroll-hours.service';
import { PAYROLL_HOURS_REPOSITORY_PORT } from './domain/ports/payroll-hours.repository.port';
import { PayrollHoursTypeOrmRepository } from './infrastructure/persistence/repositories/payroll-hours.typeorm.repository';
import { AuthModule } from 'src/infraestructure/auth/auth.module';
import { AsistenciaModule } from '../asistencia/asistencia.module';
import { ATTENDANCE_RECORD_REPOSITORY_PORT } from '../asistencia/domain/ports/attendance-record.repository.port';
import { AttendanceRecordTypeOrmRepository } from '../asistencia/infrastructure/persistence/repositories/attendance-record.typeorm.repository';
import { AttendanceRecord, Holiday, SystemConfig } from 'src/entities';
import { NominaService } from './application/services/nomina.service';
import { NominaController } from './infrastructure/http/controllers/nomina.controller';
import { LegalDeductionsService } from './application/services/legal-deductions.service';
import { SYSTEM_CONFIG_REPOSITORY_PORT } from './domain/ports/system-config-repository.port';
import { SystemConfigTypeOrmRepository } from './infrastructure/persistence/repositories/system-config.typeorm.repository';
import { TransportAllowanceService } from './application/services/transport-allowance.service';

@Module({
  imports: [
    AuthModule,
    AsistenciaModule,
    TypeOrmModule.forFeature([
      WorkdayConfig,
      WorkRateConfig,
      AttendanceRecord,
      Holiday,
      SystemConfig,
    ]),
  ],
  controllers: [NominaController],
  providers: [
    NominaService,
    PayrollHoursService,
    LegalDeductionsService,
    TransportAllowanceService,
    {
      provide: SYSTEM_CONFIG_REPOSITORY_PORT,
      useClass: SystemConfigTypeOrmRepository,
    },
    {
      provide: PAYROLL_HOURS_REPOSITORY_PORT,
      useClass: PayrollHoursTypeOrmRepository,
    },
    {
      provide: ATTENDANCE_RECORD_REPOSITORY_PORT,
      useClass: AttendanceRecordTypeOrmRepository,
    },
  ],
  exports: [NominaService, LegalDeductionsService, TransportAllowanceService],
})
export class NominaModule {}
