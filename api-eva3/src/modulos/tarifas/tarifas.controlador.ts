import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Autenticado } from '../../comun/decoradores/autenticado.decorador';
import { Roles } from '../../comun/decoradores/roles.decorador';
import { UsuarioActual } from '../../comun/decoradores/usuario-actual.decorador';
import type { UsuarioSesion } from '../../comun/tipos';
import { TarifaDto } from './dto/tarifa.dto';
import { TarifasServicio } from './tarifas.servicio';

@Controller('trazados/:trazadoId/tarifas')
export class TarifasControlador {
  constructor(private readonly tarifas: TarifasServicio) {}

  /** Precios vigentes: el pasajero los ve junto al mapa (CU-03). */
  @Autenticado()
  @Get()
  listarVigentes(@Param('trazadoId', new ParseUUIDPipe()) trazadoId: string) {
    return this.tarifas.listarVigentes(trazadoId);
  }

  @Roles('representante')
  @Get('historial')
  listarHistorial(
    @UsuarioActual() sesion: UsuarioSesion,
    @Param('trazadoId', new ParseUUIDPipe()) trazadoId: string,
    @Ip() ip: string,
  ) {
    return this.tarifas.listarHistorial(trazadoId, sesion.id, ip);
  }

  /** Crea una tarifa o cambia el precio de la que tiene ese nombre. */
  @Roles('representante')
  @Post()
  fijar(
    @UsuarioActual() sesion: UsuarioSesion,
    @Param('trazadoId', new ParseUUIDPipe()) trazadoId: string,
    @Body() datos: TarifaDto,
    @Ip() ip: string,
  ) {
    return this.tarifas.fijar(
      trazadoId,
      sesion.id,
      {
        nombre: datos.nombre,
        monto: datos.monto,
        horaInicio: datos.hora_inicio ?? null,
        horaFin: datos.hora_fin ?? null,
      },
      ip,
    );
  }

  /** Deja de cobrar una tarifa; queda en el historial. */
  @Roles('representante')
  @Post(':tarifaId/cierre')
  @HttpCode(204)
  async cerrar(
    @UsuarioActual() sesion: UsuarioSesion,
    @Param('trazadoId', new ParseUUIDPipe()) trazadoId: string,
    @Param('tarifaId', new ParseUUIDPipe()) tarifaId: string,
    @Ip() ip: string,
  ): Promise<void> {
    await this.tarifas.cerrar(trazadoId, tarifaId, sesion.id, ip);
  }
}
