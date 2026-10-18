import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class PreLiquidationRequestDto {
  @ApiProperty({ example: '2026-09-01', type: String, format: 'date' })
  @IsDateString({ strict: true })
  periodStart!: string;

  @ApiProperty({ example: '2026-09-30', type: String, format: 'date' })
  @IsDateString({ strict: true })
  periodEnd!: string;
}
