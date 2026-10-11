import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayrollPeriod } from 'src/entities/payroll-period.model';
import { PayrollPeriodController } from './infraestructure/http/controllers/payroll-period.controller';
import { PayrollPeriodService } from './application/services/payroll-period.service';
import { PAYROLL_PERIOD_REPOSITORY_PORT } from './domain/ports/payroll-period-repository.port';
import { PayrollPeriodTypeOrmRepository } from './infraestructure/persistence/repositories/payroll-period.typeorm.repository';
import { AuthModule } from '../../infraestructure/auth/auth.module';

@Module({
    // AuthModule aporta los guards de JWT y rol
    imports: [AuthModule, TypeOrmModule.forFeature([PayrollPeriod])],
    controllers: [PayrollPeriodController],
    providers: [
        PayrollPeriodService,
        {
            provide: PAYROLL_PERIOD_REPOSITORY_PORT,
            useClass: PayrollPeriodTypeOrmRepository,
        },
    ],
})
export class LiquidacionesModule {}
