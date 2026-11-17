import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditoriaServicio } from '../auditoria/auditoria.servicio';
import { JornadasRepositorio } from './jornadas.repositorio';
import {
  INTERVALO_CIERRE_AUTOMATICO_MS,
  motivoCierreAutomatico,
} from './reglas-jornada';
import { UbicacionesRepositorio } from './ubicaciones.repositorio';

/**
 * Cierre automatico de jornadas (CU-08). Cada 5 minutos cierra las
 * jornadas que llevan 30 minutos sin señal (el conductor se fue sin
 * cerrar, o se quedo sin bateria) y las de conductores deshabilitados.
 * Asi el mapa no muestra autos que ya no estan y la estadistica no cuenta
 * horas que no se trabajaron. Si el conductor vuelve, la API le responde
 * "Jornada cerrada" (regla 8 del LEEME).
 *
 * No corre durante las pruebas (NODE_ENV=test): ahi se llama directo.
 */
@Injectable()
export class CierreAutomaticoServicio
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly log = new Logger(CierreAutomaticoServicio.name);
  private temporizador: NodeJS.Timeout | null = null;

  constructor(
    private readonly jornadas: JornadasRepositorio,
    private readonly ubicaciones: UbicacionesRepositorio,
    private readonly auditoria: AuditoriaServicio,
    private readonly configuracion: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.configuracion.get<string>('NODE_ENV') === 'test') {
      return;
    }
    this.temporizador = setInterval(() => {
      this.cerrarSinSenal(new Date()).catch((error: Error) =>
        this.log.warn(`Cierre automatico fallido: ${error.message}`),
      );
    }, INTERVALO_CIERRE_AUTOMATICO_MS);
    this.temporizador.unref();
  }

  onApplicationShutdown(): void {
    if (this.temporizador) {
      clearInterval(this.temporizador);
    }
  }

  /** Devuelve los id de las jornadas que cerro. */
  async cerrarSinSenal(ahora: Date): Promise<string[]> {
    const abiertas = await this.jornadas.listarAbiertas();
    const ultimas = await this.ubicaciones.ultimasDe(abiertas.map((j) => j.id));
    const cerradas: string[] = [];
    for (const jornada of abiertas) {
      const motivo = motivoCierreAutomatico(
        {
          ultimaSenal: ultimas.get(jornada.id)?.registrada_en ?? null,
          iniciadaEn: jornada.iniciada_en,
          conductorHabilitado: jornada.conductor_habilitado,
        },
        ahora,
      );
      // cerrar() vuelve a exigir que siga abierta: si el conductor la
      // cerro entre medio, no se cierra dos veces ni se audita doble.
      if (!motivo || !(await this.jornadas.cerrar(jornada.id))) {
        continue;
      }
      await this.auditoria.registrar({
        tipo: 'fin_jornada',
        usuarioId: jornada.conductor_id,
        detalle: { jornada_id: jornada.id, patente: jornada.patente, motivo },
      });
      cerradas.push(jornada.id);
    }
    if (cerradas.length > 0) {
      this.log.log(`Cierre automatico: ${cerradas.length} jornada(s) cerradas`);
    }
    return cerradas;
  }
}
