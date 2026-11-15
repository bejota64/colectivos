import { SetMetadata } from '@nestjs/common';

export const CLAVE_AUTENTICADO = 'esAutenticado';

/**
 * Declara a proposito que una ruta es para CUALQUIER perfil con sesion
 * (por ejemplo, el perfil propio). Sin @Publico, @Roles ni este decorador,
 * RolesGuard rechaza la ruta: se deniega por defecto (OWASP A01:2025).
 */
export const Autenticado = () => SetMetadata(CLAVE_AUTENTICADO, true);
