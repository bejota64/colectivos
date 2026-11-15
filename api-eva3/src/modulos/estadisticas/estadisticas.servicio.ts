import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { aCsv } from '../../comun/csv';
import { PertenenciaServicio } from '../trazados/pertenencia.servicio';
import { EstadisticasRepositorio } from './estadisticas.repositorio';
import { motivoRangoInvalido, rangoPorDefecto } from './reglas-exportacion';

/**
 * Panel del representante. Rol + pertenencia: un trazado ajeno responde
 * 404 y el intento queda en la auditoria (PertenenciaServicio).
 */
@Injectable()
export class EstadisticasServicio {
  constructor(
    private readonly estadisticas: EstadisticasRepositorio,
    private readonly pertenencia: PertenenciaServicio,
  ) {}

  private exigirPropio(trazadoId: string, representanteId: string, ip?: string) {
    return this.pertenencia.exigirTrazadoPropio(
      trazadoId,
      representanteId,
      'ver_estadisticas',
      ip,
    );
  }

  async demanda(
    trazadoId: string,
    representanteId: string,
    fecha: string | null,
    ip?: string,
  ) {
    await this.exigirPropio(trazadoId, representanteId, ip);
    return this.estadisticas.demandaDelDia(trazadoId, fecha);
  }

  async conductores(trazadoId: string, representanteId: string, ip?: string) {
    await this.exigirPropio(trazadoId, representanteId, ip);
    return this.estadisticas.resumenConductores(trazadoId);
  }

  private async rango(desde?: string, hasta?: string) {
    const porDefecto = rangoPorDefecto(await this.estadisticas.hoy());
    const rango = { desde: desde ?? porDefecto.desde, hasta: hasta ?? porDefecto.hasta };
    const motivo = motivoRangoInvalido(rango.desde, rango.hasta);
    if (motivo) {
      throw new UnprocessableEntityException(motivo);
    }
    return rango;
  }

  /** CSV de la demanda por tramo y hora (CU-10). */
  async exportarDemanda(
    trazadoId: string,
    representanteId: string,
    fechas: { desde?: string; hasta?: string },
    ip?: string,
  ): Promise<string> {
    await this.pertenencia.exigirTrazadoPropio(trazadoId, representanteId, 'exportar_demanda', ip);
    const { desde, hasta } = await this.rango(fechas.desde, fechas.hasta);
    const filas = await this.estadisticas.demandaEntre(trazadoId, desde, hasta);
    return aCsv(
      ['fecha', 'sentido', 'tramo', 'hora', 'avisos', 'personas'],
      filas.map((f) => [f.fecha, f.sentido, f.numero_tramo, f.hora, f.avisos, f.personas]),
    );
  }

  /** CSV de quejas y felicitaciones. La descripcion la escribe el pasajero: se neutralizan formulas. */
  async exportarReportes(
    trazadoId: string,
    representanteId: string,
    fechas: { desde?: string; hasta?: string },
    ip?: string,
  ): Promise<string> {
    await this.pertenencia.exigirTrazadoPropio(trazadoId, representanteId, 'exportar_reportes', ip);
    const { desde, hasta } = await this.rango(fechas.desde, fechas.hasta);
    const filas = await this.estadisticas.reportesEntre(trazadoId, desde, hasta);
    return aCsv(
      ['fecha', 'patente', 'conductor', 'tipo', 'categoria', 'estado', 'descripcion', 'respuesta'],
      filas.map((f) => [
        f.fecha,
        f.patente,
        f.conductor,
        f.tipo,
        f.categoria,
        f.estado,
        f.descripcion,
        f.respuesta,
      ]),
    );
  }
}
