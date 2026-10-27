import { BadRequestException, ValidationPipe } from '@nestjs/common';

import { LecturaSimuladaDto } from './lectura-simulada.dto';

/** Ejercita el DTO con la misma configuración del ValidationPipe global de main.ts. */
describe('LecturaSimuladaDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const idempotencyKey = '3f1c2a5e-8b7d-4c1e-9a6f-2d4b8e9c7a10';

  const validar = (value: unknown) =>
    pipe.transform(value, { type: 'body', metatype: LecturaSimuladaDto });

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

  it('acepta una lectura exitosa y limpia los espacios de la huella', async () => {
    const dto = await validar({
      capturaExitosa: true,
      huella: ' 1020304050 ',
      idempotencyKey,
    });

    expect(dto).toEqual({
      capturaExitosa: true,
      huella: '1020304050',
      idempotencyKey,
    });
  });

  it('exige la huella cuando la captura fue exitosa', async () => {
    expect(await mensajes({ capturaExitosa: true, idempotencyKey })).toContain(
      'La huella es obligatoria',
    );
  });

  it('acepta una lectura fallida sin huella', async () => {
    expect(await mensajes({ capturaExitosa: false, idempotencyKey })).toEqual(
      [],
    );
  });

  it('exige el resultado de la captura', async () => {
    expect(await mensajes({ huella: '1020304050', idempotencyKey })).toContain(
      'El resultado de la captura debe ser verdadero o falso',
    );
  });

  it('exige una clave de idempotencia con formato UUID', async () => {
    expect(
      await mensajes({
        capturaExitosa: true,
        huella: '1020304050',
        idempotencyKey: 'lectura-1',
      }),
    ).toContain('La clave de idempotencia debe ser un UUID');
  });

  it('rechaza campos que no hacen parte de la lectura, como la hora del dispositivo', async () => {
    expect(
      await mensajes({
        capturaExitosa: true,
        huella: '1020304050',
        idempotencyKey,
        fechaHora: '2026-10-22T07:58:00-05:00',
      }),
    ).toContain('property fechaHora should not exist');
  });
});
