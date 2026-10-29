import {
  MAX_METADATA_VALUE,
  REDACTED,
  isSensitiveKey,
  redactSensitive,
  toAuditText,
  toBoundedSnapshot,
  truncate,
} from './audit-sanitizer';

describe('audit-sanitizer', () => {
  describe('isSensitiveKey', () => {
    it.each([
      'password',
      'Password',
      'contraseña',
      'accessToken',
      'authorization',
      'Cookie',
      'api-key',
      'apiKey',
      'secret',
      'huella',
      'fingerprint',
      'credentials',
    ])('debe considerar sensible el campo "%s"', (key) => {
      expect(isSensitiveKey(key)).toBe(true);
    });

    it.each(['firstName', 'salary_base', 'document', 'email', 'status'])(
      'no debe considerar sensible el campo "%s"',
      (key) => {
        expect(isSensitiveKey(key)).toBe(false);
      },
    );
  });

  describe('redactSensitive', () => {
    it('debe reemplazar los campos sensibles y conservar el resto', () => {
      const result = redactSensitive({
        firstName: 'Ana',
        password: 'super-secreta',
        huella: '1020304050',
      });

      expect(result).toEqual({
        firstName: 'Ana',
        password: REDACTED,
        huella: REDACTED,
      });
    });

    it('debe redactar campos anidados y los que están dentro de arreglos', () => {
      const result = redactSensitive({
        usuario: { nombre: 'Ana', token: 'abc' },
        lecturas: [{ huella: 'x' }, { huella: 'y', hora: '08:00' }],
      });

      expect(result).toEqual({
        usuario: { nombre: 'Ana', token: REDACTED },
        lecturas: [{ huella: REDACTED }, { huella: REDACTED, hora: '08:00' }],
      });
    });

    it('debe convertir las fechas a texto ISO y descartar funciones', () => {
      const result = redactSensitive({
        fecha: new Date('2026-09-30T12:00:00.000Z'),
        fechaInvalida: new Date('no es una fecha'),
        callback: () => 1,
      });

      expect(result).toEqual({
        fecha: '2026-09-30T12:00:00.000Z',
        fechaInvalida: null,
        callback: null,
      });
    });

    it('debe convertir bigint a texto y los nulos a null', () => {
      expect(redactSensitive({ a: BigInt(10), b: undefined, c: null })).toEqual(
        {
          a: '10',
          b: null,
          c: null,
        },
      );
    });

    it('no debe fallar con una estructura circular: acota la profundidad', () => {
      const circular: Record<string, unknown> = { nombre: 'ciclo' };
      circular.self = circular;

      expect(() => redactSensitive(circular)).not.toThrow();
      expect(JSON.stringify(redactSensitive(circular))).toContain(
        '[profundidad máxima]',
      );
    });

    it('debe limitar la cantidad de elementos de un arreglo', () => {
      const result = redactSensitive(
        Array.from({ length: 500 }, (_, index) => index),
      ) as unknown[];

      expect(result).toHaveLength(201);
      expect(result.at(-1)).toBe('[300 elementos más]');
    });

    it('debe recortar los textos demasiado largos', () => {
      const result = redactSensitive(
        'a'.repeat(MAX_METADATA_VALUE + 50),
      ) as string;

      expect(result.length).toBeLessThan(MAX_METADATA_VALUE + 50);
      expect(result.endsWith('[recortado]')).toBe(true);
    });
  });

  describe('toAuditText', () => {
    it('debe conservar los nulos como nulos', () => {
      expect(toAuditText(null)).toBeNull();
      expect(toAuditText(undefined)).toBeNull();
    });

    it('debe devolver los textos tal cual y serializar el resto', () => {
      expect(toAuditText('hola')).toBe('hola');
      expect(toAuditText(1200000)).toBe('1200000');
      expect(toAuditText({ a: 1 })).toBe('{"a":1}');
    });

    it('debe redactar los campos sensibles de un objeto', () => {
      expect(toAuditText({ password: 'x' })).toBe(`{"password":"${REDACTED}"}`);
    });
  });

  describe('toBoundedSnapshot', () => {
    it('debe devolver null sin marcar omisión cuando no hay estado', () => {
      expect(toBoundedSnapshot(undefined)).toEqual({
        snapshot: null,
        omitted: false,
      });
    });

    it('debe devolver el estado ya redactado', () => {
      expect(toBoundedSnapshot({ id: 1, token: 'abc' })).toEqual({
        snapshot: { id: 1, token: REDACTED },
        omitted: false,
      });
    });

    it('debe omitir el estado cuando supera el tamaño máximo', () => {
      expect(toBoundedSnapshot({ dato: 'x'.repeat(200) }, 100)).toEqual({
        snapshot: null,
        omitted: true,
      });
    });
  });

  describe('truncate', () => {
    it('no debe tocar un texto que cabe', () => {
      expect(truncate('corto', 10)).toBe('corto');
    });

    it('debe marcar que se recortó', () => {
      expect(truncate('0123456789', 4)).toBe('0123…[recortado]');
    });
  });
});
