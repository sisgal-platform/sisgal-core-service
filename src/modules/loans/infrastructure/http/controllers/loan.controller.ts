import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from 'src/application/ports/auth/auth-user';
import { Roles } from 'src/infraestructure/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/infraestructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/infraestructure/auth/guards/roles.guard';
import { LoanService } from '../../../application/services/loan.service';
import { CreateLoanDto } from '../dtos/create-loan.dto';
import { LoanIndicatorsResponseDto } from '../dtos/loan-indicators-response.dto';
import { LoanQueryDto } from '../dtos/loan-query.dto';
import { LoanResponseDto } from '../dtos/loan-response.dto';
import { UpdateLoanDto } from '../dtos/update-loan.dto';

@ApiTags('Préstamos')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
@Roles(Role.ADMINISTRADOR)
@Controller('prestamos')
export class LoanController {
  constructor(private readonly loanService: LoanService) {}

  @Post()
  @ApiOperation({
    summary: 'Crear préstamo',
    description:
      'Crea un préstamo para un empleado y calcula la cuota, las cuotas pendientes y el saldo inicial.',
  })
  @ApiCreatedResponse({
    description: 'Préstamo creado correctamente.',
    type: LoanResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Los datos del préstamo proporcionados no son válidos.',
  })
  @ApiNotFoundResponse({
    description: 'No se encontró el empleado indicado.',
  })
  @ApiInternalServerErrorResponse({
    description: 'Se produjo un error interno al crear el préstamo.',
  })
  crear(@Body() dto: CreateLoanDto): Promise<LoanResponseDto> {
    return this.loanService.crear(dto);
  }

  @Get('indicadores')
  @ApiOperation({
    summary: 'Obtener indicadores de préstamos activos',
    description:
      'Retorna en una consulta la cantidad y la suma del monto original de los préstamos activos.',
  })
  @ApiOkResponse({
    description: 'Indicadores de préstamos activos obtenidos correctamente.',
    type: LoanIndicatorsResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Se produjo un error interno al consultar los indicadores.',
  })
  obtenerIndicadores(): Promise<LoanIndicatorsResponseDto> {
    return this.loanService.obtenerIndicadores();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener préstamo por identificador',
    description:
      'Retorna un préstamo con la misma información del empleado y del préstamo que la consulta de listado.',
  })
  @ApiParam({
    name: 'id',
    description: 'Identificador del préstamo',
    example: 1,
    type: Number,
  })
  @ApiOkResponse({
    description: 'Préstamo obtenido correctamente.',
    type: LoanResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'El identificador del préstamo debe ser un entero válido.',
  })
  @ApiNotFoundResponse({
    description: 'No se encontró el préstamo indicado.',
  })
  @ApiInternalServerErrorResponse({
    description: 'Se produjo un error interno al consultar el préstamo.',
  })
  obtenerPorId(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<LoanResponseDto> {
    return this.loanService.obtenerPorId(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar préstamo',
    description:
      'Antes del primer descuento permite corregir todos los datos y recalcula la cuota y el saldo. Después solo permite cambiar la periodicidad.',
  })
  @ApiParam({
    name: 'id',
    description: 'Identificador del préstamo',
    example: 1,
    type: Number,
  })
  @ApiOkResponse({
    description: 'Préstamo actualizado correctamente.',
    type: LoanResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Los datos del préstamo proporcionados no son válidos.',
  })
  @ApiNotFoundResponse({
    description: 'No se encontró el préstamo o el empleado indicado.',
  })
  @ApiConflictResponse({
    description: 'El préstamo ya tiene cuotas descontadas.',
  })
  @ApiInternalServerErrorResponse({
    description: 'Se produjo un error interno al actualizar el préstamo.',
  })
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLoanDto,
  ): Promise<LoanResponseDto> {
    return this.loanService.actualizar(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Eliminar préstamo',
    description:
      'Elimina un préstamo que no tenga cuotas descontadas en liquidaciones.',
  })
  @ApiParam({
    name: 'id',
    description: 'Identificador del préstamo',
    example: 1,
    type: Number,
  })
  @ApiNoContentResponse({ description: 'Préstamo eliminado correctamente.' })
  @ApiNotFoundResponse({
    description: 'No se encontró el préstamo indicado.',
  })
  @ApiConflictResponse({
    description: 'El préstamo tiene cuotas descontadas en liquidaciones.',
  })
  @ApiInternalServerErrorResponse({
    description: 'Se produjo un error interno al eliminar el préstamo.',
  })
  eliminar(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.loanService.eliminar(id);
  }

  @Get()
  @ApiOperation({
    summary: 'Obtener préstamos',
    description:
      'Lista los préstamos con la información del empleado y permite combinar filtros por empleado, nombre, documento, estado y fecha de otorgamiento.',
  })
  @ApiOkResponse({
    description: 'Préstamos obtenidos correctamente.',
    type: LoanResponseDto,
    isArray: true,
  })
  @ApiBadRequestResponse({
    description:
      'Los filtros o el rango de fechas proporcionados no son válidos.',
  })
  @ApiInternalServerErrorResponse({
    description: 'Se produjo un error interno al consultar los préstamos.',
  })
  obtenerTodos(@Query() query: LoanQueryDto): Promise<LoanResponseDto[]> {
    return this.loanService.obtenerTodos(query);
  }
}
