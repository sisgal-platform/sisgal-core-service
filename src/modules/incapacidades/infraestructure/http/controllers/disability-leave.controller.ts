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
    Req,
    UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
    ApiBadRequestResponse,
    ApiConflictResponse,
    ApiCreatedResponse,
    ApiInternalServerErrorResponse,
    ApiNoContentResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from 'src/shared/infraestructure/http/dtos';
import { DisabilityLeaveService } from 'src/modules/incapacidades/application/services/disability-leave.service';
import { RegisterDisabilityLeaveDto } from '../dtos/register-disability-leave.dto';
import { ListDisabilityLeaveQueryDto } from '../dtos/list-disability-leave-query.dto';
import { UpdateDisabilityLeaveDto } from '../dtos/update-disability-leave.dto';
import { DisabilityLeaveResponseDto } from '../dtos/disability-leave-response.dto';
import { Roles } from '../../../../../infraestructure/auth/decorators/roles.decorator';
import { Role } from '../../../../../application/ports/auth/auth-user';
import type { AuthUser } from '../../../../../application/ports/auth/auth-user';
import { JwtAuthGuard } from '../../../../../infraestructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../../infraestructure/auth/guards/roles.guard';

// Todos los endpoints exigen JWT de Supabase válido (JwtAuthGuard) y rol administrador (RolesGuard)
@ApiTags('Incapacidades')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMINISTRADOR)
@Controller('incapacidades')
export class DisabilityLeaveController {
    constructor(private readonly disabilityLeaveService: DisabilityLeaveService) {}

    @Post()
    @ApiOperation({
        summary: 'Registrar incapacidad o licencia',
        description:
            'Registra una incapacidad o licencia para un empleado activo. Calcula automáticamente la cantidad de días y valida que el período no se cruce con uno ya existente.',
    })
    @ApiCreatedResponse({
        description: 'Incapacidad registrada correctamente.',
        type: DisabilityLeaveResponseDto,
    })
    @ApiBadRequestResponse({
        description: 'Datos inválidos, empleado inactivo o rango de fechas inválido.',
        type: ErrorResponseDto,
    })
    @ApiNotFoundResponse({
        description: 'No se encontró el empleado indicado.',
        type: ErrorResponseDto,
    })
    @ApiConflictResponse({
        description: 'El período se cruza con un registro existente del empleado.',
        type: ErrorResponseDto,
    })
    @ApiInternalServerErrorResponse({
        description: 'Se produjo un error interno al registrar la incapacidad.',
        type: ErrorResponseDto,
    })
    async register(
        @Body() dto: RegisterDisabilityLeaveDto,
        @Req() request: Request & { user: AuthUser },
    ): Promise<DisabilityLeaveResponseDto> {
        const disabilityLeave = await this.disabilityLeaveService.register(dto, request.user);
        return DisabilityLeaveResponseDto.fromEntity(disabilityLeave);
    }

    @Patch(':id')
    @ApiOperation({
        summary: 'Actualizar incapacidad o licencia',
        description:
            'Permite corregir el tipo y las fechas, y recalcula los días. No permite cambiar las fechas ni el tipo si una liquidación guardada incluye esas fechas.',
    })
    @ApiOkResponse({
        description: 'Incapacidad actualizada correctamente.',
        type: DisabilityLeaveResponseDto,
    })
    @ApiBadRequestResponse({
        description: 'Datos inválidos o rango de fechas inválido.',
        type: ErrorResponseDto,
    })
    @ApiNotFoundResponse({
        description: 'No se encontró la incapacidad indicada.',
        type: ErrorResponseDto,
    })
    @ApiConflictResponse({
        description: 'El período se cruza con otro registro del empleado o con una liquidación guardada.',
        type: ErrorResponseDto,
    })
    @ApiInternalServerErrorResponse({
        description: 'Se produjo un error interno al actualizar la incapacidad.',
        type: ErrorResponseDto,
    })
    async update(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateDisabilityLeaveDto,
        @Req() request: Request & { user: AuthUser },
    ): Promise<DisabilityLeaveResponseDto> {
        const disabilityLeave = await this.disabilityLeaveService.update(id, dto, request.user);
        return DisabilityLeaveResponseDto.fromEntity(disabilityLeave);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        summary: 'Eliminar incapacidad o licencia',
        description: 'Elimina un registro cuyas fechas no estén incluidas en una liquidación guardada.',
    })
    @ApiNoContentResponse({ description: 'Incapacidad eliminada correctamente.' })
    @ApiNotFoundResponse({
        description: 'No se encontró la incapacidad indicada.',
        type: ErrorResponseDto,
    })
    @ApiConflictResponse({
        description: 'Una liquidación guardada incluye las fechas de la incapacidad.',
        type: ErrorResponseDto,
    })
    @ApiInternalServerErrorResponse({
        description: 'Se produjo un error interno al eliminar la incapacidad.',
        type: ErrorResponseDto,
    })
    async delete(
        @Param('id', ParseIntPipe) id: number,
        @Req() request: Request & { user: AuthUser },
    ): Promise<void> {
        await this.disabilityLeaveService.delete(id, request.user);
    }

    @Get()
    @ApiOperation({
        summary: 'Listar incapacidades',
        description:
            'Lista las incapacidades y licencias registradas, con filtros opcionales por empleado, nombre, cargo, estado y rango de fechas.',
    })
    @ApiOkResponse({
        description: 'Incapacidades obtenidas correctamente.',
        type: DisabilityLeaveResponseDto,
        isArray: true,
    })
    @ApiBadRequestResponse({
        description: 'El rango de fechas no es válido (fecha inicial posterior a la final).',
        type: ErrorResponseDto,
    })
    @ApiInternalServerErrorResponse({
        description: 'Se produjo un error interno al consultar las incapacidades.',
        type: ErrorResponseDto,
    })
    async findAll(
        @Query() query: ListDisabilityLeaveQueryDto,
    ): Promise<DisabilityLeaveResponseDto[]> {
        const disabilityLeaves = await this.disabilityLeaveService.findAll(query);
        return disabilityLeaves.map((disabilityLeave) =>
            DisabilityLeaveResponseDto.fromEntity(disabilityLeave),
        );
    }
}
