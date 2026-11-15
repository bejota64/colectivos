import { Injectable, Logger } from '@nestjs/common';
import type { Filter } from 'mongodb';
import { MongoServicio } from '../../comun/mongo/mongo.servicio';

/** Tipos que escribe la API. El validador de registro_eventos (01_colecciones.js) acepta los mismos. */
export const TIPOS_EVENTO = [
  'inicio_sesion_exitoso',
  'inicio_sesion_fallido',
  'cierre_sesion',
  'acceso_denegado',
  'inicio_jornada',
  'fin_jornada',
  'cambio_tarifa',
  'cambio_estado_reporte',
  'cambio_datos_maestros',
  'eliminacion_cuenta',
] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

/** Evento tal como se guarda y como lo lee el administrador. */
export interface EventoDoc {
  tipo: TipoEvento;
  usuario_id: string | null;
  direccion_ip?: string;
  detalle?: Record<string, unknown>;
  ocurrido_en: Date;
}

export const EVENTOS_POR_PAGINA = 50;

export interface Evento {
  tipo: TipoEvento;
  usuarioId?: string | null;
  ip?: string;
  /** Nunca poner aqui contrasenas, tokens ni ubicaciones de pasajeros. */
  detalle?: Record<string, unknown>;
}

/**
 * Registro de auditoria: quien hizo que y cuando. Es la evidencia que se
 * entrega si hay que investigar un acceso ilicito (Ley 21.459).
 *
 * Si MongoDB falla, el evento se pierde pero la peticion del usuario NO
 * falla: la auditoria acompana la operacion, no la bloquea. El fallo queda
 * en el log del servidor para revisarlo.
 */
@Injectable()
export class AuditoriaServicio {
  private readonly log = new Logger(AuditoriaServicio.name);

  constructor(private readonly mongo: MongoServicio) {}

  async registrar(evento: Evento): Promise<void> {
    try {
      await this.mongo.coleccion('registro_eventos').insertOne({
        tipo: evento.tipo,
        usuario_id: evento.usuarioId ?? null,
        direccion_ip: evento.ip,
        detalle: evento.detalle,
        ocurrido_en: new Date(),
      });
    } catch (error) {
      this.log.warn(
        `No se pudo registrar el evento ${evento.tipo}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Consulta del administrador (CU-14), solo lectura: la cuenta de MongoDB
   * de la API no puede modificar ni borrar eventos (02_cuenta_api.js).
   * El filtro se arma con valores ya validados, nunca con un objeto que
   * mande el cliente (evita la inyeccion de operadores de MongoDB).
   */
  listar(
    filtro: { tipo?: TipoEvento; usuarioId?: string; desde?: Date; hasta?: Date },
    pagina: number,
  ): Promise<EventoDoc[]> {
    const consulta: Filter<EventoDoc> = {};
    if (filtro.tipo) consulta.tipo = filtro.tipo;
    if (filtro.usuarioId) consulta.usuario_id = filtro.usuarioId;
    if (filtro.desde || filtro.hasta) {
      consulta.ocurrido_en = {
        ...(filtro.desde ? { $gte: filtro.desde } : {}),
        ...(filtro.hasta ? { $lt: filtro.hasta } : {}),
      };
    }
    return this.mongo
      .coleccion<EventoDoc>('registro_eventos')
      .find(consulta, { projection: { _id: 0 } })
      .sort({ ocurrido_en: -1 })
      .skip((pagina - 1) * EVENTOS_POR_PAGINA)
      .limit(EVENTOS_POR_PAGINA)
      .toArray();
  }
}
