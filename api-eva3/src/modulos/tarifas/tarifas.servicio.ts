import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditoriaServicio } from '../auditoria/auditoria.servicio';
import { PertenenciaServicio } from '../trazados/pertenencia.servicio';
import { mismaHora, motivoFranjaInvalida } from './reglas-tarifa';
import { TarifaFila, TarifasRepositorio } from './tarifas.repositorio';

/**
 * Tarifas del trazado (CU-12). Solo el representante del trazado las
 * cambia; cada cambio queda en la auditoria como cambio_tarifa.
 */
@Injectable()
export class TarifasServicio {
  constructor(
    private readonly tarifas: TarifasRepositorio,
    private readonly pertenencia: PertenenciaServicio,
    private readonly auditoria: AuditoriaServicio,
  ) {}

  listarVigentes(trazadoId: string) {
    return this.tarifas.listarVigentes(trazadoId);
  }

  async listarHistorial(trazadoId: string, representanteId: string, ip?: string) {
    await this.pertenencia.exigirTrazadoPropio(trazadoId, representanteId, 'ver_tarifas', ip);
    return this.tarifas.listarHistorial(trazadoId);
  }

  async fijar(
    trazadoId: string,
    representanteId: string,
    datos: { nombre: string; monto: number; horaInicio: string | null; horaFin: string | null },
    ip?: string,
  ): Promise<TarifaFila> {
    await this.pertenencia.exigirTrazadoPropio(trazadoId, representanteId, 'cambiar_tarifa', ip);
    const motivo = motivoFranjaInvalida(datos);
    if (motivo) {
      throw new UnprocessableEntityException(motivo);
    }
    const vigente = await this.tarifas.buscarVigente(trazadoId, datos.nombre);
    if (
      vigente &&
      vigente.monto === datos.monto &&
      mismaHora(vigente.hora_inicio, datos.horaInicio) &&
      mismaHora(vigente.hora_fin, datos.horaFin)
    ) {
      throw new UnprocessableEntityException('La tarifa vigente ya tiene ese monto y horario');
    }

    const { anterior, nueva } = await this.tarifas.reemplazar({
      trazadoId,
      ...datos,
      creadaPor: representanteId,
    });
    await this.auditoria.registrar({
      tipo: 'cambio_tarifa',
      usuarioId: representanteId,
      ip,
      detalle: {
        trazado_id: trazadoId,
        nombre: nueva.nombre,
        monto_anterior: anterior?.monto ?? null,
        monto_nuevo: nueva.monto,
      },
    });
    return nueva;
  }

  async cerrar(trazadoId: string, tarifaId: string, representanteId: string, ip?: string) {
    await this.pertenencia.exigirTrazadoPropio(trazadoId, representanteId, 'cerrar_tarifa', ip);
    const cerrada = await this.tarifas.cerrar(tarifaId, trazadoId);
    if (!cerrada) {
      throw new NotFoundException('Tarifa vigente no encontrada');
    }
    await this.auditoria.registrar({
      tipo: 'cambio_tarifa',
      usuarioId: representanteId,
      ip,
      detalle: {
        trazado_id: trazadoId,
        nombre: cerrada.nombre,
        monto_anterior: cerrada.monto,
        monto_nuevo: null,
      },
    });
  }
}
