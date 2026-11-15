import { Module } from '@nestjs/common';
import { TrazadosModulo } from '../trazados/trazados.modulo';
import { ReportesGestionServicio } from './reportes-gestion.servicio';
import {
  ReportesGestionControlador,
  ValoracionesControlador,
} from './valoraciones.controlador';
import { ValoracionesRepositorio } from './valoraciones.repositorio';
import { ValoracionesServicio } from './valoraciones.servicio';

/** Capa de operacion: calificaciones y reportes. Lee abordajes dentro de su propio SQL. */
@Module({
  imports: [TrazadosModulo],
  controllers: [ValoracionesControlador, ReportesGestionControlador],
  providers: [ValoracionesRepositorio, ValoracionesServicio, ReportesGestionServicio],
})
export class ValoracionesModulo {}
