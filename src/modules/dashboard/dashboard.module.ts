import { Module } from '@nestjs/common';
import { AuthModule } from 'src/infraestructure/auth/auth.module';
import { AsistenciaModule } from 'src/modules/asistencia/asistencia.module';
import { EmployeeModule } from 'src/modules/empleados/employee.module';
import { LiquidacionesModule } from 'src/modules/liquidaciones/liquidaciones.module';
import { DashboardIndicatorsService } from './application/services/dashboard-indicators.service';
import { DashboardIndicatorsController } from './infraestructure/http/controllers/dashboard-indicators.controller';

@Module({
  imports: [AuthModule, AsistenciaModule, LiquidacionesModule, EmployeeModule],
  controllers: [DashboardIndicatorsController],
  providers: [DashboardIndicatorsService],
})
export class DashboardModule {}
