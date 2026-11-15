import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuditoriaServicio } from '../../modulos/auditoria/auditoria.servicio';
import type { UsuarioSesion } from '../tipos';

const MENSAJE_INTERNO = 'Ocurrio un error interno. Intenta de nuevo mas tarde';

const MENSAJES_DEL_LECTOR: Record<number, string> = {
  413: 'La solicitud supera el tamano permitido',
  415: 'Tipo de contenido no soportado',
};

/**
 * Los errores del lector del cuerpo (body-parser) no son HttpException:
 * traen su codigo 4xx en "status" y expose = true. Antes caian en el 500
 * generico (hallazgo V-08); son errores del cliente y se responden como tal.
 */
function estadoDelLector(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const { status, expose } = error as { status?: unknown; expose?: unknown };
  return expose === true &&
    typeof status === 'number' &&
    status >= 400 &&
    status < 500
    ? status
    : null;
}

/**
 * Filtro global de errores (OWASP A10:2025, manejo de condiciones
 * excepcionales). Hace tres cosas:
 *  1. Los errores HTTP previstos (400, 401, 403, 404, 409, 422, 429) salen
 *     tal cual: los mensajes los escribimos nosotros.
 *  2. Cualquier otro error (una caida de la base, un bug) responde 500 con
 *     un mensaje generico. El detalle y la traza quedan SOLO en el log del
 *     servidor: el cliente nunca ve SQL, rutas de archivos ni versiones.
 *  3. Cada 403 queda en la auditoria como "acceso_denegado".
 *  4. Los errores 4xx del lector del cuerpo (por ejemplo 413, demasiado
 *     grande) salen con su codigo y un mensaje propio, no como 500.
 */
@Catch()
export class ErroresFiltro implements ExceptionFilter {
  private readonly log = new Logger(ErroresFiltro.name);

  constructor(private readonly auditoria: AuditoriaServicio) {}

  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const peticion = http.getRequest<Request & { usuario?: UsuarioSesion }>();
    const respuesta = http.getResponse<Response>();

    if (error instanceof HttpException) {
      const estado = error.getStatus();
      if (estado === Number(HttpStatus.FORBIDDEN)) {
        void this.auditoria.registrar({
          tipo: 'acceso_denegado',
          usuarioId: peticion.usuario?.id,
          ip: peticion.ip,
          detalle: { metodo: peticion.method, ruta: peticion.path },
        });
      }
      respuesta.status(estado).json(error.getResponse());
      return;
    }

    const estadoLector = estadoDelLector(error);
    if (estadoLector) {
      respuesta.status(estadoLector).json({
        statusCode: estadoLector,
        message: MENSAJES_DEL_LECTOR[estadoLector] ?? 'Solicitud invalida',
      });
      return;
    }

    this.log.error(
      `${peticion.method} ${peticion.path}: ${(error as Error)?.message}`,
      (error as Error)?.stack,
    );
    respuesta.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: MENSAJE_INTERNO,
    });
  }
}
