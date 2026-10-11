import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkdayConfig } from 'src/entities';
import { AUDIT_PORT } from 'src/application/ports/audit/audit.port';
import { WinstonAuditAdapter } from 'src/infraestructure/logging/winston/winston-audit.adapter';
import { AuthModule } from 'src/infraestructure/auth/auth.module';
import { WorkdayConfigService } from './application/services/workday-config.service';
import { WORKDAY_CONFIG_REPOSITORY_PORT } from './domain/ports/workday-config.repository.port';
import { WorkdayConfigController } from './infrastructure/http/controllers/workday-config.controller';
import { WorkdayConfigTypeOrmRepository } from './infrastructure/persistence/repositories/workday-config.typeorm.repository';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([WorkdayConfig])],
  controllers: [WorkdayConfigController],
  providers: [
    WorkdayConfigService,
    {
      provide: WORKDAY_CONFIG_REPOSITORY_PORT,
      useClass: WorkdayConfigTypeOrmRepository,
    },
    {
      provide: AUDIT_PORT,
      useClass: WinstonAuditAdapter,
    },
  ],
  exports: [WorkdayConfigService, WORKDAY_CONFIG_REPOSITORY_PORT],
})
export class ParametrosNominaModule {}
