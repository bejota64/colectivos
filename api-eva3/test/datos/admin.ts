import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Db, MongoClient } from 'mongodb';
import { Pool } from 'pg';

/**
 * Conexiones de administracion, SOLO para preparar y limpiar datos en las
 * pruebas de integracion. La API se conecta con un usuario de permisos
 * minimos (sin DELETE ni cambios de estructura), asi que la limpieza no
 * puede hacerse con la conexion de la API.
 *
 * Si URL_POSTGRES_ADMIN o URL_MONGO_ADMIN no estan definidas se usan las
 * de la API (como en la Eva 3, cuando ambas eran la misma cuenta).
 */
export interface ConexionesAdmin {
  pg: Pool;
  mongo: Db;
  cerrar: () => Promise<void>;
}

export async function conectarComoAdmin(
  app: INestApplication,
): Promise<ConexionesAdmin> {
  const configuracion = app.get(ConfigService);
  const pg = new Pool({
    connectionString:
      configuracion.get<string>('URL_POSTGRES_ADMIN') ||
      configuracion.getOrThrow<string>('URL_POSTGRES'),
    max: 2,
  });
  const cliente = new MongoClient(
    configuracion.get<string>('URL_MONGO_ADMIN') ||
      configuracion.getOrThrow<string>('URL_MONGO'),
  );
  await cliente.connect();
  return {
    pg,
    mongo: cliente.db('colectivos'),
    cerrar: async () => {
      await pg.end();
      await cliente.close();
    },
  };
}
