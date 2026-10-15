import { ApiProperty } from '@nestjs/swagger';
import type {
  AttendanceIndicator,
  DashboardIndicators,
  LaborCostCategory,
  LaborCostIndicator,
  WorkedHoursIndicator,
} from '../../../domain/dashboard-indicators';

export class WeeklyAttendanceDto {
  @ApiProperty({ description: 'Día de la semana', example: 'Lun' })
  day!: string;

  @ApiProperty({ description: 'Porcentaje de asistencia promedio ese día', example: 92.5 })
  percentage!: number;
}

export class AttendanceIndicatorDto {
  @ApiProperty({
    description: 'Porcentaje promedio de asistencia en el período',
    example: 89.3,
    nullable: true,
  })
  averagePercentage!: number | null;

  @ApiProperty({
    description: 'Variación en puntos porcentuales contra el período anterior de igual duración',
    example: 3.2,
    nullable: true,
  })
  changeVsPreviousPeriod!: number | null;

  @ApiProperty({
    description: 'Porcentaje de asistencia promedio por día de la semana',
    type: WeeklyAttendanceDto,
    isArray: true,
  })
  weeklyDistribution!: WeeklyAttendanceDto[];

  static fromDomain(indicator: AttendanceIndicator): AttendanceIndicatorDto {
    const dto = new AttendanceIndicatorDto();
    dto.averagePercentage = indicator.averagePercentage;
    dto.changeVsPreviousPeriod = indicator.changeVsPreviousPeriod;
    dto.weeklyDistribution = indicator.weeklyDistribution;
    return dto;
  }
}

export class MonthlyHoursDto {
  @ApiProperty({ description: 'Mes', example: 'Oct' })
  month!: string;

  @ApiProperty({ description: 'Horas trabajadas ese mes', example: 1750 })
  hours!: number;
}

export class WorkedHoursIndicatorDto {
  @ApiProperty({
    description: 'Total de horas trabajadas en el período',
    example: 1750,
    nullable: true,
  })
  total!: number | null;

  @ApiProperty({
    description: 'Variación porcentual contra el período anterior de igual duración',
    example: 2.9,
    nullable: true,
  })
  changeVsPreviousPeriod!: number | null;

  @ApiProperty({
    description: 'Horas trabajadas en cada uno de los últimos 5 meses hasta el fin del período',
    type: MonthlyHoursDto,
    isArray: true,
  })
  trend!: MonthlyHoursDto[];

  static fromDomain(indicator: WorkedHoursIndicator): WorkedHoursIndicatorDto {
    const dto = new WorkedHoursIndicatorDto();
    dto.total = indicator.total;
    dto.changeVsPreviousPeriod = indicator.changeVsPreviousPeriod;
    dto.trend = indicator.trend;
    return dto;
  }
}

export class LaborCostDistributionDto {
  @ApiProperty({
    description: 'Categoría del costo',
    enum: ['Devengado', 'Deduccion'],
    example: 'Devengado',
  })
  category!: LaborCostCategory;

  @ApiProperty({ description: 'Monto total de la categoría', example: 1800000 })
  amount!: number;

  @ApiProperty({ description: 'Porcentaje que representa sobre el total', example: 92.3 })
  percentage!: number;
}

export class LaborCostIndicatorDto {
  @ApiProperty({
    description: 'Neto pagado total en el período',
    example: 190000,
    nullable: true,
  })
  total!: number | null;

  @ApiProperty({
    description: 'Variación porcentual contra el período anterior de igual duración',
    example: -1.5,
    nullable: true,
  })
  changeVsPreviousPeriod!: number | null;

  @ApiProperty({
    description: 'Distribución entre devengado y deducciones',
    type: LaborCostDistributionDto,
    isArray: true,
  })
  distribution!: LaborCostDistributionDto[];

  static fromDomain(indicator: LaborCostIndicator): LaborCostIndicatorDto {
    const dto = new LaborCostIndicatorDto();
    dto.total = indicator.total;
    dto.changeVsPreviousPeriod = indicator.changeVsPreviousPeriod;
    dto.distribution = indicator.distribution;
    return dto;
  }
}

export class DashboardIndicatorsResponseDto {
  @ApiProperty({ type: AttendanceIndicatorDto })
  attendance!: AttendanceIndicatorDto;

  @ApiProperty({ type: WorkedHoursIndicatorDto })
  workedHours!: WorkedHoursIndicatorDto;

  @ApiProperty({ type: LaborCostIndicatorDto })
  laborCosts!: LaborCostIndicatorDto;

  static fromDomain(indicators: DashboardIndicators): DashboardIndicatorsResponseDto {
    const dto = new DashboardIndicatorsResponseDto();
    dto.attendance = AttendanceIndicatorDto.fromDomain(indicators.attendance);
    dto.workedHours = WorkedHoursIndicatorDto.fromDomain(indicators.workedHours);
    dto.laborCosts = LaborCostIndicatorDto.fromDomain(indicators.laborCosts);
    return dto;
  }
}
