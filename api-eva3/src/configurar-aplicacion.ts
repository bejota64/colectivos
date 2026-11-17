import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

/**
 * Tamano maximo del cuerpo de una peticion. Lo mas grande que recibe la API
 * es un reporte de 1000 caracteres (unos 4 KB); 16 KB deja margen. El valor
 * por defecto de Express (100 KB) permitia mandar cuerpos mucho mas grandes
 * de lo necesario, y sobre ese tamano la API respondia 500 (hallazgo V-08).
 */
export const LIMITE_CUERPO = '16kb';

/**
 * Configuracion comun a la API real y a las pruebas de integracion: asi
 * las pruebas ejercitan exactamente lo mismo que corre en produccion.
 */
export function configurarAplicacion(app: NestExpressApplication): void {
  // Detras del proxy inverso: confiar en UN salto para leer la IP real del cliente.
  app.set('trust proxy', 1);
  app.setGlobalPrefix('api');
  app.use(helmet());
  // Ninguna respuesta de la API se guarda en cache del navegador ni de un
  // proxy: llevan tokens o datos personales (hallazgo V-07). Va antes que
  // todo lo demas para que tambien la lleven las respuestas de error.
  app.use((_peticion: Request, respuesta: Response, siguiente: NextFunction) => {
    respuesta.setHeader('Cache-Control', 'no-store');
    siguiente();
  });
  // Se registran antes que los de Nest, que entonces no agrega los suyos.
  app.useBodyParser('json', { limit: LIMITE_CUERPO });
  app.useBodyParser('urlencoded', { limit: LIMITE_CUERPO, extended: false });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // descarta campos que el DTO no declara
      forbidNonWhitelisted: true, // y ademas responde 400 si llegan
      transform: true, // convierte el cuerpo en una instancia del DTO
    }),
  );

  // En produccion la web y la API salen del mismo dominio (Caddy), y no hace
  // falta CORS. Solo en desarrollo, si la web corre en otro puerto, se
  // permite ESE origen y ningun otro (nunca "*" con cookies).
  const origenWeb = app.get(ConfigService).get<string>('ORIGEN_WEB');
  if (origenWeb) {
    app.enableCors({ origin: origenWeb, credentials: true });
  }
}
