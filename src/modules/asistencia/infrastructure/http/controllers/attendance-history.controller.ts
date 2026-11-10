import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiConflictResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { Role } from 'src/application/ports/auth/auth-user';
import { Roles } from 'src/infraestructure/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/infraestructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/infraestructure/auth/guards/roles.guard';
import { ErrorResponseDto } from 'src/shared/infraestructure/http/dtos';
import { AttendanceHistoryService } from '../../../application/services/attendance-history.service';
import {
  ActualizarHoraSalidaDto,
  ActualizarHoraSalidaResponseDto,
  AttendanceHistoryResponseDto,
  HistorialAsistenciaQueryDto,
} from '../dtos';

@ApiTags('Asistencia')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
@Roles(Role.ADMINISTRADOR)
@Controller('asistencias')
export class AttendanceHistoryController {
  constructor(
    private readonly attendanceHistoryService: AttendanceHistoryService,
  ) {}

  @Get('historial')
  @ApiOperation({
    summary: 'Consultar historial de asistencia',
    description:
      'Obtiene las marcaciones de asistencia en orden cronológico y de forma paginada. Permite combinar los filtros por empleado, rango de fechas y estado del registro. Es una consulta de solo lectura.',
  })
  @ApiOkResponse({
    description: 'Historial de asistencia obtenido correctamente.',
    type: AttendanceHistoryResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Los filtros, el rango de fechas o los parámetros de paginación no son válidos.',
    type: ErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Se produjo un error interno al consultar el historial.',
    type: ErrorResponseDto,
  })
  consultarHistorial(
    @Query() query: HistorialAsistenciaQueryDto,
  ): Promise<AttendanceHistoryResponseDto> {
    return this.attendanceHistoryService.consultarHistorial(query);
  }

  @Patch(':id/salida')
  @ApiOperation({
    summary: 'Completar la hora de salida de una asistencia incompleta',
    description:
      'Actualiza la salida solo si aún no está marcada y el empleado coincide. La hora se recibe en formato HH:mm de America/Bogota; si es anterior a la entrada, corresponde al día siguiente.',
  })
  @ApiOkResponse({
    description: 'Hora de salida actualizada.',
    type: ActualizarHoraSalidaResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'El identificador o la hora local no son válidos, o la salida no es posterior a la entrada.',
    type: ErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'No existe la asistencia para el empleado indicado.',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'La asistencia ya tiene hora de salida.',
    type: ErrorResponseDto,
  })
  actualizarHoraSalida(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarHoraSalidaDto,
  ): Promise<ActualizarHoraSalidaResponseDto> {
    return this.attendanceHistoryService.actualizarHoraSalida(id, dto);
  }
}
