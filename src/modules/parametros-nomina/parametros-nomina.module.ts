import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkdayConfig, WorkRateConfig } from 'src/entities';
import { AUDIT_PORT } from 'src/application/ports/audit/audit.port';
import { WinstonAuditAdapter } from 'src/infraestructure/logging/winston/winston-audit.adapter';
import { AuthModule } from 'src/infraestructure/auth/auth.module';
import { WorkRateConfigService } from './application/services/work-rate-config.service';
import { WorkdayConfigService } from './application/services/workday-config.service';
import { WORK_RATE_CONFIG_REPOSITORY_PORT } from './domain/ports/work-rate-config.repository.port';
import { WORKDAY_CONFIG_REPOSITORY_PORT } from './domain/ports/workday-config.repository.port';
import { WorkRateConfigController } from './infrastructure/http/controllers/work-rate-config.controller';
import { WorkdayConfigController } from './infrastructure/http/controllers/workday-config.controller';
import { WorkRateConfigTypeOrmRepository } from './infrastructure/persistence/repositories/work-rate-config.typeorm.repository';
import { WorkdayConfigTypeOrmRepository } from './infrastructure/persistence/repositories/workday-config.typeorm.repository';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([WorkdayConfig, WorkRateConfig]),
  ],
  controllers: [WorkdayConfigController, WorkRateConfigController],
  providers: [
    WorkdayConfigService,
    WorkRateConfigService,
    {
      provide: WORKDAY_CONFIG_REPOSITORY_PORT,
      useClass: WorkdayConfigTypeOrmRepository,
    },
    {
      provide: WORK_RATE_CONFIG_REPOSITORY_PORT,
      useClass: WorkRateConfigTypeOrmRepository,
    },
    {
      provide: AUDIT_PORT,
      useClass: WinstonAuditAdapter,
    },
  ],
  exports: [
    WorkdayConfigService,
    WorkRateConfigService,
    WORKDAY_CONFIG_REPOSITORY_PORT,
    WORK_RATE_CONFIG_REPOSITORY_PORT,
  ],
})
export class ParametrosNominaModule {}
