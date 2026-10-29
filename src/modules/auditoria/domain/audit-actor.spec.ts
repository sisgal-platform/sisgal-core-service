import { resolveAuditActor } from './audit-actor';
import { ANONYMOUS_AUDIT_ACTOR } from './audit-record';

const USER_ID = '3F0C9F2E-6A43-4D5B-9C1E-2B7A8D4E5F60';

describe('resolveAuditActor', () => {
  it('debe describir al usuario autenticado, con el id en minúsculas', () => {
    expect(
      resolveAuditActor({
        id: USER_ID,
        email: 'admin@sisgal.com',
        role: 'ADMINISTRADOR',
      }),
    ).toEqual({
      id: USER_ID.toLowerCase(),
      username: 'admin@sisgal.com',
      email: 'admin@sisgal.com',
      role: 'ADMINISTRADOR',
    });
  });

  it('debe usar el id como nombre cuando el usuario no tiene correo', () => {
    const actor = resolveAuditActor({ id: USER_ID, role: 'ADMINISTRADOR' });

    expect(actor.email).toBe('');
    expect(actor.username).toBe(USER_ID);
  });

  it('debe asignar un rol por defecto cuando no llega', () => {
    expect(resolveAuditActor({ id: USER_ID }).role).toBe('SIN_ROL');
  });

  it.each([
    ['sin usuario', undefined],
    ['usuario nulo', null],
    ['id que no es UUID', { id: '12', role: 'ADMINISTRADOR' }],
    ['id con texto malicioso', { id: "x'; DROP TABLE y;--" }],
  ])('debe atribuir al usuario anónimo: %s', (_caso, user) => {
    expect(resolveAuditActor(user)).toBe(ANONYMOUS_AUDIT_ACTOR);
  });
});
