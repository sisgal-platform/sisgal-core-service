import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from 'src/shared/infraestructure/http/dtos';
import { PayrollPeriodService } from 'src/modules/liquidaciones/application/services/payroll-period.service';
import { PayrollSlipPdfService } from 'src/modules/liquidaciones/application/services/payroll-slip-pdf.service';
import { toPayrollSlipData } from 'src/modules/liquidaciones/application/services/payroll-slip.mapper';
import { ListPayrollPeriodQueryDto } from '../dtos/list-payroll-period-query.dto';
import { PayrollPeriodResponseDto } from '../dtos/payroll-period-response.dto';
import { PayrollPeriodDetailResponseDto } from '../dtos/payroll-period-detail-response.dto';
import { PreLiquidationService } from 'src/modules/liquidaciones/application/services/pre-liquidation.service';
import { PreLiquidationRequestDto } from 'src/modules/nomina/infrastructure/http/dtos/pre-liquidation-request.dto';
import { Roles } from '../../../../../infraestructure/auth/decorators/roles.decorator';
import { Role } from '../../../../../application/ports/auth/auth-user';
import { JwtAuthGuard } from '../../../../../infraestructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../../infraestructure/auth/guards/roles.guard';

// Consulta de solo lectura: todos los endpoints exigen JWT de Supabase válido (JwtAuthGuard) y rol administrador (RolesGuard)
@ApiTags('Liquidaciones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMINISTRADOR)
@Controller()
export class PayrollPeriodController {
  constructor(
    private readonly payrollPeriodService: PayrollPeriodService,
    private readonly payrollSlipPdfService: PayrollSlipPdfService,
    private readonly preLiquidationService: PreLiquidationService,
  ) {}

  @Get('liquidaciones')
  @ApiOperation({
    summary: 'Listar liquidaciones',
    description:
      'Lista las liquidaciones registradas, con filtros opcionales por empleado y rango de períodos.',
  })
  @ApiOkResponse({
    description: 'Liquidaciones obtenidas correctamente.',
    type: PayrollPeriodResponseDto,
    isArray: true,
  })
  @ApiBadRequestResponse({
    description: 'El período inicial es posterior al período final.',
    type: ErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Se produjo un error interno al consultar las liquidaciones.',
    type: ErrorResponseDto,
  })
  async findAll(
    @Query() query: ListPayrollPeriodQueryDto,
  ): Promise<PayrollPeriodResponseDto[]> {
    const payrollPeriods = await this.payrollPeriodService.findAll(query);
    return payrollPeriods.map((payrollPeriod) =>
      PayrollPeriodResponseDto.fromEntity(payrollPeriod),
    );
  }

  @Get('liquidaciones/:id')
  @ApiOperation({
    summary: 'Obtener el detalle de una liquidación',
    description:
      'Retorna la información completa de una liquidación confirmada, incluyendo los conceptos devengados y las deducciones.',
  })
  @ApiOkResponse({
    description: 'Detalle de la liquidación obtenido correctamente.',
    type: PayrollPeriodDetailResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'No se encontró la liquidación indicada.',
    type: ErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Se produjo un error interno al consultar la liquidación.',
    type: ErrorResponseDto,
  })
  async findById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PayrollPeriodDetailResponseDto> {
    const payrollPeriod = await this.payrollPeriodService.findById(id);
    return PayrollPeriodDetailResponseDto.fromEntity(payrollPeriod);
  }

  @Get('liquidaciones/:id/pdf')
  @ApiOperation({
    summary: 'Generar el comprobante de pago (PDF) de una liquidación',
    description:
      'Genera el desprendible de nómina en PDF con los valores exactos de la liquidación confirmada, sin recalcularlos.',
  })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'PDF del comprobante generado correctamente.' })
  @ApiNotFoundResponse({
    description: 'No se encontró la liquidación indicada.',
    type: ErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Se produjo un error interno al generar el comprobante.',
    type: ErrorResponseDto,
  })
  async generatePdf(
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const payrollPeriod = await this.payrollPeriodService.findById(id);
    // El estado de la liquidación debe validarse aquí antes de generar el
    // PDF: solo liquidaciones confirmadas pueden exportarse. No se valida
    // todavía porque el modelo no tiene una columna de estado real (toda
    // liquidación almacenada se asume confirmada).
    const slipData = toPayrollSlipData(payrollPeriod);
    const pdf = await this.payrollSlipPdfService.generate(slipData);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="liquidacion-${id}.pdf"`,
    });
    return new StreamableFile(pdf);
  }

  @Post('preliquidacion/:employeeId')
  @ApiOperation({
    summary: 'Generar la preliquidación de un empleado',
    description:
      'Calcula una preliquidación sin confirmarla ni almacenarla como liquidación definitiva.',
  })
  @ApiCreatedResponse({
    description: 'Preliquidación generada correctamente.',
    type: PayrollPeriodDetailResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'El identificador o el rango de fechas no son válidos.',
    type: ErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'No se encontró el empleado indicado.',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description:
      'El empleado tiene información faltante o inconsistente para liquidarlo, o no existe una jornada laboral vigente.',
    type: ErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Se produjo un error interno al generar la preliquidación.',
    type: ErrorResponseDto,
  })
  async generatePreLiquidation(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() period: PreLiquidationRequestDto,
  ): Promise<PayrollPeriodDetailResponseDto> {
    return this.preLiquidationService.generate(employeeId, period);
  }

  @Post('liquidaciones/:employeeId')
  @ApiOperation({
    summary: 'Generar y guardar la liquidación de un empleado',
    description:
      'Calcula la liquidación del período y guarda sus totales, conceptos y configuración utilizada.',
  })
  @ApiCreatedResponse({
    description: 'Liquidación generada y guardada correctamente.',
    type: PayrollPeriodDetailResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'El identificador o el rango de fechas no son válidos.',
    type: ErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'No se encontró el empleado indicado.',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description:
      'El empleado tiene información faltante o inconsistente para liquidarlo, ya tiene una liquidación en el período o no existe una jornada laboral vigente.',
    type: ErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Se produjo un error interno al generar la liquidación.',
    type: ErrorResponseDto,
  })
  async generatePayrollPeriod(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() period: PreLiquidationRequestDto,
  ): Promise<PayrollPeriodDetailResponseDto> {
    return this.payrollPeriodService.generate(employeeId, period);
  }
}
