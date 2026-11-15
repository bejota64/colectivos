import { Injectable } from '@nestjs/common';
import { BaseDatosServicio } from '../../comun/base-datos/base-datos.servicio';

export interface CalificacionFila {
  abordaje_id: string;
  estrellas: number;
  creada_en: Date;
}

@Injectable()
export class ValoracionesRepositorio {
  constructor(private readonly baseDatos: BaseDatosServicio) {}

  /** El viaje, solo si es del pasajero de la sesion. */
  async buscarViajePropio(
    abordajeId: string,
    pasajeroId: string,
  ): Promise<{ abordado_en: Date } | null> {
    const filas = await this.baseDatos.consultar<{ abordado_en: Date }>(
      `SELECT abordado_en FROM abordajes WHERE id = $1 AND pasajero_id = $2`,
      [abordajeId, pasajeroId],
    );
    return filas[0] ?? null;
  }

  /**
   * Califica SOLO si el abordaje es del pasajero de la sesion y sigue dentro
   * del plazo de 24 horas: ambas condiciones van dentro del INSERT, aunque
   * el servicio ya las reviso. Si no se cumplen no inserta nada y devuelve
   * null. Si ya estaba calificado, PostgreSQL lanza 23505 (una por abordaje).
   */
  async calificar(datos: {
    abordajeId: string;
    pasajeroId: string;
    estrellas: number;
  }): Promise<CalificacionFila | null> {
    const filas = await this.baseDatos.consultar<CalificacionFila>(
      `INSERT INTO calificaciones (abordaje_id, estrellas)
       SELECT a.id, $3 FROM abordajes a
       WHERE a.id = $1 AND a.pasajero_id = $2
         AND a.abordado_en >= now() - interval '24 hours'
       RETURNING abordaje_id, estrellas, creada_en`,
      [datos.abordajeId, datos.pasajeroId, datos.estrellas],
    );
    return filas[0] ?? null;
  }
}
