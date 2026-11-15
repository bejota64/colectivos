import { Injectable } from '@nestjs/common';
import { BaseDatosServicio } from '../../comun/base-datos/base-datos.servicio';

export interface DemandaFila {
  sentido: string;
  numero_tramo: number;
  hora: number;
  avisos: number;
  personas: number;
}

export interface ResumenConductorFila {
  conductor: string;
  abordajes: number;
  nota_promedio: number | null;
  quejas: number;
  felicitaciones: number;
}

export interface DemandaExportFila {
  fecha: string;
  sentido: string;
  numero_tramo: number;
  hora: number;
  avisos: number;
  personas: number;
}

export interface ReporteExportFila {
  fecha: string;
  patente: string;
  conductor: string;
  tipo: string;
  categoria: string;
  estado: string;
  descripcion: string;
  respuesta: string | null;
}

/** Lectura para el panel del representante. Todo agregado: ninguna fila identifica a un pasajero. */
@Injectable()
export class EstadisticasRepositorio {
  constructor(private readonly baseDatos: BaseDatosServicio) {}

  /** fecha null = hoy, en hora de Chile. */
  demandaDelDia(trazadoId: string, fecha: string | null): Promise<DemandaFila[]> {
    return this.baseDatos.consultar<DemandaFila>(
      `SELECT s.sentido, d.numero_tramo, d.hora, d.avisos, d.personas
       FROM demanda_por_tramo d
       JOIN sentidos s ON s.id = d.sentido_id
       WHERE s.trazado_id = $1
         AND d.fecha = coalesce($2::date, (now() AT TIME ZONE 'America/Santiago')::date)
       ORDER BY s.sentido, d.hora, d.numero_tramo`,
      [trazadoId, fecha],
    );
  }

  /** Consulta 6 de consultas_ejemplo.sql: comportamiento por conductor. */
  resumenConductores(trazadoId: string): Promise<ResumenConductorFila[]> {
    return this.baseDatos.consultar<ResumenConductorFila>(
      `SELECT u.nombre_completo AS conductor,
              count(DISTINCT a.id)::int AS abordajes,
              round(avg(c.estrellas), 1)::float8 AS nota_promedio,
              count(DISTINCT r.id) FILTER (WHERE r.tipo = 'queja')::int AS quejas,
              count(DISTINCT r.id) FILTER (WHERE r.tipo = 'felicitacion')::int AS felicitaciones
       FROM conductores co
       JOIN usuarios u        ON u.id = co.usuario_id
       LEFT JOIN jornadas j   ON j.conductor_id = co.usuario_id
       LEFT JOIN abordajes a  ON a.jornada_id = j.id
       LEFT JOIN calificaciones c ON c.abordaje_id = a.id
       LEFT JOIN reportes r   ON r.abordaje_id = a.id
       WHERE co.trazado_id = $1
       GROUP BY u.nombre_completo
       ORDER BY u.nombre_completo`,
      [trazadoId],
    );
  }

  /** Hoy en Chile, AAAA-MM-DD. */
  async hoy(): Promise<string> {
    const [fila] = await this.baseDatos.consultar<{ hoy: string }>(
      `SELECT to_char((now() AT TIME ZONE 'America/Santiago')::date, 'YYYY-MM-DD') AS hoy`,
    );
    return fila.hoy;
  }

  /** Demanda de un rango de dias, para el CSV (CU-10). */
  demandaEntre(trazadoId: string, desde: string, hasta: string): Promise<DemandaExportFila[]> {
    return this.baseDatos.consultar<DemandaExportFila>(
      `SELECT to_char(d.fecha, 'YYYY-MM-DD') AS fecha, s.sentido, d.numero_tramo,
              d.hora, d.avisos, d.personas
       FROM demanda_por_tramo d
       JOIN sentidos s ON s.id = d.sentido_id
       WHERE s.trazado_id = $1 AND d.fecha BETWEEN $2::date AND $3::date
       ORDER BY d.fecha, s.sentido, d.hora, d.numero_tramo`,
      [trazadoId, desde, hasta],
    );
  }

  /** Reportes de un rango de dias, para el CSV. Sin ningun dato del pasajero. */
  reportesEntre(trazadoId: string, desde: string, hasta: string): Promise<ReporteExportFila[]> {
    return this.baseDatos.consultar<ReporteExportFila>(
      `SELECT to_char(r.creado_en AT TIME ZONE 'America/Santiago', 'YYYY-MM-DD HH24:MI') AS fecha,
              v.patente, uc.nombre_completo AS conductor, r.tipo, r.categoria, r.estado,
              r.descripcion, r.respuesta
       FROM reportes r
       JOIN abordajes a  ON a.id = r.abordaje_id
       JOIN jornadas j   ON j.id = a.jornada_id
       JOIN vehiculos v  ON v.id = j.vehiculo_id
       JOIN usuarios uc  ON uc.id = j.conductor_id
       WHERE v.trazado_id = $1
         AND (r.creado_en AT TIME ZONE 'America/Santiago')::date BETWEEN $2::date AND $3::date
       ORDER BY r.creado_en`,
      [trazadoId, desde, hasta],
    );
  }
}
