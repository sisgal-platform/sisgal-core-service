import { Test, TestingModule } from '@nestjs/testing';

import { AttendanceHistoryController } from './attendance-history.controller';
import { AttendanceHistoryService } from '../../../application/services/attendance-history.service';
import { AttendanceRecordStatus } from '../../../domain/value-objects/attendance-record-status.enum';

import { Role } from 'src/application/ports/auth/auth-user';
import { ROLES_KEY } from 'src/infraestructure/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/infraestructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/infraestructure/auth/guards/roles.guard';

describe('AttendanceHistoryController', () => {
  let controller: AttendanceHistoryController;

  const attendanceHistoryServiceMock = {
    consultarHistorial: jest.fn(),
    actualizarHoraSalida: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttendanceHistoryController],
      providers: [
        {
          provide: AttendanceHistoryService,
          useValue: attendanceHistoryServiceMock,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
      .compile();

    controller = module.get<AttendanceHistoryController>(
      AttendanceHistoryController,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  // =========================================================
  // Seguridad
  // =========================================================

  describe('seguridad', () => {
    it('debe exigir autenticación y validación de roles', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        AttendanceHistoryController,
      );

      expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
    });

    it('debe estar restringido al rol administrador', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, AttendanceHistoryController);

      expect(roles).toEqual([Role.ADMINISTRADOR]);
    });
  });

  // =========================================================
  // GET /asistencias/historial
  // =========================================================

  describe('consultarHistorial', () => {
    it('debe retornar el historial paginado que entrega el servicio', async () => {
      const historial = {
        data: [
          {
            id: 15,
            checkIn: new Date('2026-09-15T13:00:00.000Z'),
            checkOut: null,
            workedMinutes: null,
            status: 'INCOMPLETO',
          },
        ],
        total: 1,
        pagina: 1,
        porPagina: 10,
        totalPaginas: 1,
      };

      attendanceHistoryServiceMock.consultarHistorial.mockResolvedValue(
        historial,
      );

      const resultado = await controller.consultarHistorial({});

      expect(resultado).toEqual(historial);
      expect(
        attendanceHistoryServiceMock.consultarHistorial,
      ).toHaveBeenCalledTimes(1);
    });

    it('debe enviar al servicio los filtros y la paginación recibidos', async () => {
      const query = {
        empleadoId: 7,
        fechaDesde: '2026-09-01',
        fechaHasta: '2026-09-30',
        estado: AttendanceRecordStatus.INCOMPLETO,
        pagina: 2,
        porPagina: 25,
      };

      await controller.consultarHistorial(query);

      expect(
        attendanceHistoryServiceMock.consultarHistorial,
      ).toHaveBeenCalledWith(query);
    });

    it('debe propagar los errores del servicio', async () => {
      const error = new Error('Rango inválido');
      attendanceHistoryServiceMock.consultarHistorial.mockRejectedValue(error);

      await expect(controller.consultarHistorial({})).rejects.toBe(error);
    });
  });

  describe('actualizarHoraSalida', () => {
    it('debe delegar al servicio el ID del registro y los datos validados', async () => {
      const body = { empleadoId: 7, horaSalida: '17:30' };
      const response = { id: 15, empleadoId: 7, checkOut: new Date() };
      attendanceHistoryServiceMock.actualizarHoraSalida.mockResolvedValue(
        response,
      );

      await expect(controller.actualizarHoraSalida(15, body)).resolves.toBe(
        response,
      );
      expect(
        attendanceHistoryServiceMock.actualizarHoraSalida,
      ).toHaveBeenCalledWith(15, body);
    });
  });
});
