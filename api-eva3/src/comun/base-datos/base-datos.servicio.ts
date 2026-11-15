import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResultRow } from 'pg';

/** Ejecuta una sentencia parametrizada y devuelve sus filas. */
export type Consultar = <Fila extends QueryResultRow>(
  sql: string,
  parametros?: unknown[],
) => Promise<Fila[]>;

/**
 * Unico punto de acceso a PostgreSQL. Los repositorios siempre pasan los
 * valores en "parametros" ($1, $2, ...) y nunca los pegan dentro del texto
 * SQL: asi se evita la inyeccion SQL.
 */
@Injectable()
export class BaseDatosServicio implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(configuracion: ConfigService) {
    this.pool = new Pool({
      connectionString: configuracion.getOrThrow<string>('URL_POSTGRES'),
      max: 10,
    });
  }

  async consultar<Fila extends QueryResultRow>(
    sql: string,
    parametros: unknown[] = [],
  ): Promise<Fila[]> {
    const resultado = await this.pool.query<Fila>(sql, parametros);
    return resultado.rows;
  }

  /**
   * Ejecuta varias sentencias en UNA transaccion, con la misma conexion.
   * Si la funcion lanza un error se deshace todo (ROLLBACK).
   */
  async enTransaccion<T>(trabajo: (consultar: Consultar) => Promise<T>): Promise<T> {
    const cliente: PoolClient = await this.pool.connect();
    const consultar: Consultar = async (sql, parametros = []) =>
      (await cliente.query(sql, parametros)).rows;
    try {
      await cliente.query('BEGIN');
      const resultado = await trabajo(consultar);
      await cliente.query('COMMIT');
      return resultado;
    } catch (error) {
      await cliente.query('ROLLBACK');
      throw error;
    } finally {
      cliente.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
