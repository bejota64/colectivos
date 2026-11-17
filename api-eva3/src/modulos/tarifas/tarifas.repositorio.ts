import { Injectable } from '@nestjs/common';
import { BaseDatosServicio } from '../../comun/base-datos/base-datos.servicio';

export interface TarifaFila {
  id: string;
  nombre: string;
  monto: number;
  hora_inicio: string | null;
  hora_fin: string | null;
  vigente_desde: Date;
  vigente_hasta: Date | null;
}

const COLUMNAS = 'id, nombre, monto, hora_inicio, hora_fin, vigente_desde, vigente_hasta';

@Injectable()
export class TarifasRepositorio {
  constructor(private readonly baseDatos: BaseDatosServicio) {}

  /** Lo que ve el pasajero en el mapa: precios vigentes de un trazado activo. */
  listarVigentes(trazadoId: string): Promise<TarifaFila[]> {
    return this.baseDatos.consultar<TarifaFila>(
      `SELECT t.id, t.nombre, t.monto, t.hora_inicio, t.hora_fin, t.vigente_desde, t.vigente_hasta
       FROM tarifas t
       JOIN trazados z ON z.id = t.trazado_id AND z.activo
       WHERE t.trazado_id = $1 AND t.vigente_hasta IS NULL
       ORDER BY t.monto, t.nombre`,
      [trazadoId],
    );
  }

  /** Historial completo: cada cambio de precio es una fila nueva. */
  listarHistorial(trazadoId: string): Promise<TarifaFila[]> {
    return this.baseDatos.consultar<TarifaFila>(
      `SELECT ${COLUMNAS} FROM tarifas
       WHERE trazado_id = $1
       ORDER BY nombre, vigente_desde DESC`,
      [trazadoId],
    );
  }

  /**
   * Crea una tarifa o le cambia el precio. Cambiar = cerrar la fila vigente
   * con ese nombre y crear una nueva, en UNA transaccion: asi queda el
   * historial y nunca hay dos tarifas vigentes con el mismo nombre (regla 6
   * del LEEME). El candado por trazado y nombre evita que dos cambios
   * simultaneos dejen dos vigentes.
   */
  reemplazar(datos: {
    trazadoId: string;
    nombre: string;
    monto: number;
    horaInicio: string | null;
    horaFin: string | null;
    creadaPor: string;
  }): Promise<{ anterior: TarifaFila | null; nueva: TarifaFila }> {
    return this.baseDatos.enTransaccion(async (consultar) => {
      await consultar(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `tarifa:${datos.trazadoId}:${datos.nombre.toLowerCase()}`,
      ]);
      const [anterior] = await consultar<TarifaFila>(
        `UPDATE tarifas SET vigente_hasta = now()
         WHERE trazado_id = $1 AND lower(nombre) = lower($2) AND vigente_hasta IS NULL
         RETURNING ${COLUMNAS}`,
        [datos.trazadoId, datos.nombre],
      );
      const [nueva] = await consultar<TarifaFila>(
        `INSERT INTO tarifas (trazado_id, nombre, monto, hora_inicio, hora_fin, creada_por)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING ${COLUMNAS}`,
        [
          datos.trazadoId,
          datos.nombre,
          datos.monto,
          datos.horaInicio,
          datos.horaFin,
          datos.creadaPor,
        ],
      );
      return { anterior: anterior ?? null, nueva };
    });
  }

  /** Busca la tarifa vigente con ese nombre (sin distinguir mayusculas). */
  async buscarVigente(trazadoId: string, nombre: string): Promise<TarifaFila | null> {
    const filas = await this.baseDatos.consultar<TarifaFila>(
      `SELECT ${COLUMNAS} FROM tarifas
       WHERE trazado_id = $1 AND lower(nombre) = lower($2) AND vigente_hasta IS NULL`,
      [trazadoId, nombre],
    );
    return filas[0] ?? null;
  }

  /** Deja de cobrar una tarifa. Solo si es de ese trazado y sigue vigente. */
  async cerrar(tarifaId: string, trazadoId: string): Promise<TarifaFila | null> {
    const filas = await this.baseDatos.consultar<TarifaFila>(
      `UPDATE tarifas SET vigente_hasta = now()
       WHERE id = $1 AND trazado_id = $2 AND vigente_hasta IS NULL
       RETURNING ${COLUMNAS}`,
      [tarifaId, trazadoId],
    );
    return filas[0] ?? null;
  }
}
