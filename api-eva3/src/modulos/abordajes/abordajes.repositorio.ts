import { Injectable } from '@nestjs/common';
import { BaseDatosServicio } from '../../comun/base-datos/base-datos.servicio';

/** Inicio del dia de hoy en hora de Chile, como timestamptz. */
const INICIO_DE_HOY = `(date_trunc('day', now() AT TIME ZONE 'America/Santiago') AT TIME ZONE 'America/Santiago')`;

export interface AbordajeCreadoFila {
  id: string;
  abordado_en: Date;
  distancia_al_vehiculo_m: number;
}

export interface AbordajePropioFila {
  id: string;
  abordado_en: Date;
  patente: string;
  sentido: string;
  estrellas: number | null;
  /** El pasajero ve los reportes que escribio, con su estado y la respuesta. */
  reporte_tipo: string | null;
  reporte_estado: string | null;
  reporte_respuesta: string | null;
}

@Injectable()
export class AbordajesRepositorio {
  constructor(private readonly baseDatos: BaseDatosServicio) {}

  async contarDeHoy(pasajeroId: string): Promise<number> {
    const filas = await this.baseDatos.consultar<{ total: number }>(
      `SELECT count(*)::int AS total FROM abordajes
       WHERE pasajero_id = $1 AND abordado_en >= ${INICIO_DE_HOY}`,
      [pasajeroId],
    );
    return filas[0]?.total ?? 0;
  }

  /**
   * Registra el abordaje volviendo a comprobar que la jornada siga abierta y
   * que no se pase el tope diario. Si no se cumple, no inserta nada y
   * devuelve null. El sentido sale de la jornada, no del cliente.
   *
   * Hallazgo V-04: con varios "me subi" simultaneos del mismo pasajero, cada
   * INSERT contaba los viajes antes de que los otros se guardaran y el tope
   * se superaba. Ahora cada pasajero toma un candado (advisory lock) dentro
   * de la transaccion: sus "me subi" se procesan de a uno y el conteo ve
   * siempre los anteriores. Pasajeros distintos no se bloquean entre si.
   */
  async registrar(datos: {
    pasajeroId: string;
    jornadaId: string;
    distanciaM: number;
    maximoPorDia: number;
  }): Promise<AbordajeCreadoFila | null> {
    return this.baseDatos.enTransaccion(async (consultar) => {
      await consultar(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        datos.pasajeroId,
      ]);
      const filas = await consultar<AbordajeCreadoFila>(
        `INSERT INTO abordajes (pasajero_id, jornada_id, sentido_id, distancia_al_vehiculo_m)
         SELECT $1, j.id, j.sentido_actual_id, $3
         FROM jornadas j
         WHERE j.id = $2
           AND j.finalizada_en IS NULL
           AND j.sentido_actual_id IS NOT NULL
           AND (SELECT count(*) FROM abordajes a
                WHERE a.pasajero_id = $1 AND a.abordado_en >= ${INICIO_DE_HOY}) < $4
         RETURNING id, abordado_en, distancia_al_vehiculo_m`,
        [datos.pasajeroId, datos.jornadaId, datos.distanciaM, datos.maximoPorDia],
      );
      return filas[0] ?? null;
    });
  }

  /** Viajes propios, para calificar. La consulta filtra por el pasajero de la sesion. */
  listarDePasajero(pasajeroId: string): Promise<AbordajePropioFila[]> {
    return this.baseDatos.consultar<AbordajePropioFila>(
      `SELECT a.id, a.abordado_en, v.patente, s.sentido, c.estrellas,
              r.tipo AS reporte_tipo, r.estado AS reporte_estado, r.respuesta AS reporte_respuesta
       FROM abordajes a
       JOIN jornadas j  ON j.id = a.jornada_id
       JOIN vehiculos v ON v.id = j.vehiculo_id
       JOIN sentidos s  ON s.id = a.sentido_id
       LEFT JOIN calificaciones c ON c.abordaje_id = a.id
       LEFT JOIN reportes r       ON r.abordaje_id = a.id
       WHERE a.pasajero_id = $1
       ORDER BY a.abordado_en DESC
       LIMIT 20`,
      [pasajeroId],
    );
  }
}
