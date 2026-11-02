import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DisabilityLeave } from 'src/entities/disability_leave.model';
import { PayrollPeriod } from 'src/entities/payroll-period.model';
import { DisabilityLeaveController } from './infraestructure/http/controllers/disability-leave.controller';
import { DisabilityLeaveService } from './application/services/disability-leave.service';
import { DISABILITY_LEAVE_REPOSITORY_PORT } from './domain/ports/disability-leave-repository.port';
import { DisabilityLeaveTypeOrmRepository } from './infraestructure/persistence/repositories/disability-leave.typeorm.repository';
import { AuthModule } from '../../infraestructure/auth/auth.module';
import { EmployeeModule } from '../empleados/employee.module';
import { AUDIT_PORT } from '../../application/ports/audit/audit.port';
import { WinstonAuditAdapter } from '../../infraestructure/logging/winston/winston-audit.adapter';

@Module({
    // AuthModule aporta los guards; EmployeeModule exporta el port para validar empleados
    imports: [AuthModule, EmployeeModule, TypeOrmModule.forFeature([DisabilityLeave, PayrollPeriod])],
    controllers: [DisabilityLeaveController],
    providers: [
        DisabilityLeaveService,
        {
            provide: DISABILITY_LEAVE_REPOSITORY_PORT,
            useClass: DisabilityLeaveTypeOrmRepository,
        },
        // Auditoría de operaciones (mismo adaptador Winston que usan sucursales y empleados)
        {
            provide: AUDIT_PORT,
            useClass: WinstonAuditAdapter,
        },
    ],
})
export class DisabilityLeaveModule {}
