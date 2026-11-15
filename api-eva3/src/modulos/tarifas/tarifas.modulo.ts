import { Module } from '@nestjs/common';
import { TrazadosModulo } from '../trazados/trazados.modulo';
import { TarifasControlador } from './tarifas.controlador';
import { TarifasRepositorio } from './tarifas.repositorio';
import { TarifasServicio } from './tarifas.servicio';

/** Capa de datos maestros: precios del trazado y su historial (CU-12). */
@Module({
  imports: [TrazadosModulo],
  controllers: [TarifasControlador],
  providers: [TarifasRepositorio, TarifasServicio],
})
export class TarifasModulo {}
