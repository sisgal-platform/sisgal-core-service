import type { PayrollHoursRepositoryPort } from '../../domain/ports/payroll-hours.repository.port';
import type { SystemConfigRepositoryPort } from '../../domain/ports/system-config-repository.port';
import { getColombiaDate } from 'src/shared/common/utils/colombia-date.util';

// Las cachés se crean en cada cálculo de nómina, así que un parámetro
// actualizado se refleja en el siguiente cálculo.

function createMemo() {
  const cache = new Map<string, Promise<unknown>>();

  return function remember<T>(key: string, load: () => Promise<T>): Promise<T> {
    const cached = cache.get(key) as Promise<T> | undefined;
    if (cached) {
      return cached;
    }

    const value = load();
    cache.set(key, value);
    return value;
  };
}

/**
 * Consulta la jornada, cada multiplicador y los festivos una sola vez por día
 * colombiano durante el cálculo.
 */
export function cachePayrollHoursLookups(
  repository: PayrollHoursRepositoryPort,
): PayrollHoursRepositoryPort {
  const remember = createMemo();

  return {
    findWorkdayConfig: (date) =>
      remember(`workday|${getColombiaDate(date)}`, () =>
        repository.findWorkdayConfig(date),
      ),
    findWorkRateConfig: (type, date) =>
      remember(`rate|${type}|${getColombiaDate(date)}`, () =>
        repository.findWorkRateConfig(type, date),
      ),
    isHoliday: (date) =>
      remember(`holiday|${getColombiaDate(date)}`, () =>
        repository.isHoliday(date),
      ),
  };
}

/**
 * Consulta cada parámetro del sistema (salario mínimo, auxilio, salud,
 * pensión) una sola vez por fecha durante el cálculo, en vez de una vez por
 * empleado.
 */
export function cacheSystemConfigLookups(
  repository: SystemConfigRepositoryPort,
): SystemConfigRepositoryPort {
  const remember = createMemo();

  return {
    getValue: (key, payrollDate) =>
      remember(`${key}|${getColombiaDate(payrollDate)}`, () =>
        repository.getValue(key, payrollDate),
      ),
  };
}
