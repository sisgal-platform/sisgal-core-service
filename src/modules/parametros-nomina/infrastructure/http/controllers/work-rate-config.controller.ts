import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { WorkRateConfigService } from '../../../application/services/work-rate-config.service';
import {
  RegisterWorkRatesDto,
  VigenciaQueryDto,
  WorkRateConfigResponseDto,
} from '../dtos';
import { ErrorResponseDto } from 'src/shared/infraestructure/http/dtos';
import { JwtAuthGuard } from 'src/infraestructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/infraestructure/auth/guards/roles.guard';
import { Roles } from 'src/infraestructure/auth/decorators/roles.decorator';
import { Role } from 'src/application/ports/auth/auth-user';
import type { AuthUser } from 'src/application/ports/auth/auth-user';

@ApiTags('Parámetros de nómina')
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
@Controller('parametros-nomina/recargos')
export class WorkRateConfigController {
  constructor(private readonly workRateConfigService: WorkRateConfigService) {}

  @Get()
  @ApiOperation({
    summary: 'Obtener el historial de los recargos laborales',
    description:
      'Obtiene todas las versiones del multiplicador de cada tipo de hora, agrupadas por tipo y de la más reciente a la más antigua, con su período de vigencia y su estado: vigente, programada o histórica.',
  })
  @ApiOkResponse({
    description: 'Versiones de los recargos obtenidas correctamente.',
    type: WorkRateConfigResponseDto,
    isArray: true,
  })
  @ApiInternalServerErrorResponse({
    description: 'Se produjo un error interno al consultar los recargos.',
    type: ErrorResponseDto,
  })
  async obtenerHistorial(): Promise<WorkRateConfigResponseDto[]> {
    const versiones = await this.workRateConfigService.obtenerHistorial();

    return versiones.map((version) =>
      WorkRateConfigResponseDto.fromEntity(version),
    );
  }

  @Get('vigentes')
  @ApiOperation({
    summary: 'Obtener los recargos laborales vigentes',
    description:
      'Obtiene el multiplicador de cada tipo de hora que rige en la fecha indicada o, si no se indica, en la fecha actual. Son los valores que deben usar los cálculos de asistencia y nómina de esa fecha.',
  })
  @ApiOkResponse({
    description: 'Recargos vigentes obtenidos correctamente.',
    type: WorkRateConfigResponseDto,
    isArray: true,
  })
  @ApiBadRequestResponse({
    description: 'La fecha proporcionada no tiene un formato válido.',
    type: ErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Se produjo un error interno al consultar los recargos.',
    type: ErrorResponseDto,
  })
  async obtenerVigentes(
    @Query() query: VigenciaQueryDto,
  ): Promise<WorkRateConfigResponseDto[]> {
    const versiones = await this.workRateConfigService.obtenerVigentes(
      query.fecha,
    );

    return versiones.map((version) =>
      WorkRateConfigResponseDto.fromEntity(version),
    );
  }

  @Post()
  @ApiOperation({
    summary: 'Registrar nuevos recargos laborales',
    description:
      'Registra el nuevo multiplicador de uno o varios tipos de hora a partir de una fecha de vigencia. Todos los cambios de la solicitud se guardan juntos o no se guarda ninguno. Las versiones anteriores se conservan y su vigencia termina el día previo, por lo que los cálculos ya procesados no se alteran. El cambio queda auditado con el usuario que lo realizó.',
  })
  @ApiCreatedResponse({
    description: 'Recargos registrados correctamente.',
    type: WorkRateConfigResponseDto,
    isArray: true,
  })
  @ApiBadRequestResponse({
    description:
      'Los datos no cumplen las reglas de validación: campos obligatorios, rango del multiplicador, tipos de hora repetidos o sin cambios, o fecha de vigencia anterior a la actual.',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({
    description:
      'El período de vigencia se superpone con el de una versión existente del mismo tipo de hora.',
    type: ErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description:
      'Se produjo un error interno al registrar los recargos. No se aplica ningún cambio.',
    type: ErrorResponseDto,
  })
  async registrar(
    @Body() dto: RegisterWorkRatesDto,
    @Req() request: Request & { user: AuthUser },
  ): Promise<WorkRateConfigResponseDto[]> {
    const versiones = await this.workRateConfigService.registrar(
      dto,
      request.user,
    );

    return versiones.map((version) =>
      WorkRateConfigResponseDto.fromEntity(version),
    );
  }
}
