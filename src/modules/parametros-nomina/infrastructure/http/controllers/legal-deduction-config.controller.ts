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
import { LegalDeductionConfigService } from '../../../application/services/legal-deduction-config.service';
import {
  LegalDeductionConfigResponseDto,
  RegisterLegalDeductionsDto,
  VigenciaQueryDto,
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
@Controller('parametros-nomina/descuentos-legales')
export class LegalDeductionConfigController {
  constructor(
    private readonly legalDeductionConfigService: LegalDeductionConfigService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Obtener el historial de los descuentos legales',
    description:
      'Obtiene todas las versiones del porcentaje de salud y de pensión a cargo del empleado, agrupadas por descuento y de la más reciente a la más antigua, con su período de vigencia y su estado: vigente, programada o histórica.',
  })
  @ApiOkResponse({
    description: 'Versiones de los descuentos legales obtenidas correctamente.',
    type: LegalDeductionConfigResponseDto,
    isArray: true,
  })
  @ApiInternalServerErrorResponse({
    description:
      'Se produjo un error interno al consultar los descuentos legales.',
    type: ErrorResponseDto,
  })
  async obtenerHistorial(): Promise<LegalDeductionConfigResponseDto[]> {
    const versiones = await this.legalDeductionConfigService.obtenerHistorial();

    return versiones.map((version) =>
      LegalDeductionConfigResponseDto.fromEntity(version),
    );
  }

  @Get('vigentes')
  @ApiOperation({
    summary: 'Obtener los descuentos legales vigentes',
    description:
      'Obtiene el porcentaje de cada descuento legal que rige en la fecha indicada o, si no se indica, en la fecha actual. Son los valores que deben usar las liquidaciones de esa fecha.',
  })
  @ApiOkResponse({
    description: 'Descuentos legales vigentes obtenidos correctamente.',
    type: LegalDeductionConfigResponseDto,
    isArray: true,
  })
  @ApiBadRequestResponse({
    description: 'La fecha proporcionada no tiene un formato válido.',
    type: ErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description:
      'Se produjo un error interno al consultar los descuentos legales.',
    type: ErrorResponseDto,
  })
  async obtenerVigentes(
    @Query() query: VigenciaQueryDto,
  ): Promise<LegalDeductionConfigResponseDto[]> {
    const versiones = await this.legalDeductionConfigService.obtenerVigentes(
      query.fecha,
    );

    return versiones.map((version) =>
      LegalDeductionConfigResponseDto.fromEntity(version),
    );
  }

  @Post()
  @ApiOperation({
    summary: 'Registrar nuevos descuentos legales',
    description:
      'Registra el nuevo porcentaje de uno o varios descuentos legales a partir de una fecha de vigencia. Todos los cambios de la solicitud se guardan juntos o no se guarda ninguno. Las versiones anteriores se conservan y su vigencia termina el día previo, por lo que las liquidaciones ya procesadas no se alteran. El cambio queda auditado con el usuario que lo realizó.',
  })
  @ApiCreatedResponse({
    description: 'Descuentos legales registrados correctamente.',
    type: LegalDeductionConfigResponseDto,
    isArray: true,
  })
  @ApiBadRequestResponse({
    description:
      'Los datos no cumplen las reglas de validación: campos obligatorios, rango del porcentaje, descuentos repetidos o sin cambios, o fecha de vigencia anterior a la actual.',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({
    description:
      'El período de vigencia se superpone con el de una versión existente del mismo descuento.',
    type: ErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description:
      'Se produjo un error interno al registrar los descuentos legales. No se aplica ningún cambio.',
    type: ErrorResponseDto,
  })
  async registrar(
    @Body() dto: RegisterLegalDeductionsDto,
    @Req() request: Request & { user: AuthUser },
  ): Promise<LegalDeductionConfigResponseDto[]> {
    const versiones = await this.legalDeductionConfigService.registrar(
      dto,
      request.user,
    );

    return versiones.map((version) =>
      LegalDeductionConfigResponseDto.fromEntity(version),
    );
  }
}
