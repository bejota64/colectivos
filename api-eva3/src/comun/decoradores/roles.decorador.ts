import { SetMetadata } from '@nestjs/common';
import type { Rol } from '../tipos';

export const CLAVE_ROLES = 'roles';

/** Limita una ruta a los roles indicados. Una ruta sin declaracion se rechaza (ver RolesGuard). */
export const Roles = (...roles: Rol[]) => SetMetadata(CLAVE_ROLES, roles);
