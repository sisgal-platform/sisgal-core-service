import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AttendanceLog,
  AttendanceRecord,
  AttendanceRecordLog,
  Branch,
  Employee,
  Holiday,
} from 'src/entities';
import { AUDIT_PORT } from 'src/application/ports/audit/audit.port';
import { WinstonAuditAdapter } from 'src/infraestructure/logging/winston/winston-audit.adapter';
import { AuthModule } from 'src/infraestructure/auth/auth.module';
import { RegistrarMarcacionService } from './application/services/registrar-marcacion.service';
import { LECTOR_BIOMETRICO_PORT } from './domain/ports/lector-biometrico.port';
import { MARCACION_REPOSITORY_PORT } from './domain/ports/marcacion.repository.port';
import { LectorBiometricoSimuladoAdapter } from './infrastructure/biometria/lector-biometrico-simulado.adapter';
import { LectorSimuladoController } from './infrastructure/http/controllers/lector-simulado.controller';
import { MarcacionTypeOrmRepository } from './infrastructure/persistence/repositories/marcacion.typeorm.repository';

/**
 * Servicio de integración con los lectores de asistencia: recibe las
 * marcaciones, las valida y las registra en asistencia.
 */
@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      Employee,
      Branch,
      Holiday,
      AttendanceLog,
      AttendanceRecord,
      AttendanceRecordLog,
    ]),
  ],
  controllers: [LectorSimuladoController],
  providers: [
    RegistrarMarcacionService,
    // Sin lector físico, el lector de huella es simulado; con el dispositivo
    // real basta con cambiar este adaptador.
    {
      provide: LECTOR_BIOMETRICO_PORT,
      useClass: LectorBiometricoSimuladoAdapter,
    },
    {
      provide: MARCACION_REPOSITORY_PORT,
      useClass: MarcacionTypeOrmRepository,
    },
    {
      provide: AUDIT_PORT,
      useClass: WinstonAuditAdapter,
    },
  ],
})
export class IntegracionModule {}
