import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';

import { RegisterLegalDeductionsDto } from './register-legal-deductions.dto';

/**
 * Ejercita el DTO con la misma configuración del ValidationPipe global de
 * main.ts, para cubrir las validaciones de campos obligatorios, rangos y
 * formatos de los descuentos legales.
 */
describe('DTOs de descuentos legales', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const validar = (value: unknown) =>
    pipe.transform(value, {
      type: 'body',
      metatype: RegisterLegalDeductionsDto,
    } as ArgumentMetadata);

  /** Los errores de cada descuento llegan con el prefijo de su posición (`deductions.0.`). */
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

  const descuentosValidos = {
    validFrom: '2026-11-01',
    deductions: [
      { type: 'HEALTH_RATE', percentage: 4.5 },
      { type: 'PENSION_RATE', percentage: 5 },
    ],
  };

  const conDescuento = (descuento: Record<string, unknown>) => ({
    ...descuentosValidos,
    deductions: [descuento],
  });

  describe('RegisterLegalDeductionsDto', () => {
    it('debe aceptar una lista de descuentos válida', async () => {
      const dto = await validar(descuentosValidos);

      expect(dto).toBeInstanceOf(RegisterLegalDeductionsDto);
      expect(dto).toEqual(descuentosValidos);
    });

    it('debe exigir la fecha de vigencia y la lista de descuentos', async () => {
      const errores = await mensajes({});

      expect(errores).toEqual(
        expect.arrayContaining([
          'La fecha de inicio de vigencia es obligatoria y debe ser una fecha válida.',
          'Los descuentos deben enviarse como una lista.',
          'Debes indicar al menos un descuento para modificar.',
        ]),
      );
    });

    it('debe rechazar una lista de descuentos vacía', async () => {
      await expect(
        mensajes({ ...descuentosValidos, deductions: [] }),
      ).resolves.toContain(
        'Debes indicar al menos un descuento para modificar.',
      );
    });

    it('debe rechazar un parámetro que no es un descuento legal', async () => {
      const errores = await mensajes(
        conDescuento({ type: 'MINIMUM_WAGE', percentage: 4 }),
      );

      expect(errores).toContainEqual(
        expect.stringContaining(
          'El descuento es obligatorio y debe ser uno de los descuentos legales configurables.',
        ),
      );
    });

    it.each([
      [-0.01, 'El porcentaje no puede ser negativo.'],
      [-4, 'El porcentaje no puede ser negativo.'],
      [100.01, 'El porcentaje no puede ser mayor que 100.'],
      [
        4.555,
        'El porcentaje es obligatorio y debe ser un número con máximo dos decimales.',
      ],
      [
        'cuatro',
        'El porcentaje es obligatorio y debe ser un número con máximo dos decimales.',
      ],
    ])('debe rechazar el porcentaje %s', async (percentage, mensaje) => {
      const errores = await mensajes(
        conDescuento({ type: 'HEALTH_RATE', percentage }),
      );

      expect(errores).toContainEqual(expect.stringContaining(mensaje));
    });

    it.each([0, 100, 12.5])(
      'debe aceptar el porcentaje %s dentro del rango permitido',
      async (percentage) => {
        await expect(
          mensajes(conDescuento({ type: 'HEALTH_RATE', percentage })),
        ).resolves.toEqual([]);
      },
    );

    it('debe exigir el descuento y el porcentaje de cada elemento', async () => {
      const errores = await mensajes(conDescuento({}));

      expect(errores).toEqual(
        expect.arrayContaining([
          expect.stringContaining('El descuento es obligatorio'),
          expect.stringContaining('El porcentaje es obligatorio'),
        ]),
      );
    });

    it('debe rechazar un descuento repetido', async () => {
      await expect(
        mensajes({
          ...descuentosValidos,
          deductions: [
            { type: 'HEALTH_RATE', percentage: 4.5 },
            { type: 'HEALTH_RATE', percentage: 5 },
          ],
        }),
      ).resolves.toContain(
        'No se puede repetir un descuento en la misma solicitud.',
      );
    });

    it.each(['2026-02-30', '01/11/2026'])(
      'debe rechazar la fecha de vigencia "%s"',
      async (validFrom) => {
        const errores = await mensajes({ ...descuentosValidos, validFrom });

        expect(errores).toContainEqual(
          expect.stringContaining('La fecha de inicio de vigencia'),
        );
      },
    );

    it('debe rechazar propiedades que no pertenecen al DTO', async () => {
      const errores = await mensajes({
        ...descuentosValidos,
        validTo: '2027-12-31',
        deductions: [{ type: 'HEALTH_RATE', percentage: 4.5, id: 7 }],
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
