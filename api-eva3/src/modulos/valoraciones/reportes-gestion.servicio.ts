import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditoriaServicio } from '../auditoria/auditoria.servicio';
import { PertenenciaServicio } from '../trazados/pertenencia.servicio';
import { type EstadoReporte, motivoTransicionInvalida } from './reglas-valoracion';
import { ValoracionesRepositorio } from './valoraciones.repositorio';

/**
 * Gestion de reportes por el representante (CU-11). Solo los de su
 * trazado (rol + pertenencia) y sin datos del pasajero. Cada cambio de
 * estado queda en la auditoria como cambio_estado_reporte.
 */
@Injectable()
export class ReportesGestionServicio {
  constructor(
    private readonly valoraciones: ValoracionesRepositorio,
    private readonly pertenencia: PertenenciaServicio,
    private readonly auditoria: AuditoriaServicio,
  ) {}

  async listar(
    trazadoId: string,
    representanteId: string,
    estado: EstadoReporte | null,
    ip?: string,
  ) {
    await this.pertenencia.exigirTrazadoPropio(trazadoId, representanteId, 'ver_reportes', ip);
    return this.valoraciones.listarReportesDeTrazado(trazadoId, estado);
  }

  async gestionar(
    trazadoId: string,
    reporteId: string,
    representanteId: string,
    cambio: { estado: Exclude<EstadoReporte, 'pendiente'>; respuesta?: string },
    ip?: string,
  ) {
    await this.pertenencia.exigirTrazadoPropio(trazadoId, representanteId, 'gestionar_reporte', ip);
    const reporte = await this.valoraciones.buscarReporteDeTrazado(reporteId, trazadoId);
    if (!reporte) {
      throw new NotFoundException('Reporte no encontrado');
    }
    const motivo = motivoTransicionInvalida(reporte.estado, cambio.estado, cambio.respuesta);
    if (motivo) {
      throw new UnprocessableEntityException(motivo);
    }
    const cambiado = await this.valoraciones.cambiarEstado({
      reporteId,
      estadoAnterior: reporte.estado,
      estadoNuevo: cambio.estado,
      respuesta: cambio.respuesta ?? null,
      gestionadoPor: representanteId,
    });
    if (!cambiado) {
      throw new ConflictException('El reporte cambio mientras lo revisabas. Vuelve a cargarlo');
    }
    await this.auditoria.registrar({
      tipo: 'cambio_estado_reporte',
      usuarioId: representanteId,
      ip,
      detalle: {
        reporte_id: reporteId,
        trazado_id: trazadoId,
        estado_anterior: reporte.estado,
        estado_nuevo: cambio.estado,
      },
    });
    return this.valoraciones.buscarReporteDeTrazado(reporteId, trazadoId);
  }
}
