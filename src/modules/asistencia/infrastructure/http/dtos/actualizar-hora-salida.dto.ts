import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, Matches, Min } from 'class-validator';

export class ActualizarHoraSalidaDto {
  @ApiProperty({
    description: 'Identificador del empleado asociado al registro',
    example: 7,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  empleadoId!: number;

  @ApiProperty({
    description:
      'Hora local de salida en formato 24 horas HH:mm (zona America/Bogota). Si es anterior a la entrada, se interpreta como el día siguiente.',
    example: '18:30',
  })
  @IsString()
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
  horaSalida!: string;
}
