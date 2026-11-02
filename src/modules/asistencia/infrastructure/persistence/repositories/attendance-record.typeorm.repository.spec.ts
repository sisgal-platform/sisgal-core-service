import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { AttendanceRecordTypeOrmRepository } from './attendance-record.typeorm.repository';

import { AttendanceRecord } from 'src/entities';

import { AttendanceRecordStatus } from '../../../domain/value-objects/attendance-record-status.enum';

describe('AttendanceRecordTypeOrmRepository', () => {
  let repository: AttendanceRecordTypeOrmRepository;

  const queryBuilderMock = {
    innerJoinAndSelect: jest.fn(),
    leftJoinAndSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    addOrderBy: jest.fn(),
    offset: jest.fn(),
    limit: jest.fn(),
    getManyAndCount: jest.fn(),
    getMany: jest.fn(),
  };

  const attendanceRecordRepositoryMock = {
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    attendanceRecordRepositoryMock.createQueryBuilder.mockReturnValue(
      queryBuilderMock,
    );
    queryBuilderMock.innerJoinAndSelect.mockReturnValue(queryBuilderMock);
    queryBuilderMock.leftJoinAndSelect.mockReturnValue(queryBuilderMock);
    queryBuilderMock.where.mockReturnValue(queryBuilderMock);
    queryBuilderMock.andWhere.mockReturnValue(queryBuilderMock);
    queryBuilderMock.orderBy.mockReturnValue(queryBuilderMock);
    queryBuilderMock.addOrderBy.mockReturnValue(queryBuilderMock);
    queryBuilderMock.offset.mockReturnValue(queryBuilderMock);
    queryBuilderMock.limit.mockReturnValue(queryBuilderMock);
    queryBuilderMock.getManyAndCount.mockResolvedValue([[], 0]);
    queryBuilderMock.getMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceRecordTypeOrmRepository,
        {
          provide: getRepositoryToken(AttendanceRecord),
          useValue: attendanceRecordRepositoryMock,
        },
      ],
    }).compile();

    repository = module.get<AttendanceRecordTypeOrmRepository>(
      AttendanceRecordTypeOrmRepository,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(repository).toBeDefined();
  });

  describe('findHistory', () => {
    it('debe cargar el empleado y la sucursal de cada registro', async () => {
      await repository.findHistory({ pagina: 1, porPagina: 10 });

      expect(
        attendanceRecordRepositoryMock.createQueryBuilder,
      ).toHaveBeenCalledWith('record');
      expect(queryBuilderMock.innerJoinAndSelect).toHaveBeenCalledWith(
        'record.employee',
        'employee',
      );
      expect(queryBuilderMock.leftJoinAndSelect).toHaveBeenCalledWith(
        'record.branch',
        'branch',
      );
    });

    it('no debe aplicar condiciones cuando no se envían filtros', async () => {
      await repository.findHistory({ pagina: 1, porPagina: 10 });

      expect(queryBuilderMock.andWhere).not.toHaveBeenCalled();
    });

    it('debe filtrar por empleado', async () => {
      await repository.findHistory({
        empleadoId: 7,
        pagina: 1,
        porPagina: 10,
      });

      expect(queryBuilderMock.andWhere.mock.calls).toEqual([
        ['employee.id = :empleadoId', { empleadoId: 7 }],
      ]);
    });

    it('debe filtrar los registros incompletos por la ausencia de salida', async () => {
      await repository.findHistory({
        estado: AttendanceRecordStatus.INCOMPLETO,
        pagina: 1,
        porPagina: 10,
      });

      expect(queryBuilderMock.andWhere.mock.calls).toEqual([
        ['record.check_out IS NULL'],
      ]);
    });

    it('debe filtrar los registros completos por la presencia de salida', async () => {
      await repository.findHistory({
        estado: AttendanceRecordStatus.COMPLETO,
        pagina: 1,
        porPagina: 10,
      });

      expect(queryBuilderMock.andWhere.mock.calls).toEqual([
        ['record.check_out IS NOT NULL'],
      ]);
    });

    it('debe combinar el empleado, el rango de fechas y el estado mediante AND', async () => {
      const desde = new Date('2026-09-01T05:00:00.000Z');
      const hasta = new Date('2026-10-01T05:00:00.000Z');

      await repository.findHistory({
        empleadoId: 7,
        desde,
        hasta,
        estado: AttendanceRecordStatus.INCOMPLETO,
        pagina: 1,
        porPagina: 10,
      });

      expect(queryBuilderMock.andWhere.mock.calls).toEqual([
        ['employee.id = :empleadoId', { empleadoId: 7 }],
        ['record.check_in >= :desde', { desde }],
        ['record.check_in < :hasta', { hasta }],
        ['record.check_out IS NULL'],
      ]);
    });

    it('debe ordenar de la entrada más reciente a la más antigua', async () => {
      await repository.findHistory({ pagina: 1, porPagina: 10 });

      expect(queryBuilderMock.orderBy).toHaveBeenCalledWith(
        'record.check_in',
        'DESC',
      );
      expect(queryBuilderMock.addOrderBy).toHaveBeenCalledWith(
        'record.id',
        'DESC',
      );
    });

    it.each([
      [1, 10, 0],
      [2, 10, 10],
      [3, 25, 50],
      [4, 50, 150],
    ])(
      'en la página %i de %i resultados debe saltar %i registros',
      async (pagina, porPagina, saltados) => {
        await repository.findHistory({ pagina, porPagina });

        expect(queryBuilderMock.offset).toHaveBeenCalledWith(saltados);
        expect(queryBuilderMock.limit).toHaveBeenCalledWith(porPagina);
      },
    );

    it('debe retornar los registros de la página y el total sin paginar', async () => {
      const registros = [new AttendanceRecord(), new AttendanceRecord()];
      queryBuilderMock.getManyAndCount.mockResolvedValue([registros, 57]);

      await expect(
        repository.findHistory({ pagina: 1, porPagina: 10 }),
      ).resolves.toEqual({ records: registros, total: 57 });
    });
  });

  describe('findCheckInsBetween', () => {
    const desde = new Date('2026-10-04T05:00:00.000Z');
    const hasta = new Date('2026-10-05T05:00:00.000Z');

    it('debe cargar el empleado y la sucursal de cada registro', async () => {
      await repository.findCheckInsBetween(desde, hasta);

      expect(
        attendanceRecordRepositoryMock.createQueryBuilder,
      ).toHaveBeenCalledWith('record');
      expect(queryBuilderMock.innerJoinAndSelect).toHaveBeenCalledWith(
        'record.employee',
        'employee',
      );
      expect(queryBuilderMock.leftJoinAndSelect).toHaveBeenCalledWith(
        'record.branch',
        'branch',
      );
    });

    it('debe filtrar las entradas dentro del rango, sin incluir el límite final', async () => {
      await repository.findCheckInsBetween(desde, hasta);

      expect(queryBuilderMock.where).toHaveBeenCalledWith(
        'record.check_in >= :desde',
        { desde },
      );
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'record.check_in < :hasta',
        { hasta },
      );
    });

    it('debe ordenar por hora de entrada para identificar la primera del día', async () => {
      await repository.findCheckInsBetween(desde, hasta);

      expect(queryBuilderMock.orderBy).toHaveBeenCalledWith(
        'record.check_in',
        'ASC',
      );
      expect(queryBuilderMock.addOrderBy).toHaveBeenCalledWith(
        'record.id',
        'ASC',
      );
    });

    it('debe retornar los registros encontrados', async () => {
      const registros = [new AttendanceRecord()];
      queryBuilderMock.getMany.mockResolvedValue(registros);

      await expect(repository.findCheckInsBetween(desde, hasta)).resolves.toBe(
        registros,
      );
    });
  });
});
