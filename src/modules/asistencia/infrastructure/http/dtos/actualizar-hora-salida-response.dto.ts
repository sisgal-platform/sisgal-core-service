import { ApiProperty } from '@nestjs/swagger';
import { AttendanceRecordStatus } from '../../../domain/value-objects/attendance-record-status.enum';

export class ActualizarHoraSalidaResponseDto {
  @ApiProperty({ example: 15 })
  id!: number;

  @ApiProperty({ example: 7 })
  empleadoId!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  checkIn!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  checkOut!: Date;

  @ApiProperty({ example: 510 })
  workedMinutes!: number;

  @ApiProperty({
    enum: AttendanceRecordStatus,
    example: AttendanceRecordStatus.COMPLETO,
  })
  status!: AttendanceRecordStatus;
}
