import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';

import { RegisterWorkdayConfigDto } from './register-workday-config.dto';
import { VigenciaQueryDto } from './vigencia-query.dto';

/**
 * Ejercita los DTOs con la misma configuración del ValidationPipe global de
 * main.ts, para cubrir las validaciones de campos obligatorios, rangos y
 * formatos de la jornada laboral.
 */
describe('DTOs de jornada laboral', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const validar = (
    metatype: ArgumentMetadata['metatype'],
    value: unknown,
    type: ArgumentMetadata['type'] = 'body',
  ) => pipe.transform(value, { type, metatype });

  const mensajes = async (
    metatype: ArgumentMetadata['metatype'],
    value: unknown,
    type: ArgumentMetadata['type'] = 'body',
  ): Promise<string[]> => {
    try {
      await validar(metatype, value, type);
      return [];
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const respuesta = (error as BadRequestException).getResponse() as {
        message: string[];
      };
      return respuesta.message;
    }
  };

  const jornadaValida = {
    maxWeekHours: 42,
    maxDayHours: 8,
    dayStart: '06:00',
    dayEnd: '19:00',
    nightStart: '19:00',
    nightEnd: '06:00',
    validFrom: '2026-11-01',
  };

  // =========================================================
  // RegisterWorkdayConfigDto
  // =========================================================

  describe('RegisterWorkdayConfigDto', () => {
    it('debe aceptar una jornada laboral válida', async () => {
      const dto = await validar(RegisterWorkdayConfigDto, jornadaValida);

      expect(dto).toBeInstanceOf(RegisterWorkdayConfigDto);
      expect(dto).toEqual(jornadaValida);
    });

    it('debe exigir todos los campos', async () => {
      const errores = await mensajes(RegisterWorkdayConfigDto, {});

      expect(errores).toEqual(
        expect.arrayContaining([
          'La jornada máxima semanal es obligatoria y debe ser un número entero de horas.',
          'La jornada máxima diaria es obligatoria y debe ser un número entero de horas.',
          'El inicio de la jornada diurna es obligatorio y debe tener formato HH:mm.',
          'El fin de la jornada diurna es obligatorio y debe tener formato HH:mm.',
          'El inicio de la jornada nocturna es obligatorio y debe tener formato HH:mm.',
          'El fin de la jornada nocturna es obligatorio y debe tener formato HH:mm.',
          'La fecha de inicio de vigencia es obligatoria y debe ser una fecha válida.',
        ]),
      );
    });

    it.each([
      [0, 'La jornada máxima semanal debe ser de al menos 1 hora.'],
      [-5, 'La jornada máxima semanal debe ser de al menos 1 hora.'],
      [169, 'La jornada máxima semanal no puede superar las 168 horas.'],
      [
        42.5,
        'La jornada máxima semanal es obligatoria y debe ser un número entero de horas.',
      ],
    ])(
      'debe rechazar una jornada semanal de %s horas',
      async (maxWeekHours, mensaje) => {
        await expect(
          mensajes(RegisterWorkdayConfigDto, {
            ...jornadaValida,
            maxWeekHours,
          }),
        ).resolves.toContain(mensaje);
      },
    );

    it.each([
      [0, 'La jornada máxima diaria debe ser de al menos 1 hora.'],
      [25, 'La jornada máxima diaria no puede superar las 24 horas.'],
      [
        7.5,
        'La jornada máxima diaria es obligatoria y debe ser un número entero de horas.',
      ],
    ])(
      'debe rechazar una jornada diaria de %s horas',
      async (maxDayHours, mensaje) => {
        await expect(
          mensajes(RegisterWorkdayConfigDto, {
            ...jornadaValida,
            maxDayHours,
          }),
        ).resolves.toContain(mensaje);
      },
    );

    it.each(['6:00', '24:00', '06:60', '06:00:00', 'mediodía'])(
      'debe rechazar la hora "%s" por no tener formato HH:mm',
      async (hora) => {
        await expect(
          mensajes(RegisterWorkdayConfigDto, {
            ...jornadaValida,
            dayStart: hora,
          }),
        ).resolves.toContain(
          'El inicio de la jornada diurna es obligatorio y debe tener formato HH:mm.',
        );
      },
    );

    it('debe rechazar una fecha de vigencia que no existe en el calendario', async () => {
      await expect(
        mensajes(RegisterWorkdayConfigDto, {
          ...jornadaValida,
          validFrom: '2026-02-30',
        }),
      ).resolves.toContain(
        'La fecha de inicio de vigencia es obligatoria y debe ser una fecha válida.',
      );
    });

    it.each(['01/11/2026', '2026-11-01T00:00:00.000Z'])(
      'debe rechazar la fecha de vigencia "%s" por no tener formato YYYY-MM-DD',
      async (validFrom) => {
        await expect(
          mensajes(RegisterWorkdayConfigDto, {
            ...jornadaValida,
            validFrom,
          }),
        ).resolves.toContain(
          'La fecha de inicio de vigencia debe tener formato YYYY-MM-DD.',
        );
      },
    );

    it('debe rechazar propiedades que no pertenecen al DTO', async () => {
      const errores = await mensajes(RegisterWorkdayConfigDto, {
        ...jornadaValida,
        validTo: '2027-12-31',
      });

      expect(errores).toContain('property validTo should not exist');
    });
  });

  // =========================================================
  // VigenciaQueryDto
  // =========================================================

  describe('VigenciaQueryDto', () => {
    it('debe aceptar la consulta sin fecha', async () => {
      await expect(mensajes(VigenciaQueryDto, {}, 'query')).resolves.toEqual(
        [],
      );
    });

    it('debe aceptar una fecha con formato YYYY-MM-DD', async () => {
      const dto = await validar(
        VigenciaQueryDto,
        { fecha: '2026-03-15' },
        'query',
      );

      expect(dto).toEqual({ fecha: '2026-03-15' });
    });

    it('debe rechazar una fecha inválida', async () => {
      await expect(
        mensajes(VigenciaQueryDto, { fecha: '2026-13-01' }, 'query'),
      ).resolves.toContain('La fecha debe ser una fecha válida.');
    });
  });
});
