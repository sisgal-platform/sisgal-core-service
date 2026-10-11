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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { WorkdayConfigService } from '../../../application/services/workday-config.service';
import {
  RegisterWorkdayConfigDto,
  WorkdayConfigResponseDto,
  WorkdayConfigVigenteQueryDto,
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
@Controller('parametros-nomina/jornada-laboral')
export class WorkdayConfigController {
  constructor(private readonly workdayConfigService: WorkdayConfigService) {}

  @Get()
  @ApiOperation({
    summary: 'Obtener el historial de la jornada laboral',
    description:
      'Obtiene todas las versiones de la configuración de jornada laboral, de la más reciente a la más antigua, con su período de vigencia y su estado: vigente, programada o histórica.',
  })
  @ApiOkResponse({
    description: 'Versiones de la jornada laboral obtenidas correctamente.',
    type: WorkdayConfigResponseDto,
    isArray: true,
  })
  @ApiInternalServerErrorResponse({
    description: 'Se produjo un error interno al consultar la jornada laboral.',
    type: ErrorResponseDto,
  })
  async obtenerHistorial(): Promise<WorkdayConfigResponseDto[]> {
    const versiones = await this.workdayConfigService.obtenerHistorial();

    return versiones.map((version) =>
      WorkdayConfigResponseDto.fromEntity(version),
    );
  }

  @Get('vigente')
  @ApiOperation({
    summary: 'Obtener la jornada laboral vigente',
    description:
      'Obtiene la versión de la jornada laboral que rige en la fecha indicada o, si no se indica, en la fecha actual. Es la versión que deben usar los cálculos de asistencia y nómina de esa fecha.',
  })
  @ApiOkResponse({
    description: 'Jornada laboral vigente obtenida correctamente.',
    type: WorkdayConfigResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'La fecha proporcionada no tiene un formato válido.',
    type: ErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'No existe una jornada laboral vigente para la fecha.',
    type: ErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Se produjo un error interno al consultar la jornada laboral.',
    type: ErrorResponseDto,
  })
  async obtenerVigente(
    @Query() query: WorkdayConfigVigenteQueryDto,
  ): Promise<WorkdayConfigResponseDto> {
    const version = await this.workdayConfigService.obtenerVigente(query.fecha);

    return WorkdayConfigResponseDto.fromEntity(version);
  }

  @Post()
  @ApiOperation({
    summary: 'Registrar una versión de la jornada laboral',
    description:
      'Registra los nuevos valores de la jornada laboral a partir de una fecha de vigencia. La versión anterior se conserva y su vigencia termina el día previo, por lo que los cálculos ya procesados no se alteran. El cambio queda auditado con el usuario que lo realizó.',
  })
  @ApiCreatedResponse({
    description: 'Versión de la jornada laboral registrada correctamente.',
    type: WorkdayConfigResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Los datos no cumplen las reglas de validación: campos obligatorios, rangos, coherencia de los horarios o fecha de vigencia anterior a la actual.',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({
    description:
      'El período de vigencia se superpone con el de una versión existente.',
    type: ErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description:
      'Se produjo un error interno al registrar la jornada laboral. No se aplica ningún cambio.',
    type: ErrorResponseDto,
  })
  async registrar(
    @Body() dto: RegisterWorkdayConfigDto,
    @Req() request: Request & { user: AuthUser },
  ): Promise<WorkdayConfigResponseDto> {
    const version = await this.workdayConfigService.registrar(
      dto,
      request.user,
    );

    return WorkdayConfigResponseDto.fromEntity(version);
  }
}
