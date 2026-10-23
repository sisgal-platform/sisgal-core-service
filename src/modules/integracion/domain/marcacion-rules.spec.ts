import { RegistroDuplicadoError } from './errors/marcacion.errors';
import {
  DURACION_MAXIMA_JORNADA_ABIERTA_MS,
  determinarTipoMarcacion,
} from './marcacion-rules';
import { TipoMarcacion } from './value-objects/tipo-marcacion.enum';

describe('determinarTipoMarcacion', () => {
  // 22 de octubre de 2026 en Colombia (UTC-5).
  const ochoAm = new Date('2026-10-22T13:00:00.000Z');
  const cincoPm = new Date('2026-10-22T22:00:00.000Z');

  function despuesDe(fecha: Date, milisegundos: number): Date {
    return new Date(fecha.getTime() + milisegundos);
  }

  it('la primera marcación del empleado es una entrada', () => {
    expect(determinarTipoMarcacion(null, ochoAm)).toBe(TipoMarcacion.ENTRADA);
  });

  it('una marcación después de una entrada sin salida es una salida', () => {
    expect(
      determinarTipoMarcacion({ entrada: ochoAm, salida: null }, cincoPm),
    ).toBe(TipoMarcacion.SALIDA);
  });

  it('una marcación después de una jornada cerrada abre otra jornada el mismo día', () => {
    const unaPm = new Date('2026-10-22T18:00:00.000Z');

    expect(
      determinarTipoMarcacion({ entrada: ochoAm, salida: unaPm }, cincoPm),
    ).toBe(TipoMarcacion.ENTRADA);
  });

  it('cierra los turnos que cruzan la medianoche', () => {
    const diezPm = new Date('2026-10-23T03:00:00.000Z');
    const seisAmDelDiaSiguiente = new Date('2026-10-23T11:00:00.000Z');

    expect(
      determinarTipoMarcacion(
        { entrada: diezPm, salida: null },
        seisAmDelDiaSiguiente,
      ),
    ).toBe(TipoMarcacion.SALIDA);
  });

  it('abre una jornada nueva cuando la entrada abierta superó la duración máxima (salida olvidada)', () => {
    expect(
      determinarTipoMarcacion(
        { entrada: ochoAm, salida: null },
        despuesDe(ochoAm, DURACION_MAXIMA_JORNADA_ABIERTA_MS + 60_000),
      ),
    ).toBe(TipoMarcacion.ENTRADA);
  });

  it('todavía cierra la entrada justo al cumplir la duración máxima', () => {
    expect(
      determinarTipoMarcacion(
        { entrada: ochoAm, salida: null },
        despuesDe(ochoAm, DURACION_MAXIMA_JORNADA_ABIERTA_MS),
      ),
    ).toBe(TipoMarcacion.SALIDA);
  });

  describe('marcaciones duplicadas', () => {
    it('rechaza una marcación a menos de un minuto de la entrada', () => {
      expect(() =>
        determinarTipoMarcacion(
          { entrada: ochoAm, salida: null },
          despuesDe(ochoAm, 59_000),
        ),
      ).toThrow(RegistroDuplicadoError);
    });

    it('rechaza una marcación a menos de un minuto de la salida', () => {
      expect(() =>
        determinarTipoMarcacion(
          { entrada: ochoAm, salida: cincoPm },
          despuesDe(cincoPm, 30_000),
        ),
      ).toThrow('Registro duplicado no permitido');
    });

    it('acepta una marcación cuando ya pasó un minuto', () => {
      expect(
        determinarTipoMarcacion(
          { entrada: ochoAm, salida: null },
          despuesDe(ochoAm, 60_000),
        ),
      ).toBe(TipoMarcacion.SALIDA);
    });
  });
});
