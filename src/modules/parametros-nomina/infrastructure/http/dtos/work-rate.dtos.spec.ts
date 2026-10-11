import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';

import { RegisterWorkRatesDto } from './register-work-rates.dto';

/**
 * Ejercita el DTO con la misma configuración del ValidationPipe global de
 * main.ts, para cubrir las validaciones de campos obligatorios, rangos y
 * formatos de los recargos laborales.
 */
describe('DTOs de recargos laborales', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const validar = (value: unknown) =>
    pipe.transform(value, {
      type: 'body',
      metatype: RegisterWorkRatesDto,
    } as ArgumentMetadata);

  /** Los errores de cada recargo llegan con el prefijo de su posición (`rates.0.`). */
  const mensajes = async (value: unknown): Promise<string[]> => {
    try {
      await validar(value);
      return [];
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const respuesta = (error as BadRequestException).getResponse() as {
        message: string[];
      };
      return respuesta.message;
    }
  };

  const recargosValidos = {
    validFrom: '2026-11-01',
    rates: [
      { type: 'EXTRA_DIURNA', multiplier: 1.3 },
      { type: 'DOMINICAL_NOCTURNA', multiplier: 2.15 },
    ],
  };

  const conRecargo = (recargo: Record<string, unknown>) => ({
    ...recargosValidos,
    rates: [recargo],
  });

  describe('RegisterWorkRatesDto', () => {
    it('debe aceptar una lista de recargos válida', async () => {
      const dto = await validar(recargosValidos);

      expect(dto).toBeInstanceOf(RegisterWorkRatesDto);
      expect(dto).toEqual(recargosValidos);
    });

    it('debe exigir la fecha de vigencia y la lista de recargos', async () => {
      const errores = await mensajes({});

      expect(errores).toEqual(
        expect.arrayContaining([
          'La fecha de inicio de vigencia es obligatoria y debe ser una fecha válida.',
          'Los recargos deben enviarse como una lista.',
          'Debes indicar al menos un recargo para modificar.',
        ]),
      );
    });

    it('debe rechazar una lista de recargos vacía', async () => {
      await expect(
        mensajes({ ...recargosValidos, rates: [] }),
      ).resolves.toContain('Debes indicar al menos un recargo para modificar.');
    });

    it('debe rechazar un tipo de hora que no existe', async () => {
      const errores = await mensajes(
        conRecargo({ type: 'HORA_INVENTADA', multiplier: 1.3 }),
      );

      expect(errores).toContainEqual(
        expect.stringContaining(
          'El tipo de hora es obligatorio y debe ser uno de los tipos de hora configurables.',
        ),
      );
    });

    it.each([
      [
        0.99,
        'El multiplicador no puede ser menor que 1: el recargo no puede ser negativo.',
      ],
      [
        -1,
        'El multiplicador no puede ser menor que 1: el recargo no puede ser negativo.',
      ],
      [5.01, 'El multiplicador no puede ser mayor que 5.'],
      [
        1.255,
        'El multiplicador es obligatorio y debe ser un número con máximo dos decimales.',
      ],
      [
        'uno',
        'El multiplicador es obligatorio y debe ser un número con máximo dos decimales.',
      ],
    ])('debe rechazar el multiplicador %s', async (multiplier, mensaje) => {
      const errores = await mensajes(
        conRecargo({ type: 'EXTRA_DIURNA', multiplier }),
      );

      expect(errores).toContainEqual(expect.stringContaining(mensaje));
    });

    it.each([1, 5, 2.5])(
      'debe aceptar el multiplicador %s dentro del rango permitido',
      async (multiplier) => {
        await expect(
          mensajes(conRecargo({ type: 'EXTRA_DIURNA', multiplier })),
        ).resolves.toEqual([]);
      },
    );

    it('debe exigir el tipo de hora y el multiplicador de cada recargo', async () => {
      const errores = await mensajes(conRecargo({}));

      expect(errores).toEqual(
        expect.arrayContaining([
          expect.stringContaining('El tipo de hora es obligatorio'),
          expect.stringContaining('El multiplicador es obligatorio'),
        ]),
      );
    });

    it('debe rechazar un tipo de hora repetido', async () => {
      await expect(
        mensajes({
          ...recargosValidos,
          rates: [
            { type: 'EXTRA_DIURNA', multiplier: 1.3 },
            { type: 'EXTRA_DIURNA', multiplier: 1.4 },
          ],
        }),
      ).resolves.toContain(
        'No se puede repetir un tipo de hora en la misma solicitud.',
      );
    });

    it.each(['2026-02-30', '01/11/2026'])(
      'debe rechazar la fecha de vigencia "%s"',
      async (validFrom) => {
        const errores = await mensajes({ ...recargosValidos, validFrom });

        expect(errores.length).toBeGreaterThan(0);
        expect(errores).toContainEqual(
          expect.stringContaining('La fecha de inicio de vigencia'),
        );
      },
    );

    it('debe rechazar propiedades que no pertenecen al DTO', async () => {
      const errores = await mensajes({
        ...recargosValidos,
        validTo: '2027-12-31',
        rates: [{ type: 'EXTRA_DIURNA', multiplier: 1.3, id: 7 }],
      });

      expect(errores).toEqual(
        expect.arrayContaining([
          'property validTo should not exist',
          expect.stringContaining('property id should not exist'),
        ]),
      );
    });
  });
});
