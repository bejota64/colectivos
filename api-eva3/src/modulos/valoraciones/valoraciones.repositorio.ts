import { Injectable } from '@nestjs/common';
import { BaseDatosServicio } from '../../comun/base-datos/base-datos.servicio';
import type { Categoria, EstadoReporte, TipoReporte } from './reglas-valoracion';

export interface CalificacionFila {
  abordaje_id: string;
  estrellas: number;
  creada_en: Date;
}

export interface ReporteCreadoFila {
  id: string;
  tipo: TipoReporte;
  categoria: Categoria;
  estado: EstadoReporte;
  creado_en: Date;
}

/**
 * Reporte como lo ve el representante: el conductor y el auto, pero
 * NUNCA quien lo escribio (el pasajero queda protegido de represalias).
 */
export interface ReporteGestionFila {
  id: string;
  tipo: TipoReporte;
  categoria: Categoria;
  descripcion: string;
  estado: EstadoReporte;
  respuesta: string | null;
  creado_en: Date;
  cerrado_en: Date | null;
  patente: string;
  conductor: string;
}

/** Desde el reporte hasta el trazado: reporte -> abordaje -> jornada -> vehiculo. */
const REPORTES_DEL_TRAZADO = `
  FROM reportes r
  JOIN abordajes a  ON a.id = r.abordaje_id
  JOIN jornadas j   ON j.id = a.jornada_id
  JOIN vehiculos v  ON v.id = j.vehiculo_id
  JOIN usuarios uc  ON uc.id = j.conductor_id
  WHERE v.trazado_id = $1`;

const COLUMNAS_GESTION = `r.id, r.tipo, r.categoria, r.descripcion, r.estado, r.respuesta,
  r.creado_en, r.cerrado_en, v.patente, uc.nombre_completo AS conductor`;

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

  /**
   * Crea el reporte SOLO si el abordaje es del pasajero y esta dentro del
   * plazo, igual que la calificacion. Uno por abordaje: si ya existe,
   * PostgreSQL lanza 23505.
   */
  async crearReporte(datos: {
    abordajeId: string;
    pasajeroId: string;
    tipo: TipoReporte;
    categoria: Categoria;
    descripcion: string;
  }): Promise<ReporteCreadoFila | null> {
    const filas = await this.baseDatos.consultar<ReporteCreadoFila>(
      `INSERT INTO reportes (abordaje_id, tipo, categoria, descripcion)
       SELECT a.id, $3, $4, $5 FROM abordajes a
       WHERE a.id = $1 AND a.pasajero_id = $2
         AND a.abordado_en >= now() - interval '24 hours'
       RETURNING id, tipo, categoria, estado, creado_en`,
      [datos.abordajeId, datos.pasajeroId, datos.tipo, datos.categoria, datos.descripcion],
    );
    return filas[0] ?? null;
  }

  listarReportesDeTrazado(
    trazadoId: string,
    estado: EstadoReporte | null,
  ): Promise<ReporteGestionFila[]> {
    return this.baseDatos.consultar<ReporteGestionFila>(
      `SELECT ${COLUMNAS_GESTION} ${REPORTES_DEL_TRAZADO}
         AND ($2::text IS NULL OR r.estado = $2)
       ORDER BY r.creado_en DESC
       LIMIT 200`,
      [trazadoId, estado],
    );
  }

  async buscarReporteDeTrazado(
    reporteId: string,
    trazadoId: string,
  ): Promise<ReporteGestionFila | null> {
    const filas = await this.baseDatos.consultar<ReporteGestionFila>(
      `SELECT ${COLUMNAS_GESTION} ${REPORTES_DEL_TRAZADO} AND r.id = $2`,
      [trazadoId, reporteId],
    );
    return filas[0] ?? null;
  }

  /**
   * Cambia el estado solo si sigue en el estado que vio el representante:
   * si otra persona lo cambio entre medio, no pisa ese cambio (devuelve false).
   */
  async cambiarEstado(datos: {
    reporteId: string;
    estadoAnterior: EstadoReporte;
    estadoNuevo: EstadoReporte;
    respuesta: string | null;
    gestionadoPor: string;
  }): Promise<boolean> {
    const filas = await this.baseDatos.consultar<{ id: string }>(
      `UPDATE reportes SET
         estado = $3,
         respuesta = coalesce($4, respuesta),
         gestionado_por = $5,
         cerrado_en = CASE WHEN $3 = 'cerrado' THEN now() ELSE cerrado_en END
       WHERE id = $1 AND estado = $2
       RETURNING id`,
      [datos.reporteId, datos.estadoAnterior, datos.estadoNuevo, datos.respuesta, datos.gestionadoPor],
    );
    return filas.length > 0;
  }
}
