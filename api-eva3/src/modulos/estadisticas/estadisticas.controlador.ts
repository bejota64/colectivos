import {
  Controller,
  Get,
  Header,
  Ip,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { Roles } from '../../comun/decoradores/roles.decorador';
import { UsuarioActual } from '../../comun/decoradores/usuario-actual.decorador';
import type { UsuarioSesion } from '../../comun/tipos';
import { DemandaConsultaDto } from './dto/demanda-consulta.dto';
import { RangoFechasDto } from './dto/rango-fechas.dto';
import { EstadisticasServicio } from './estadisticas.servicio';

@Roles('representante')
@Controller('estadisticas/trazados/:trazadoId')
export class EstadisticasControlador {
  constructor(private readonly estadisticas: EstadisticasServicio) {}

  /** Demanda por tramo de 500 m y por hora. */
  @Get('demanda')
  demanda(
    @UsuarioActual() sesion: UsuarioSesion,
    @Param('trazadoId', new ParseUUIDPipe()) trazadoId: string,
    @Query() consulta: DemandaConsultaDto,
    @Ip() ip: string,
  ) {
    return this.estadisticas.demanda(
      trazadoId,
      sesion.id,
      consulta.fecha ?? null,
      ip,
    );
  }

  /** Viajes, nota y reportes por conductor, sin datos de los pasajeros. */
  @Get('conductores')
  conductores(
    @UsuarioActual() sesion: UsuarioSesion,
    @Param('trazadoId', new ParseUUIDPipe()) trazadoId: string,
    @Ip() ip: string,
  ) {
    return this.estadisticas.conductores(trazadoId, sesion.id, ip);
  }

  /** Exportacion de la demanda a CSV (CU-10). */
  @Get('demanda/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="demanda.csv"')
  exportarDemanda(
    @UsuarioActual() sesion: UsuarioSesion,
    @Param('trazadoId', new ParseUUIDPipe()) trazadoId: string,
    @Query() fechas: RangoFechasDto,
    @Ip() ip: string,
  ) {
    return this.estadisticas.exportarDemanda(trazadoId, sesion.id, fechas, ip);
  }

  /** Exportacion de quejas y felicitaciones a CSV (CU-10). */
  @Get('reportes/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="reportes.csv"')
  exportarReportes(
    @UsuarioActual() sesion: UsuarioSesion,
    @Param('trazadoId', new ParseUUIDPipe()) trazadoId: string,
    @Query() fechas: RangoFechasDto,
    @Ip() ip: string,
  ) {
    return this.estadisticas.exportarReportes(trazadoId, sesion.id, fechas, ip);
  }
}
