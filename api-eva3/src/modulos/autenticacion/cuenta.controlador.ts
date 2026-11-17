import { Body, Controller, Delete, HttpCode, Ip } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../comun/decoradores/roles.decorador';
import { UsuarioActual } from '../../comun/decoradores/usuario-actual.decorador';
import type { UsuarioSesion } from '../../comun/tipos';
import { LIMITE_CREDENCIALES } from './autenticacion.controlador';
import { CuentaServicio } from './cuenta.servicio';
import { EliminarCuentaDto } from './dto/eliminar-cuenta.dto';

@Controller('usuarios/yo')
export class CuentaControlador {
  constructor(private readonly cuenta: CuentaServicio) {}

  /** Pide la contrasena, con el mismo limite por IP que el inicio de sesion. */
  @Roles('pasajero')
  @Throttle(LIMITE_CREDENCIALES)
  @Delete()
  @HttpCode(204)
  async eliminar(
    @UsuarioActual() sesion: UsuarioSesion,
    @Body() datos: EliminarCuentaDto,
    @Ip() ip: string,
  ): Promise<void> {
    await this.cuenta.eliminarPropia(sesion.id, datos.contrasena, ip);
  }
}
