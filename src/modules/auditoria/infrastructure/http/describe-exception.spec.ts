import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { describeException } from './describe-exception';

describe('describeException', () => {
  it('debe tomar el estado y el mensaje de una excepción de negocio', () => {
    const result = describeException(
      new NotFoundException('No se encontró el empleado 99.'),
    );

    expect(result).toEqual({
      httpStatus: 404,
      message: 'No se encontró el empleado 99.',
      stackTrace: null,
    });
  });

  it('debe unir los mensajes cuando falla la validación de varios campos', () => {
    const result = describeException(
      new BadRequestException({
        message: ['phone debe ser texto', 'salary_base debe ser positivo'],
        error: 'Bad Request',
      }),
    );

    expect(result.httpStatus).toBe(400);
    expect(result.message).toBe(
      'phone debe ser texto; salary_base debe ser positivo',
    );
  });

  it.each([
    ['401', new UnauthorizedException('Sin token.'), 401],
    ['403', new ForbiddenException('Sin permiso.'), 403],
  ])('debe describir un acceso rechazado %s', (_nombre, exception, status) => {
    expect(describeException(exception).httpStatus).toBe(status);
  });

  it('debe usar el mensaje de la excepción cuando la respuesta no trae uno', () => {
    const result = describeException(new HttpException({ otro: 'x' }, 418));

    expect(result.httpStatus).toBe(418);
    expect(result.message).toBe('Http Exception');
  });

  it('debe guardar la traza solo en los errores internos', () => {
    expect(
      describeException(new InternalServerErrorException('falló')).stackTrace,
    ).toContain('InternalServerErrorException');
    expect(
      describeException(new BadRequestException('x')).stackTrace,
    ).toBeNull();
  });

  it('debe tratar un error que no es HttpException como un 500 con su traza', () => {
    const result = describeException(new Error('violación de llave única'));

    expect(result.httpStatus).toBe(500);
    expect(result.message).toBe('violación de llave única');
    expect(result.stackTrace).toContain('Error: violación de llave única');
  });

  it('debe describir un valor lanzado que no es un Error', () => {
    expect(describeException('texto')).toEqual({
      httpStatus: 500,
      message: 'Error desconocido.',
      stackTrace: null,
    });
  });
});
