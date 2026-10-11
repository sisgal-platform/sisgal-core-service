import { PayrollPeriodService } from './payroll-period.service';
import { PayrollPeriodRepositoryPort } from '../../domain/ports/payroll-period-repository.port';
import { Employee, PayrollPeriod } from 'src/entities';

/**
 * Prueba de rendimiento básica de la consulta "Consultar liquidaciones".
 * Mide el procesamiento del servicio con un repositorio en memoria; el
 * tiempo de la base de datos se verifica aparte contra el ambiente real.
 */
describe('PayrollPeriodService – rendimiento', () => {
  const LIQUIDACIONES = 1000;
  const LIMITE_MS = 200;

  const liquidaciones = Array.from({ length: LIQUIDACIONES }, (_, indice) =>
    Object.assign(new PayrollPeriod(), {
      id: indice + 1,
      period_start: '2026-09-01',
      period_end: '2026-09-30',
      total_earnings: 1800000,
      total_deductions: 150000,
      net_pay: 1650000,
      employee: Object.assign(new Employee(), {
        id: indice + 1,
        firstName: `Empleado ${indice + 1}`,
        lastName: 'Prueba',
      }),
    }),
  );

  const service = new PayrollPeriodService({
    findAll: () => Promise.resolve(liquidaciones),
  } as unknown as PayrollPeriodRepositoryPort);

  it(`debe procesar ${LIQUIDACIONES} liquidaciones en menos de ${LIMITE_MS} ms`, async () => {
    // Primera ejecución de calentamiento para no medir la compilación JIT.
    await service.findAll({});

    const inicio = performance.now();
    const resultado = await service.findAll({});
    const duracion = performance.now() - inicio;

    expect(resultado).toHaveLength(LIQUIDACIONES);
    expect(duracion).toBeLessThan(LIMITE_MS);
  });

  it('debe mantener el tiempo de respuesta en consultas repetidas', async () => {
    const CONSULTAS = 20;

    const inicio = performance.now();
    for (let consulta = 0; consulta < CONSULTAS; consulta++) {
      await service.findAll({});
    }
    const promedio = (performance.now() - inicio) / CONSULTAS;

    expect(promedio).toBeLessThan(LIMITE_MS);
  });
});
