import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../../comun/decoradores/roles.decorador';
import { UsuarioActual } from '../../comun/decoradores/usuario-actual.decorador';
import type { UsuarioSesion } from '../../comun/tipos';
import { CalificacionDto } from './dto/calificacion.dto';
import { GestionReporteDto, ReporteDto, ReportesConsultaDto } from './dto/reporte.dto';
import { ReportesGestionServicio } from './reportes-gestion.servicio';
import { ValoracionesServicio } from './valoraciones.servicio';

/** El pasajero valora SU viaje (CU-06). */
@Roles('pasajero')
@Controller('abordajes')
export class ValoracionesControlador {
  constructor(private readonly valoraciones: ValoracionesServicio) {}

  /** ParseUUIDPipe: un id que no es uuid responde 400 antes de llegar a la base. */
  @Post(':abordajeId/calificacion')
  calificar(
    @UsuarioActual() sesion: UsuarioSesion,
    @Param('abordajeId', new ParseUUIDPipe()) abordajeId: string,
    @Body() datos: CalificacionDto,
  ) {
    return this.valoraciones.calificar(sesion.id, abordajeId, datos.estrellas);
  }

  /** Queja o felicitacion sobre el viaje. */
  @Post(':abordajeId/reporte')
  reportar(
    @UsuarioActual() sesion: UsuarioSesion,
    @Param('abordajeId', new ParseUUIDPipe()) abordajeId: string,
    @Body() datos: ReporteDto,
  ) {
    return this.valoraciones.reportar(sesion.id, abordajeId, datos);
  }
}

/** El representante revisa y responde los reportes de SU trazado (CU-11). */
@Roles('representante')
@Controller('trazados/:trazadoId/reportes')
export class ReportesGestionControlador {
  constructor(private readonly gestion: ReportesGestionServicio) {}

  @Get()
  listar(
    @UsuarioActual() sesion: UsuarioSesion,
    @Param('trazadoId', new ParseUUIDPipe()) trazadoId: string,
    @Query() consulta: ReportesConsultaDto,
    @Ip() ip: string,
  ) {
    return this.gestion.listar(trazadoId, sesion.id, consulta.estado ?? null, ip);
  }

  @Patch(':reporteId')
  gestionar(
    @UsuarioActual() sesion: UsuarioSesion,
    @Param('trazadoId', new ParseUUIDPipe()) trazadoId: string,
    @Param('reporteId', new ParseUUIDPipe()) reporteId: string,
    @Body() cambio: GestionReporteDto,
    @Ip() ip: string,
  ) {
    return this.gestion.gestionar(trazadoId, reporteId, sesion.id, cambio, ip);
  }
}
