import { calcularEstadoIncapacidad } from './disability-status';

describe('calcularEstadoIncapacidad', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-02T15:00:00.000Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // TypeORM entrega las columnas `date` como texto.
  it.each([
    ['2026-11-03', 'Activo'],
    ['2026-11-02', 'Activo'],
    ['2026-11-01', 'Finalizado'],
  ])('con fecha de fin %s está %s', (endDate, status) => {
    expect(calcularEstadoIncapacidad(endDate as unknown as Date)).toBe(status);
  });
});
