import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaServicio } from '../auditoria/auditoria.servicio';
import { TrazadosRepositorio } from './trazados.repositorio';

/**
 * Rol + pertenencia, en un solo lugar: tener el rol "representante" no
 * basta, el trazado tiene que ser suyo (OWASP A01:2025). Un trazado ajeno
 * responde 404, para no confirmar que existe, y el intento queda en la
 * auditoria como acceso_denegado (evidencia ante la Ley 21.459).
 */
@Injectable()
export class PertenenciaServicio {
  constructor(
    private readonly trazados: TrazadosRepositorio,
    private readonly auditoria: AuditoriaServicio,
  ) {}

  async exigirTrazadoPropio(
    trazadoId: string,
    representanteId: string,
    accion: string,
    ip?: string,
  ): Promise<void> {
    if (await this.trazados.esDeRepresentante(trazadoId, representanteId)) {
      return;
    }
    await this.auditoria.registrar({
      tipo: 'acceso_denegado',
      usuarioId: representanteId,
      ip,
      detalle: { accion, trazado_id: trazadoId },
    });
    throw new NotFoundException('Trazado no encontrado');
  }
}
