import { Injectable } from '@nestjs/common';
import { numeroTramo } from '../../comun/geo';
import { PertenenciaServicio } from '../trazados/pertenencia.servicio';
import { TrazadosRepositorio } from '../trazados/trazados.repositorio';
import { AvisosRepositorio } from './avisos.repositorio';

/**
 * Avisos de espera activos del trazado, para su representante (matriz de
 * permisos: "punto y cantidad de personas", su trazado). Sin identidad ni
 * coordenadas del pasajero: solo sentido, tramo y cuantas personas.
 */
@Injectable()
export class AvisosRepresentanteServicio {
  constructor(
    private readonly avisos: AvisosRepositorio,
    private readonly trazados: TrazadosRepositorio,
    private readonly pertenencia: PertenenciaServicio,
  ) {}

  async listar(trazadoId: string, representanteId: string, ip?: string, ahora: Date = new Date()) {
    await this.pertenencia.exigirTrazadoPropio(trazadoId, representanteId, 'ver_avisos', ip);
    const sentidos = await this.trazados.listarSentidos(trazadoId);
    const nombre = new Map(sentidos.map((s) => [s.id, s.sentido] as const));
    const avisos = await this.avisos.listarActivosDeSentidos(
      sentidos.map((s) => s.id),
      ahora,
    );
    return avisos.map((a) => ({
      sentido: nombre.get(a.sentido_id),
      numero_tramo: numeroTramo(a.distancia_ruta_m),
      distancia_ruta_m: a.distancia_ruta_m,
      personas: a.personas,
    }));
  }
}
