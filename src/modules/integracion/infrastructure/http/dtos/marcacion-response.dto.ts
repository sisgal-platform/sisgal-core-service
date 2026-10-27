import { ApiProperty } from '@nestjs/swagger';
import { Employee } from 'src/entities';
import { MarcacionRegistrada } from '../../../domain/ports/marcacion.repository.port';
import { MetodoMarcacion } from '../../../domain/value-objects/metodo-marcacion.enum';
import { TipoMarcacion } from '../../../domain/value-objects/tipo-marcacion.enum';

export class MarcacionResponseDto {
  @ApiProperty({
    description: 'Identificador de la marcación',
    example: 1,
  })
  id!: number;

  @ApiProperty({ enum: TipoMarcacion, example: TipoMarcacion.ENTRADA })
  tipo!: TipoMarcacion;

  @ApiProperty({ enum: MetodoMarcacion, example: MetodoMarcacion.HUELLA })
  metodo!: MetodoMarcacion;

  @ApiProperty({
    description: 'Hora oficial de la marcación, tomada del servidor',
    type: String,
    format: 'date-time',
  })
  fechaHora!: Date;

  @ApiProperty({ example: 1 })
  empleadoId!: number;

  @ApiProperty({ example: 'María Pérez' })
  empleadoNombre!: string;

  @ApiProperty({
    description: 'Restaurante al que quedó asociada la marcación',
    example: 1,
    nullable: true,
  })
  sucursalId!: number | null;

  @ApiProperty({ example: 'Sucursal Centro', nullable: true })
  sucursalNombre!: string | null;

  @ApiProperty({
    description: 'Registro de asistencia que la marcación abrió o cerró',
    example: 1,
  })
  registroAsistenciaId!: number;

  @ApiProperty({
    description: 'Hora de entrada de la jornada',
    type: String,
    format: 'date-time',
  })
  entrada!: Date;

  @ApiProperty({
    description: 'Hora de salida de la jornada. Es null en una entrada.',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  salida!: Date | null;

  @ApiProperty({
    description: 'Minutos trabajados en la jornada. Es null en una entrada.',
    example: 480,
    nullable: true,
  })
  minutosTrabajados!: number | null;

  static from(
    marcacion: MarcacionRegistrada,
    empleado: Employee,
  ): MarcacionResponseDto {
    const dto = new MarcacionResponseDto();

    dto.id = marcacion.id;
    dto.tipo = marcacion.tipo;
    dto.metodo = marcacion.metodo;
    dto.fechaHora = marcacion.fechaHora;
    dto.empleadoId = empleado.id;
    dto.empleadoNombre = `${empleado.firstName} ${empleado.lastName}`;
    dto.sucursalId = marcacion.sucursalId;
    dto.sucursalNombre = marcacion.sucursalNombre;
    dto.registroAsistenciaId = marcacion.registroAsistenciaId;
    dto.entrada = marcacion.entrada;
    dto.salida = marcacion.salida;
    dto.minutosTrabajados = marcacion.minutosTrabajados;

    return dto;
  }
}
