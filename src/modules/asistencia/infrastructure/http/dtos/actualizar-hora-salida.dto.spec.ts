import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ActualizarHoraSalidaDto } from './actualizar-hora-salida.dto';

describe('ActualizarHoraSalidaDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const validar = (value: unknown) =>
    pipe.transform(value, {
      type: 'body',
      metatype: ActualizarHoraSalidaDto,
    });

  it('debe aceptar empleado y hora local válida', async () => {
    await expect(
      validar({ empleadoId: '7', horaSalida: '18:30' }),
    ).resolves.toEqual({ empleadoId: 7, horaSalida: '18:30' });
  });

  it.each(['8:30', '24:00', '12:60', '12:30:00', 'texto'])(
    'debe rechazar la hora local inválida %s',
    async (horaSalida) => {
      await expect(
        validar({ empleadoId: 7, horaSalida }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('debe rechazar un empleado no entero o menor que uno', async () => {
    await expect(
      validar({ empleadoId: '1.5', horaSalida: '18:30' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validar({ empleadoId: '0', horaSalida: '18:30' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('debe rechazar propiedades no permitidas', async () => {
    await expect(
      validar({ empleadoId: 7, horaSalida: '18:30', checkIn: '2026-09-15' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
