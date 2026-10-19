import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Role } from 'src/application/ports/auth/auth-user';
import { ErrorResponseDto } from 'src/shared/infraestructure/http/dtos';
import { Roles } from 'src/infraestructure/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/infraestructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/infraestructure/auth/guards/roles.guard';
import { PayrollHoursService } from 'src/modules/nomina/application/services/payroll-hours.service';
import { ClassifiedHourResponseDto } from '../dtos/classified-hour-response.dto';
import { ClassifyWorkedIntervalDto } from '../dtos/classify-worked-interval.dto';
import { LegalDeductionsService } from 'src/modules/nomina/application/services/legal-deductions.service';
import { NominaService } from 'src/modules/nomina/application/services/nomina.service';
import { PayrollCalculationResponseDto } from '../dtos/payroll-calculation-response.dto';
import { PreLiquidationRequestDto } from '../dtos/pre-liquidation-request.dto';

@ApiTags('Nómina')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
@Roles(Role.ADMINISTRADOR)
@Controller('nomina')
export class NominaController {
  constructor(
    private readonly payrollHoursService: PayrollHoursService,
    private readonly legalDeductionsService: LegalDeductionsService,
    private readonly nominaService: NominaService,
  ) {}

  @Post('calcular')
  @ApiOperation({
    summary: 'Calcular la nómina de un período',
    description:
      'Calcula devengados, deducciones y neto a pagar de todos los empleados activos para el período, sin guardar la liquidación. Los empleados con información faltante o inconsistente se informan con su causa.',
  })
  @ApiCreatedResponse({
    description:
      'Cálculo realizado; el estado indica si algún empleado quedó con errores.',
    type: PayrollCalculationResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'El rango de fechas no es válido.',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description: 'No existe una jornada laboral vigente para el período.',
    type: ErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description:
      'Falta una configuración vigente (salario mínimo, auxilio, salud o pensión) o se produjo un error interno.',
    type: ErrorResponseDto,
  })
  async calculatePayroll(
    @Body() period: PreLiquidationRequestDto,
  ): Promise<PayrollCalculationResponseDto> {
    const result = await this.nominaService.calculatePayroll(
      period.periodStart,
      period.periodEnd,
    );
    return PayrollCalculationResponseDto.fromResult(result);
  }

  @Post('classify')
  @ApiOperation({
    summary: 'Clasifica un intervalo de trabajo en horas diurnas y nocturnas',
    description:
      'Divide el intervalo según la configuración vigente y aplica el multiplicador vigente a cada segmento.',
  })
  @ApiCreatedResponse({
    description: 'Intervalo clasificado correctamente.',
    type: ClassifiedHourResponseDto,
    isArray: true,
  })
  @ApiBadRequestResponse({
    description: 'El intervalo o la configuración de jornada no son válidos.',
  })
  @ApiNotFoundResponse({
    description: 'No existe configuración de jornada o multiplicador vigente.',
  })
  @ApiInternalServerErrorResponse({
    description: 'Se produjo un error interno al clasificar el intervalo.',
  })
  async classify(
    @Body() dto: ClassifyWorkedIntervalDto,
  ): Promise<ClassifiedHourResponseDto[]> {
    return this.payrollHoursService.classifyWorkedInterval(
      dto.employeeId,
      dto.start,
      dto.end,
    );
  }

  @Post('prueba-deducciones')
  @ApiOperation({
    summary: 'Probar el cálculo de deducciones legales',
    description:
      'Endpoint temporal para verificar los descuentos de salud y pensión.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        contributionBase: {
          type: 'number',
          example: 2000000,
        },
        payrollDate: {
          type: 'string',
          format: 'date',
          example: '2026-10-10',
        },
      },
      required: ['contributionBase', 'payrollDate'],
    },
  })
  async testLegalDeductions(
    @Body()
    body: {
      contributionBase: number;
      payrollDate: string;
    },
  ) {
    const contributionBase = Number(body.contributionBase);
    const payrollDate = new Date(`${body.payrollDate}T12:00:00.000Z`);

    if (
      !Number.isFinite(contributionBase) ||
      !body.payrollDate ||
      Number.isNaN(payrollDate.getTime())
    ) {
      throw new BadRequestException(
        'Debes enviar una base de cotización y una fecha válidas.',
      );
    }

    return this.legalDeductionsService.calculate(contributionBase, payrollDate);
  }
}
