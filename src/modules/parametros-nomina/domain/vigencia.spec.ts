import {
  aDate,
  aFechaCalendario,
  diaAnterior,
  EstadoVigencia,
  estadoDeVigencia,
} from './vigencia';

describe('Vigencia de parámetros', () => {
  describe('aFechaCalendario', () => {
    it('debe conservar la fecha cuando la columna llega como texto', () => {
      expect(aFechaCalendario('2026-01-01')).toBe('2026-01-01');
    });

    it('debe tomar el día calendario cuando la columna llega como Date', () => {
      expect(aFechaCalendario(new Date(2026, 0, 1, 12))).toBe('2026-01-01');
    });
  });

  describe('aDate', () => {
    it.each(['2026-11-01', '2026-12-31', '2028-02-29'])(
      'debe conservar el día calendario de %s',
      (fecha) => {
        expect(aFechaCalendario(aDate(fecha))).toBe(fecha);
      },
    );
  });

  describe('diaAnterior', () => {
    it.each([
      ['2026-11-02', '2026-11-01'],
      ['2026-11-01', '2026-10-31'],
      ['2027-01-01', '2026-12-31'],
      ['2028-03-01', '2028-02-29'],
    ])('el día anterior a %s debe ser %s', (fecha, esperado) => {
      expect(diaAnterior(fecha)).toBe(esperado);
    });
  });

  describe('estadoDeVigencia', () => {
    const hoy = '2026-10-11';

    it('debe ser VIGENTE cuando la fecha está dentro del período', () => {
      expect(estadoDeVigencia('2026-01-01', '2026-12-31', hoy)).toBe(
        EstadoVigencia.VIGENTE,
      );
    });

    it('debe ser VIGENTE cuando el período no tiene fecha de fin', () => {
      expect(estadoDeVigencia('2026-01-01', null, hoy)).toBe(
        EstadoVigencia.VIGENTE,
      );
    });

    it('debe incluir el primer y el último día del período', () => {
      expect(estadoDeVigencia(hoy, null, hoy)).toBe(EstadoVigencia.VIGENTE);
      expect(estadoDeVigencia('2026-01-01', hoy, hoy)).toBe(
        EstadoVigencia.VIGENTE,
      );
    });

    it('debe ser PROGRAMADA cuando el período aún no inicia', () => {
      expect(estadoDeVigencia('2026-10-12', null, hoy)).toBe(
        EstadoVigencia.PROGRAMADA,
      );
    });

    it('debe ser HISTORICA cuando el período ya terminó', () => {
      expect(estadoDeVigencia('2026-01-01', '2026-10-10', hoy)).toBe(
        EstadoVigencia.HISTORICA,
      );
    });
  });
});
