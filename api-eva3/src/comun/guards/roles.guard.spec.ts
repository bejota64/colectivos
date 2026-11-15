import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Publico } from '../decoradores/publico.decorador';
import { Roles } from '../decoradores/roles.decorador';
import type { Rol } from '../tipos';
import { RolesGuard } from './roles.guard';

/**
 * Pruebas del guard de roles (Eva 4, hallazgo V-06, OWASP A01:2025):
 * una ruta que no declara quien la puede usar debe rechazarse (denegar por
 * defecto), en vez de quedar abierta a cualquier perfil con sesion.
 *
 * Las rutas abiertas a todos los perfiles se declaran a proposito con la
 * marca 'esAutenticado'.
 */
const ParaCualquierPerfil = () => SetMetadata('esAutenticado', true);

class RutasDePrueba {
  @Publico()
  publica() {}

  @Roles('representante')
  soloRepresentante() {}

  @ParaCualquierPerfil()
  cualquierPerfil() {}

  /** Alguien la agrego y olvido declarar los roles. */
  sinDeclarar() {}
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  const contexto = (metodo: keyof RutasDePrueba, rol?: Rol) =>
    ({
      getHandler: () => RutasDePrueba.prototype[metodo],
      getClass: () => RutasDePrueba,
      switchToHttp: () => ({
        getRequest: () => ({ usuario: rol ? { id: 'u-1', rol } : undefined }),
      }),
    }) as unknown as ExecutionContext;

  it('una ruta @Publico() pasa sin usuario', () => {
    expect(guard.canActivate(contexto('publica'))).toBe(true);
  });

  it('@Roles: el rol permitido pasa', () => {
    expect(guard.canActivate(contexto('soloRepresentante', 'representante'))).toBe(true);
  });

  it('@Roles: otro rol responde 403', () => {
    expect(() => guard.canActivate(contexto('soloRepresentante', 'pasajero'))).toThrow(
      ForbiddenException,
    );
  });

  it('una ruta declarada para cualquier perfil deja pasar a todos los roles', () => {
    for (const rol of ['pasajero', 'conductor', 'representante', 'administrador'] as Rol[]) {
      expect(guard.canActivate(contexto('cualquierPerfil', rol))).toBe(true);
    }
  });

  it('V-06: una ruta sin declaracion responde 403 aunque haya sesion (denegar por defecto)', () => {
    expect(() => guard.canActivate(contexto('sinDeclarar', 'administrador'))).toThrow(
      ForbiddenException,
    );
  });
});
