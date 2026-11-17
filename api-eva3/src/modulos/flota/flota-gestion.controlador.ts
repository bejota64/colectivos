import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles } from '../../comun/decoradores/roles.decorador';
import { UsuarioActual } from '../../comun/decoradores/usuario-actual.decorador';
import type { UsuarioSesion } from '../../comun/tipos';
import {
  CambioVehiculoDto,
  ContrasenaDto,
  HabilitacionDto,
  NuevoConductorDto,
  NuevoVehiculoDto,
} from './dto/flota.dto';
import { FlotaGestionServicio } from './flota-gestion.servicio';

/** Flota del trazado, solo para su representante (CU-12). */
@Roles('representante')
@Controller('trazados/:trazadoId')
export class FlotaGestionControlador {
  constructor(private readonly gestion: FlotaGestionServicio) {}

  @Get('vehiculos')
  listarVehiculos(
    @UsuarioActual() sesion: UsuarioSesion,
    @Param('trazadoId', new ParseUUIDPipe()) trazadoId: string,
    @Ip() ip: string,
  ) {
    return this.gestion.listarVehiculos(trazadoId, { representanteId: sesion.id, ip });
  }

  @Post('vehiculos')
  crearVehiculo(
    @UsuarioActual() sesion: UsuarioSesion,
    @Param('trazadoId', new ParseUUIDPipe()) trazadoId: string,
    @Body() datos: NuevoVehiculoDto,
    @Ip() ip: string,
  ) {
    return this.gestion.crearVehiculo(trazadoId, datos, { representanteId: sesion.id, ip });
  }

  /** Cambia datos del vehiculo o lo da de baja/alta (activo). */
  @Patch('vehiculos/:vehiculoId')
  actualizarVehiculo(
    @UsuarioActual() sesion: UsuarioSesion,
    @Param('trazadoId', new ParseUUIDPipe()) trazadoId: string,
    @Param('vehiculoId', new ParseUUIDPipe()) vehiculoId: string,
    @Body() cambios: CambioVehiculoDto,
    @Ip() ip: string,
  ) {
    return this.gestion.actualizarVehiculo(trazadoId, vehiculoId, cambios, {
      representanteId: sesion.id,
      ip,
    });
  }

  @Get('conductores')
  listarConductores(
    @UsuarioActual() sesion: UsuarioSesion,
    @Param('trazadoId', new ParseUUIDPipe()) trazadoId: string,
    @Ip() ip: string,
  ) {
    return this.gestion.listarConductores(trazadoId, { representanteId: sesion.id, ip });
  }

  @Post('conductores')
  crearConductor(
    @UsuarioActual() sesion: UsuarioSesion,
    @Param('trazadoId', new ParseUUIDPipe()) trazadoId: string,
    @Body() datos: NuevoConductorDto,
    @Ip() ip: string,
  ) {
    return this.gestion.crearConductor(
      trazadoId,
      {
        nombreCompleto: datos.nombre_completo,
        correo: datos.correo_electronico,
        contrasena: datos.contrasena,
      },
      { representanteId: sesion.id, ip },
    );
  }

  /** Recuperacion de contrasena del MVP: la restablece el representante. */
  @Post('conductores/:conductorId/contrasena')
  @HttpCode(204)
  async restablecerContrasena(
    @UsuarioActual() sesion: UsuarioSesion,
    @Param('trazadoId', new ParseUUIDPipe()) trazadoId: string,
    @Param('conductorId', new ParseUUIDPipe()) conductorId: string,
    @Body() datos: ContrasenaDto,
    @Ip() ip: string,
  ): Promise<void> {
    await this.gestion.restablecerContrasena(trazadoId, conductorId, datos.contrasena, {
      representanteId: sesion.id,
      ip,
    });
  }

  @Patch('conductores/:conductorId')
  @HttpCode(204)
  async cambiarHabilitado(
    @UsuarioActual() sesion: UsuarioSesion,
    @Param('trazadoId', new ParseUUIDPipe()) trazadoId: string,
    @Param('conductorId', new ParseUUIDPipe()) conductorId: string,
    @Body() datos: HabilitacionDto,
    @Ip() ip: string,
  ): Promise<void> {
    await this.gestion.cambiarHabilitado(trazadoId, conductorId, datos.habilitado, {
      representanteId: sesion.id,
      ip,
    });
  }
}
