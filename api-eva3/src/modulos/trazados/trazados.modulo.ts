import { Module } from '@nestjs/common';
import { PertenenciaServicio } from './pertenencia.servicio';
import { RutasServicio } from './rutas.servicio';
import { TrazadosControlador } from './trazados.controlador';
import { TrazadosRepositorio } from './trazados.repositorio';

/** Capa de datos maestros. No depende de ningun modulo de operacion. */
@Module({
  controllers: [TrazadosControlador],
  providers: [TrazadosRepositorio, RutasServicio, PertenenciaServicio],
  exports: [TrazadosRepositorio, RutasServicio, PertenenciaServicio],
})
export class TrazadosModulo {}
