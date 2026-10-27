import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from 'src/shared/infraestructure/http/dtos';
import { JwtAuthGuard } from 'src/infraestructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/infraestructure/auth/guards/roles.guard';
import { Roles } from 'src/infraestructure/auth/decorators/roles.decorator';
import { Role } from 'src/application/ports/auth/auth-user';
import { RegistrarMarcacionService } from '../../../application/services/registrar-marcacion.service';
import { LecturaSimuladaDto, MarcacionResponseDto } from '../dtos';

/**
 * Punto de entrada del lector de huella simulado. Cumple el papel del
 * dispositivo físico mientras el proyecto no cuente con él; cuando exista, el
 * dispositivo usará su propio adaptador y este controlador dejará de usarse.
 */
@ApiTags('Integración - Lector de huella simulado')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
@Roles(Role.ADMINISTRADOR)
@Controller('integracion/lector-simulado')
export class LectorSimuladoController {
  constructor(
    private readonly registrarMarcacionService: RegistrarMarcacionService,
  ) {}

  @Post('marcaciones')
  @ApiOperation({
    summary: 'Registrar una marcación con el lector de huella simulado',
    description:
      'Simula que un empleado coloca el dedo en el lector. El sistema identifica al empleado, decide si la marcación es una entrada o una salida y la registra con la hora del servidor.',
  })
  @ApiCreatedResponse({
    description: 'Marcación registrada correctamente.',
    type: MarcacionResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Los datos de la lectura no son válidos, el empleado no se encuentra activo o no tiene un restaurante asignado.',
    type: ErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Huella no reconocida.',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'Registro duplicado no permitido.',
    type: ErrorResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'Error en lectura biométrica.',
    type: ErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Se produjo un error interno al registrar la marcación.',
    type: ErrorResponseDto,
  })
  registrar(@Body() dto: LecturaSimuladaDto): Promise<MarcacionResponseDto> {
    return this.registrarMarcacionService.registrarMarcacionBiometrica(
      { capturaExitosa: dto.capturaExitosa, huella: dto.huella },
      dto.idempotencyKey,
    );
  }
}
