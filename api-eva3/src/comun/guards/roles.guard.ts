import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CLAVE_AUTENTICADO } from '../decoradores/autenticado.decorador';
import { CLAVE_PUBLICO } from '../decoradores/publico.decorador';
import { CLAVE_ROLES } from '../decoradores/roles.decorador';
import type { Rol, UsuarioSesion } from '../tipos';

/**
 * Guard global de roles. Corre despues de SesionGuard y deniega por
 * defecto (ISO/IEC 27002 5.15 y 8.3): cada ruta debe declarar quien la usa.
 *  - @Publico(): abierta, sin sesion.
 *  - @Autenticado(): cualquier perfil con sesion.
 *  - @Roles(...): solo esos roles.
 * Una ruta sin ninguna de las tres responde 403, aunque haya sesion: asi
 * una ruta nueva en la que se olvido declarar los roles no queda abierta.
 * Cada 403 queda en la auditoria (lo registra ErroresFiltro).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const destinos = [contexto.getHandler(), contexto.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, destinos) ||
      this.reflector.getAllAndOverride<boolean>(CLAVE_AUTENTICADO, destinos)
    ) {
      return true;
    }

    const rolesPermitidos = this.reflector.getAllAndOverride<Rol[] | undefined>(
      CLAVE_ROLES,
      destinos,
    );
    const { usuario } = contexto
      .switchToHttp()
      .getRequest<{ usuario?: UsuarioSesion }>();
    if (
      !rolesPermitidos ||
      rolesPermitidos.length === 0 ||
      !usuario ||
      !rolesPermitidos.includes(usuario.rol)
    ) {
      throw new ForbiddenException('No tienes permiso para esta accion');
    }
    return true;
  }
}
