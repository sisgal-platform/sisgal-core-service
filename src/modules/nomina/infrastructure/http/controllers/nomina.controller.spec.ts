import { NominaController } from './nomina.controller';

import { Role } from 'src/application/ports/auth/auth-user';
import { ROLES_KEY } from 'src/infraestructure/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/infraestructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/infraestructure/auth/guards/roles.guard';

/** Clave con la que `@UseGuards` registra los guards en la metadata de Nest. */
const GUARDS_METADATA = '__guards__';

describe('NominaController', () => {
  describe('control de acceso', () => {
    it('debe exigir autenticación y verificación de rol', () => {
      expect(Reflect.getMetadata(GUARDS_METADATA, NominaController)).toEqual([
        JwtAuthGuard,
        RolesGuard,
      ]);
    });

    it('debe permitir el acceso únicamente a administradores', () => {
      expect(Reflect.getMetadata(ROLES_KEY, NominaController)).toEqual([
        Role.ADMINISTRADOR,
      ]);
    });
  });
});
