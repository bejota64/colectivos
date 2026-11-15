import { Module } from '@nestjs/common';
import { AutenticacionModulo } from '../autenticacion/autenticacion.modulo';
import { TrazadosModulo } from '../trazados/trazados.modulo';
import { FlotaGestionControlador } from './flota-gestion.controlador';
import { FlotaGestionServicio } from './flota-gestion.servicio';
import { FlotaControlador } from './flota.controlador';
import { FlotaRepositorio } from './flota.repositorio';

/** Capa de datos maestros: vehiculos y conductores. */
@Module({
  imports: [TrazadosModulo, AutenticacionModulo],
  controllers: [FlotaControlador, FlotaGestionControlador],
  providers: [FlotaRepositorio, FlotaGestionServicio],
  exports: [FlotaRepositorio],
})
export class FlotaModulo {}
