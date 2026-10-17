import { AttendanceRecord, Employee, PayrollPeriod } from 'src/entities';
import { DashboardIndicatorsService } from './dashboard-indicators.service';

/**
 * Prueba de rendimiento básica de la consulta de indicadores del dashboard
 * (criterio no funcional: la consulta debe responder en máximo 3 segundos).
 * Mide el procesamiento del servicio con repositorios en memoria; el tiempo
 * de la base de datos se verifica aparte contra el ambiente real.
 */
describe('DashboardIndicatorsService – rendimiento', () => {
  const EMPLEADOS = 1000;
  const REGISTROS_POR_EMPLEADO = 90; // ~3 meses de marcaciones diarias
  const LIQUIDACIONES = 1000;
  const LIMITE_MS = 1000;

  const empleados = Array.from({ length: EMPLEADOS }, (_, indice) =>
    Object.assign(new Employee(), { id: indice + 1, status: 'ACTIVO' }),
  );

  const registros = Array.from({ length: REGISTROS_POR_EMPLEADO }, (_, dia) =>
    empleados.map((empleado) =>
      Object.assign(new AttendanceRecord(), {
        check_in: new Date(Date.UTC(2026, 9, 1 + (dia % 28), 13, 0, empleado.id % 60)),
        work_minutes: 480,
        extra_day_minutes: 30,
        extra_night_minutes: 0,
        holiday_minutes: 0,
      }),
    ),
  ).flat();

  const liquidaciones = Array.from({ length: LIQUIDACIONES }, () =>
    Object.assign(new PayrollPeriod(), {
      net_pay: 1650000,
      total_earnings: 1800000,
      total_deductions: 150000,
    }),
  );

  const service = new DashboardIndicatorsService(
    {
      // Filtra por fecha, igual que lo haría la consulta real a la base de datos.
      findCheckInsBetween: (desde: Date, hasta: Date) =>
        Promise.resolve(
          registros.filter((registro) => registro.check_in >= desde && registro.check_in < hasta),
        ),
    } as never,
    { findAll: () => Promise.resolve(liquidaciones) } as never,
    { findAll: () => Promise.resolve(empleados) } as never,
  );

  it(`debe procesar ${EMPLEADOS} empleados y ${registros.length} marcaciones en menos de ${LIMITE_MS} ms`, async () => {
    // Primera ejecución de calentamiento para no medir la compilación JIT.
    await service.getIndicators('2026-10-01', '2026-10-31');

    const inicio = performance.now();
    const resultado = await service.getIndicators('2026-10-01', '2026-10-31');
    const duracion = performance.now() - inicio;

    expect(resultado.attendance.averagePercentage).not.toBeNull();
    expect(resultado.workedHours.total).not.toBeNull();
    expect(resultado.laborCosts.total).not.toBeNull();
    expect(duracion).toBeLessThan(LIMITE_MS);
  });

  it('debe mantener el tiempo de respuesta en consultas repetidas', async () => {
    const CONSULTAS = 10;

    const inicio = performance.now();
    for (let consulta = 0; consulta < CONSULTAS; consulta++) {
      await service.getIndicators('2026-10-01', '2026-10-31');
    }
    const promedio = (performance.now() - inicio) / CONSULTAS;

    expect(promedio).toBeLessThan(LIMITE_MS);
  });
});
