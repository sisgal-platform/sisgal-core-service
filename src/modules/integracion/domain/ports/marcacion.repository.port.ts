import { Branch, Employee } from 'src/entities';
import { MetodoMarcacion } from '../value-objects/metodo-marcacion.enum';
import { TipoMarcacion } from '../value-objects/tipo-marcacion.enum';

export const MARCACION_REPOSITORY_PORT = Symbol('MARCACION_REPOSITORY_PORT');

export interface NuevaMarcacion {
  empleadoId: number;
  /** Restaurante al que pertenece el empleado al momento de marcar. */
  sucursal: Branch;
  metodo: MetodoMarcacion;
  idempotencyKey: string;
  /** Hora oficial de la marcación: siempre la del servidor. */
  fechaHora: Date;
}

export interface MarcacionRegistrada {
  /** Identificador de la marcación cruda (attendance_log). */
  id: number;
  tipo: TipoMarcacion;
  metodo: MetodoMarcacion;
  fechaHora: Date;
  /** Registro de asistencia que la marcación abrió o cerró. */
  registroAsistenciaId: number;
  sucursalId: number | null;
  sucursalNombre: string | null;
  entrada: Date;
  salida: Date | null;
  minutosTrabajados: number | null;
  /** true si la clave de idempotencia ya existía y no se registró nada nuevo. */
  repetida: boolean;
}

export interface MarcacionRepositoryPort {
  /** Empleado con su asignación de sucursal vigente. */
  findEmpleadoPorDocumento(documento: string): Promise<Employee | null>;

  /**
   * Registra la marcación en una sola transacción: decide si es entrada o
   * salida, guarda la marcación cruda y abre o cierra el registro de
   * asistencia. Si ya existe una marcación con la misma clave de idempotencia,
   * la devuelve sin registrar otra. Lanza RegistroDuplicadoError si el
   * empleado marcó hace menos de un minuto.
   */
  registrar(marcacion: NuevaMarcacion): Promise<MarcacionRegistrada>;
}
