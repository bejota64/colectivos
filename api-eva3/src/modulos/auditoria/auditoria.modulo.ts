import { Global, Module } from '@nestjs/common';
import { AuditoriaControlador } from './auditoria.controlador';
import { AuditoriaServicio } from './auditoria.servicio';

/** Global: la auditoria la usan modulos de todas las capas. */
@Global()
@Module({
  controllers: [AuditoriaControlador],
  providers: [AuditoriaServicio],
  exports: [AuditoriaServicio],
})
export class AuditoriaModulo {}
