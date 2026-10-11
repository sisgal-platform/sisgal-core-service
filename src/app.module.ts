import { Module } from '@nestjs/common';
import { dataSourceOptions } from './config/DataSource';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeModule } from './modules/empleados/employee.module';
import { SucursalesModule } from './modules/sucursales/sucursales.module';
import { CargosModule } from './modules/cargos/cargos.module';
import { LoansModule } from './modules/loans/loans.module';
import { NominaModule } from './modules/nomina/nomina.module';
import { DisabilityLeaveModule } from './modules/incapacidades/disability-leave.module';
import { AsistenciaModule } from './modules/asistencia/asistencia.module';
import { LiquidacionesModule } from './modules/liquidaciones/liquidaciones.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({ ...dataSourceOptions, autoLoadEntities: true }),
    EmployeeModule,
    SucursalesModule,
    CargosModule,
    LoansModule,
    NominaModule,
    DisabilityLeaveModule,
    AsistenciaModule,
    LiquidacionesModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
