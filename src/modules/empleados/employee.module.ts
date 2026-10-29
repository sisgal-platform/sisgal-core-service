import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from 'src/entities/employee.model';
import { Position } from 'src/entities/position.model';
import { AttendanceRecord } from 'src/entities/attendance-record.model';
import { PayrollPeriod } from 'src/entities/payroll-period.model';
import { DisabilityLeave } from 'src/entities/disability_leave.model';
import { EmployeeController } from './infraestructure/http/controllers/employee.controller';
import { EmployeeService } from './application/services/employee.service';
import { EMPLOYEE_REPOSITORY_PORT } from './domain/ports/employee-repository.port';
import { POSITION_REPOSITORY_PORT } from './domain/ports/position.repository.port';
import { EmployeeTypeOrmRepository } from './infraestructure/persistence/repositories/employee.typeorm.repository';
import { PositionTypeOrmRepository } from './infraestructure/persistence/repositories/position.typeorm.repository';
import { AuthModule } from '../../infraestructure/auth/auth.module';
import { SucursalesModule } from '../sucursales/sucursales.module';
import { AUDIT_PORT } from '../../application/ports/audit/audit.port';
import { WinstonAuditAdapter } from '../../infraestructure/logging/winston/winston-audit.adapter';

@Module({
    // AuthModule aporta los guards; SucursalesModule exporta el port para consultar sucursales
    imports: [AuthModule, SucursalesModule,TypeOrmModule.forFeature([Employee, Position, AttendanceRecord, PayrollPeriod, DisabilityLeave])],
    controllers: [EmployeeController],
    providers: [
        EmployeeService,
        {
            provide: EMPLOYEE_REPOSITORY_PORT,
            useClass: EmployeeTypeOrmRepository,
        },
        // Port propio hacia job_position (catálogo de cargos)
        {
            provide: POSITION_REPOSITORY_PORT,
            useClass: PositionTypeOrmRepository,
        },
        // Auditoría de operaciones (mismo adaptador Winston que usa sucursales)
        {
            provide: AUDIT_PORT,
            useClass: WinstonAuditAdapter,
        },
    ],
    // Se expone el port para que otros módulos (ej. incapacidades) puedan
    // validar que el empleado exista y esté activo
    exports: [EMPLOYEE_REPOSITORY_PORT],
})
export class EmployeeModule {}
