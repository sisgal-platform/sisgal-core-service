import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Lectura que envía el lector de huella simulado cuando alguien coloca el dedo. */
export class LecturaSimuladaDto {
  @ApiProperty({
    description:
      'Indica si el lector logró capturar la huella. En false simula una falla del lector.',
    example: true,
  })
  @IsBoolean({
    message: 'El resultado de la captura debe ser verdadero o falso',
  })
  readonly capturaExitosa!: boolean;

  @ApiPropertyOptional({
    description:
      'Huella capturada. En el lector simulado es el documento del empleado; un documento que no está registrado simula una huella desconocida. Obligatoria si la captura fue exitosa.',
    example: '1020304050',
    maxLength: 40,
  })
  @ValidateIf((dto: LecturaSimuladaDto) => dto.capturaExitosa === true)
  @IsString({ message: 'La huella debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La huella es obligatoria' })
  @MaxLength(40, { message: 'La huella no debe superar los 40 caracteres' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  readonly huella?: string;

  @ApiProperty({
    description:
      'Clave única de la lectura. Si el lector reintenta con la misma clave, la marcación no se duplica.',
    example: '3f1c2a5e-8b7d-4c1e-9a6f-2d4b8e9c7a10',
  })
  @IsUUID('all', { message: 'La clave de idempotencia debe ser un UUID' })
  readonly idempotencyKey!: string;
}
