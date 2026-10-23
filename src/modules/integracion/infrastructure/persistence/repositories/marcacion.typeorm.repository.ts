import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  AttendanceLog,
  AttendanceRecord,
  AttendanceRecordLog,
  Employee,
  Holiday,
} from 'src/entities';
import { WorkedTime } from 'src/modules/asistencia/domain/value-objects/worked-time.vo';
import { getColombiaDate } from 'src/shared/common/utils/colombia-date.util';
import { determinarTipoMarcacion } from '../../../domain/marcacion-rules';
import {
  MarcacionRegistrada,
  MarcacionRepositoryPort,
  NuevaMarcacion,
} from '../../../domain/ports/marcacion.repository.port';
import { MetodoMarcacion } from '../../../domain/value-objects/metodo-marcacion.enum';
import { TipoMarcacion } from '../../../domain/value-objects/tipo-marcacion.enum';

@Injectable()
export class MarcacionTypeOrmRepository implements MarcacionRepositoryPort {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
  ) {}

  findEmpleadoPorDocumento(documento: string): Promise<Employee | null> {
    return this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoinAndSelect(
        'employee.employee_branch_assig',
        'currentAssignment',
        'currentAssignment.is_current = true',
      )
      .leftJoinAndSelect('currentAssignment.branch', 'branch')
      .where('employee.document = :documento', { documento })
      .getOne();
  }

  registrar(marcacion: NuevaMarcacion): Promise<MarcacionRegistrada> {
    return this.employeeRepository.manager.transaction(async (manager) => {
      // Bloquea al empleado hasta el fin de la transacción: dos lecturas
      // simultáneas se procesan una tras otra, así la segunda ve a la primera
      // y no se generan dos entradas ni se salta el control de duplicados.
      await manager
        .getRepository(Employee)
        .createQueryBuilder('employee')
        .setLock('pessimistic_write')
        .where('employee.id = :id', { id: marcacion.empleadoId })
        .getOne();

      const existente = await this.findPorIdempotencyKey(
        manager,
        marcacion.idempotencyKey,
      );
      if (existente) {
        return existente;
      }

      // Las consultas usan QueryBuilder con LIMIT directo: findOne con
      // relaciones hace dos consultas, y cada ida a la base suma latencia.
      const ultimoRegistro = await manager
        .getRepository(AttendanceRecord)
        .createQueryBuilder('record')
        .leftJoinAndSelect('record.branch', 'branch')
        .where('record.employee_id = :empleadoId', {
          empleadoId: marcacion.empleadoId,
        })
        .orderBy('record.check_in', 'DESC')
        .addOrderBy('record.id', 'DESC')
        .limit(1)
        .getOne();

      const tipo = determinarTipoMarcacion(
        ultimoRegistro
          ? {
              entrada: ultimoRegistro.check_in,
              salida: ultimoRegistro.check_out,
            }
          : null,
        marcacion.fechaHora,
      );

      const registro =
        tipo === TipoMarcacion.SALIDA && ultimoRegistro
          ? await this.cerrarRegistro(
              manager,
              ultimoRegistro,
              marcacion.fechaHora,
            )
          : await this.abrirRegistro(manager, marcacion);

      const log = await manager.save(
        Object.assign(new AttendanceLog(), {
          event_time: marcacion.fechaHora,
          event_type: tipo,
          auth_method: marcacion.metodo,
          idempotency_key: marcacion.idempotencyKey,
          employee: { id: marcacion.empleadoId } as Employee,
          biometricDevice: null,
        }),
      );

      // Relaciona la marcación cruda con el registro que abrió o cerró, para
      // poder reconstruir de dónde salen las horas de la nómina.
      await manager.save(
        Object.assign(new AttendanceRecordLog(), {
          attendanceRecord: registro,
          attendanceLog: log,
        }),
      );

      return this.toMarcacionRegistrada(log, registro, false);
    });
  }

  private async findPorIdempotencyKey(
    manager: EntityManager,
    idempotencyKey: string,
  ): Promise<MarcacionRegistrada | null> {
    const log = await manager
      .getRepository(AttendanceLog)
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.attendanceRecordLogs', 'recordLog')
      .leftJoinAndSelect('recordLog.attendanceRecord', 'record')
      .leftJoinAndSelect('record.branch', 'branch')
      .where('log.idempotency_key = :idempotencyKey', { idempotencyKey })
      .getOne();
    const registro = log?.attendanceRecordLogs[0]?.attendanceRecord;

    return log && registro
      ? this.toMarcacionRegistrada(log, registro, true)
      : null;
  }

  private async abrirRegistro(
    manager: EntityManager,
    marcacion: NuevaMarcacion,
  ): Promise<AttendanceRecord> {
    const esFestivo = await manager
      .getRepository(Holiday)
      .createQueryBuilder('holiday')
      .where('holiday.date = CAST(:date AS date)', {
        date: getColombiaDate(marcacion.fechaHora),
      })
      .getExists();

    return manager.save(
      Object.assign(new AttendanceRecord(), {
        check_in: marcacion.fechaHora,
        check_out: null,
        work_minutes: 0,
        extra_day_minutes: 0,
        extra_night_minutes: 0,
        holiday_minutes: 0,
        is_holiday: esFestivo,
        employee: { id: marcacion.empleadoId } as Employee,
        branch: marcacion.sucursal,
      }),
    );
  }

  /**
   * Cierra la jornada con la hora de salida. Se guardan los minutos totales;
   * la clasificación en horas extra, nocturnas y festivas la hace la nómina a
   * partir de la entrada y la salida.
   */
  private async cerrarRegistro(
    manager: EntityManager,
    registro: AttendanceRecord,
    salida: Date,
  ): Promise<AttendanceRecord> {
    registro.check_out = salida;
    registro.work_minutes =
      WorkedTime.fromMarks(registro.check_in, salida).getMinutes() ?? 0;

    // update en lugar de save: save vuelve a leer el registro antes de guardarlo.
    await manager.update(
      AttendanceRecord,
      { id: registro.id },
      { check_out: registro.check_out, work_minutes: registro.work_minutes },
    );

    return registro;
  }

  private toMarcacionRegistrada(
    log: AttendanceLog,
    registro: AttendanceRecord,
    repetida: boolean,
  ): MarcacionRegistrada {
    const tipo = log.event_type as TipoMarcacion;
    // Al repetir una entrada ya cerrada, la respuesta sigue siendo la de la entrada.
    const esSalida = tipo === TipoMarcacion.SALIDA;

    return {
      id: log.id,
      tipo,
      metodo: log.auth_method as MetodoMarcacion,
      fechaHora: log.event_time,
      registroAsistenciaId: registro.id,
      sucursalId: registro.branch?.id ?? null,
      sucursalNombre: registro.branch?.name ?? null,
      entrada: registro.check_in,
      salida: esSalida ? registro.check_out : null,
      minutosTrabajados: esSalida ? registro.work_minutes : null,
      repetida,
    };
  }
}
