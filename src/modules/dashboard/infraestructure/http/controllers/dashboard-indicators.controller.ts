import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DashboardIndicatorsService } from '../../../application/services/dashboard-indicators.service';
import { today } from '../../../domain/period-range';
import { DashboardIndicatorsQueryDto, DashboardIndicatorsResponseDto } from '../dtos';
import { ErrorResponseDto } from 'src/shared/infraestructure/http/dtos';
import { JwtAuthGuard } from 'src/infraestructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/infraestructure/auth/guards/roles.guard';
import { Roles } from 'src/infraestructure/auth/decorators/roles.decorator';
import { Role } from 'src/application/ports/auth/auth-user';

@ApiTags('Dashboard')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'No se proporcionó un token válido.',
  type: ErrorResponseDto,
})
@ApiForbiddenResponse({
  description: 'El usuario no tiene permisos para realizar esta operación.',
  type: ErrorResponseDto,
})
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMINISTRADOR)
@Controller('dashboard')
export class DashboardIndicatorsController {
  constructor(
    private readonly dashboardIndicatorsService: DashboardIndicatorsService,
  ) {}

  @Get('indicadores')
  @ApiOperation({
    summary: 'Consultar los indicadores clave del dashboard',
    description:
      'Obtiene los indicadores de asistencia, horas trabajadas y costos laborales para el período indicado, junto con su variación contra el período anterior de igual duración. Es una consulta de solo lectura.',
  })
  @ApiOkResponse({
    description: 'Indicadores obtenidos correctamente.',
    type: DashboardIndicatorsResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'El período inicial es posterior al período final, o las fechas no son válidas.',
    type: ErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Se produjo un error interno al consultar los indicadores.',
    type: ErrorResponseDto,
  })
  async getIndicators(
    @Query() query: DashboardIndicatorsQueryDto,
  ): Promise<DashboardIndicatorsResponseDto> {
    const to = query.periodoHasta ?? today();
    const from = query.periodoDesde ?? this.firstDayOfMonth(to);

    const indicators = await this.dashboardIndicatorsService.getIndicators(from, to);

    return DashboardIndicatorsResponseDto.fromDomain(indicators);
  }

  private firstDayOfMonth(date: string): string {
    return `${date.slice(0, 7)}-01`;
  }
}
