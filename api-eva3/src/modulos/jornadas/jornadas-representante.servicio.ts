import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaServicio } from '../auditoria/auditoria.servicio';
import { PertenenciaServicio } from '../trazados/pertenencia.servicio';
import { JornadasRepositorio } from './jornadas.repositorio';

/**
 * Lo que el representante puede hacer con las jornadas de SU trazado:
 * verlas y cerrarlas (matriz de permisos: "solo cerrar, en su trazado"),
 * por ejemplo si un conductor se fue sin cerrar la suya.
 */
@Injectable()
export class JornadasRepresentanteServicio {
  constructor(
    private readonly jornadas: JornadasRepositorio,
    private readonly pertenencia: PertenenciaServicio,
    private readonly auditoria: AuditoriaServicio,
  ) {}

  async listarAbiertas(trazadoId: string, representanteId: string, ip?: string) {
    await this.pertenencia.exigirTrazadoPropio(trazadoId, representanteId, 'ver_jornadas', ip);
    const jornadas = await this.jornadas.listarAbiertasDeTrazado(trazadoId);
    return jornadas.map((j) => ({ id: j.id, patente: j.patente, iniciada_en: j.iniciada_en }));
  }

  /** Una jornada de otro trazado, o ya cerrada, responde 404. */
  async cerrar(
    trazadoId: string,
    jornadaId: string,
    representanteId: string,
    ip?: string,
  ): Promise<void> {
    await this.pertenencia.exigirTrazadoPropio(trazadoId, representanteId, 'cerrar_jornada', ip);
    const jornada = (await this.jornadas.listarAbiertasDeTrazado(trazadoId)).find(
      (j) => j.id === jornadaId,
    );
    if (!jornada || !(await this.jornadas.cerrar(jornada.id))) {
      throw new NotFoundException('Jornada abierta no encontrada');
    }
    await this.auditoria.registrar({
      tipo: 'fin_jornada',
      usuarioId: representanteId,
      ip,
      detalle: {
        jornada_id: jornada.id,
        patente: jornada.patente,
        conductor_id: jornada.conductor_id,
        motivo: 'cerrada_por_representante',
      },
    });
  }
}
