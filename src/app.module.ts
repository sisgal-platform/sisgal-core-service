import { Module } from '@nestjs/common';
import { dataSourceOptions } from './config/DataSource';
import {
  AUDIT_DATA_SOURCE,
  auditDataSourceOptions,
} from './config/AuditDataSource';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeModule } from './modules/empleados/employee.module';
import { SucursalesModule } from './modules/sucursales/sucursales.module';
import { CargosModule } from './modules/cargos/cargos.module';
import { LoansModule } from './modules/loans/loans.module';
import { NominaModule } from './modules/nomina/nomina.module';
import { DisabilityLeaveModule } from './modules/incapacidades/disability-leave.module';
import { AsistenciaModule } from './modules/asistencia/asistencia.module';
import { LiquidacionesModule } from './modules/liquidaciones/liquidaciones.module';
import { ParametrosNominaModule } from './modules/parametros-nomina/parametros-nomina.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AuditoriaModule } from './modules/auditoria/auditoria.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({ ...dataSourceOptions, autoLoadEntities: true }),
    // Segunda conexión: la auditoría vive en su propia base de datos.
    TypeOrmModule.forRoot({ ...auditDataSourceOptions, name: AUDIT_DATA_SOURCE }),
    EmployeeModule,
    SucursalesModule,
    CargosModule,
    LoansModule,
    NominaModule,
    DisabilityLeaveModule,
    AsistenciaModule,
    LiquidacionesModule,
    ParametrosNominaModule,
    DashboardModule,
    AuditoriaModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
