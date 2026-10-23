import { Test, TestingModule } from '@nestjs/testing';

import { LectorSimuladoController } from './lector-simulado.controller';
import { RegistrarMarcacionService } from '../../../application/services/registrar-marcacion.service';

import { Role } from 'src/application/ports/auth/auth-user';
import { ROLES_KEY } from 'src/infraestructure/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/infraestructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/infraestructure/auth/guards/roles.guard';

describe('LectorSimuladoController', () => {
  let controller: LectorSimuladoController;

  const registrarMarcacionServiceMock = {
    registrarMarcacionBiometrica: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LectorSimuladoController],
      providers: [
        {
          provide: RegistrarMarcacionService,
          useValue: registrarMarcacionServiceMock,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<LectorSimuladoController>(LectorSimuladoController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('exige autenticación y el rol de administrador', () => {
    expect(Reflect.getMetadata('__guards__', LectorSimuladoController)).toEqual(
      [JwtAuthGuard, RolesGuard],
    );
    expect(Reflect.getMetadata(ROLES_KEY, LectorSimuladoController)).toEqual([
      Role.ADMINISTRADOR,
    ]);
  });

  it('entrega la lectura y su clave de idempotencia al servicio de registro', async () => {
    const respuesta = { id: 10 };
    registrarMarcacionServiceMock.registrarMarcacionBiometrica.mockResolvedValue(
      respuesta,
    );

    await expect(
      controller.registrar({
        capturaExitosa: true,
        huella: '1020304050',
        idempotencyKey: '3f1c2a5e-8b7d-4c1e-9a6f-2d4b8e9c7a10',
      }),
    ).resolves.toBe(respuesta);

    expect(
      registrarMarcacionServiceMock.registrarMarcacionBiometrica,
    ).toHaveBeenCalledWith(
      { capturaExitosa: true, huella: '1020304050' },
      '3f1c2a5e-8b7d-4c1e-9a6f-2d4b8e9c7a10',
    );
  });
});
