import { Controller, Get, Param, ParseIntPipe, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiInternalServerErrorResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiProduces,
    ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from 'src/shared/infraestructure/http/dtos';
import { PayrollPeriodService } from 'src/modules/liquidaciones/application/services/payroll-period.service';
import { PayrollSlipPdfService } from 'src/modules/liquidaciones/application/services/payroll-slip-pdf.service';
import { toPayrollSlipData } from 'src/modules/liquidaciones/application/services/payroll-slip.mapper';
import { ListPayrollPeriodQueryDto } from '../dtos/list-payroll-period-query.dto';
import { PayrollPeriodResponseDto } from '../dtos/payroll-period-response.dto';
import { PayrollPeriodDetailResponseDto } from '../dtos/payroll-period-detail-response.dto';
import { Roles } from '../../../../../infraestructure/auth/decorators/roles.decorator';
import { Role } from '../../../../../application/ports/auth/auth-user';
import { JwtAuthGuard } from '../../../../../infraestructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../../infraestructure/auth/guards/roles.guard';

// Consulta de solo lectura: todos los endpoints exigen JWT de Supabase válido (JwtAuthGuard) y rol administrador (RolesGuard)
@ApiTags('Liquidaciones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMINISTRADOR)
@Controller('liquidaciones')
export class PayrollPeriodController {
    constructor(
        private readonly payrollPeriodService: PayrollPeriodService,
        private readonly payrollSlipPdfService: PayrollSlipPdfService,
    ) {}

    @Get()
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

    @Get(':id')
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

    @Get(':id/pdf')
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
}
