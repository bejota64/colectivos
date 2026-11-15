import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  aGeoJson,
  type Coordenada,
  desdeGeoJson,
  minutosEstimados,
  numeroTramo,
} from '../../comun/geo';
import type { UsuarioSesion } from '../../comun/tipos';
import { FlotaRepositorio } from '../flota/flota.repositorio';
import { JornadasRepositorio } from '../jornadas/jornadas.repositorio';
import { JornadasServicio } from '../jornadas/jornadas.servicio';
import {
  VELOCIDAD_MAXIMA_CREIBLE_KMH,
  VIGENCIA_POSICION_S,
  velocidadEntre,
} from '../jornadas/reglas-jornada';
import { UbicacionesRepositorio } from '../jornadas/ubicaciones.repositorio';
import {
  MAXIMO_DISTANCIA_AL_RECORRIDO_M,
  RutasServicio,
} from '../trazados/rutas.servicio';
import { TrazadosRepositorio } from '../trazados/trazados.repositorio';
import { ConsentimientosServicio } from '../usuarios/consentimientos.servicio';

export interface ColectivoVisible {
  jornada_id: string;
  patente: string;
  vehiculo: string;
  asientos_disponibles: number;
  nota_promedio: number | null;
  latitud: number;
  longitud: number;
  actualizado_hace_s: number;
  /** true si la ultima señal tiene mas de 30 s: la web lo muestra atenuado (CU-03). */
  atenuado: boolean;
  /** null si no se envio la ubicacion del pasajero o si el colectivo ya paso. */
  minutos_estimados: number | null;
}

/** CU-03: con mas de 30 s sin señal el colectivo se ve atenuado... */
export const SENAL_ATENUADA_S = 30;
/** ...y con mas de 2 minutos se oculta: mostrar un auto "fantasma" seria peor. */
export const SENAL_OCULTA_S = 120;

/**
 * Mapa en vivo. En el sistema final las posiciones se empujan por
 * Socket.IO; en este prototipo la web las pide cada pocos segundos (REST).
 * Las reglas son las mismas, solo cambia el transporte.
 */
@Injectable()
export class TiempoRealServicio {
  constructor(
    private readonly jornadasServicio: JornadasServicio,
    private readonly jornadas: JornadasRepositorio,
    private readonly ubicaciones: UbicacionesRepositorio,
    private readonly rutas: RutasServicio,
    private readonly trazados: TrazadosRepositorio,
    private readonly consentimientos: ConsentimientosServicio,
    private readonly flota: FlotaRepositorio,
  ) {}

  /**
   * Matriz de permisos: pasajero y administrador ven cualquier trazado;
   * conductor y representante, solo el suyo.
   */
  private async puedeVerTrazado(usuario: UsuarioSesion, trazadoId: string): Promise<boolean> {
    switch (usuario.rol) {
      case 'conductor':
        return (await this.flota.buscarConductor(usuario.id))?.trazado_id === trazadoId;
      case 'representante':
        return this.trazados.esDeRepresentante(trazadoId, usuario.id);
      default:
        return true;
    }
  }

  /** El conductor envia su posicion (cada 5 s desde la web). */
  async registrarPosicion(
    conductorId: string,
    datos: Coordenada & { velocidadKmh?: number },
    ahora: Date = new Date(),
  ) {
    const jornada = await this.jornadasServicio.exigirAbierta(conductorId);
    await this.consentimientos.exigirGeolocalizacion(conductorId);
    if (!jornada.sentido_actual_id) {
      throw new ConflictException('Elige el sentido antes de enviar tu posicion');
    }

    const coordenada = { latitud: datos.latitud, longitud: datos.longitud };
    const proyeccion = await this.rutas.proyectar(
      jornada.sentido_actual_id,
      coordenada,
    );
    if (
      !proyeccion ||
      proyeccion.distanciaAlRecorridoM > MAXIMO_DISTANCIA_AL_RECORRIDO_M
    ) {
      throw new UnprocessableEntityException(
        'La posicion esta fuera del recorrido',
      );
    }

    // Contra posiciones falsas o erroneas: un "salto" imposible respecto de
    // la posicion anterior se rechaza. No detiene a un GPS falso bien hecho
    // (riesgo aceptado en el diseno), pero si los errores groseros.
    // Solo se compara con una posicion reciente: contra una de hace horas
    // la velocidad calculada daria ~0 km/h y no diria nada del auto ahora.
    const anterior = await this.ubicaciones.ultima(jornada.id);
    const anteriorReciente =
      anterior &&
      ahora.getTime() - anterior.registrada_en.getTime() <=
        VIGENCIA_POSICION_S * 1000
        ? anterior
        : null;
    const calculada = anteriorReciente
      ? velocidadEntre(
          {
            coordenada: desdeGeoJson(anteriorReciente.ubicacion),
            en: anteriorReciente.registrada_en,
          },
          { coordenada, en: ahora },
        )
      : null;
    if (calculada !== null && calculada > VELOCIDAD_MAXIMA_CREIBLE_KMH) {
      throw new UnprocessableEntityException(
        'La posicion no es coherente con la anterior',
      );
    }

    // Se prefiere la velocidad calculada por el servidor: la que manda el
    // cliente se podria fijar en 0 para ajustar asientos en movimiento.
    const velocidad = calculada ?? datos.velocidadKmh ?? 0;

    await this.ubicaciones.guardar({
      jornada_id: jornada.id,
      vehiculo_id: jornada.vehiculo_id,
      sentido_id: jornada.sentido_actual_id,
      ubicacion: aGeoJson(coordenada),
      distancia_ruta_m: proyeccion.distanciaRutaM,
      velocidad_kmh: Math.round(velocidad * 10) / 10,
      asientos_disponibles: jornada.asientos_disponibles,
      registrada_en: ahora,
    });

    return {
      distancia_ruta_m: proyeccion.distanciaRutaM,
      numero_tramo: numeroTramo(proyeccion.distanciaRutaM),
      velocidad_kmh: Math.round(velocidad * 10) / 10,
    };
  }

  /**
   * Lo que ve el pasajero: colectivos de un sentido con señal reciente.
   * Si manda su ubicacion (para ver los minutos), se exige consentimiento
   * vigente aunque esa ubicacion solo se use para calcular y no se guarde.
   */
  async listarColectivos(
    usuario: UsuarioSesion,
    sentidoId: string,
    pasajero: Coordenada | null,
    ahora: Date = new Date(),
  ): Promise<ColectivoVisible[]> {
    if (pasajero) {
      await this.consentimientos.exigirGeolocalizacion(usuario.id);
    }
    const sentido = await this.trazados.buscarSentido(sentidoId);
    // Un trazado que no puede ver responde 404, igual que uno que no existe.
    if (!sentido || !(await this.puedeVerTrazado(usuario, sentido.trazado_id))) {
      throw new NotFoundException('Sentido no encontrado');
    }

    const enServicio = await this.jornadas.listarAbiertasDeSentido(sentidoId);
    const ultimas = await this.ubicaciones.ultimasDe(
      enServicio.map((c) => c.jornada_id),
    );
    const proyeccionPasajero = pasajero
      ? await this.rutas.proyectar(sentidoId, pasajero)
      : null;
    if (
      pasajero &&
      (!proyeccionPasajero ||
        proyeccionPasajero.distanciaAlRecorridoM > MAXIMO_DISTANCIA_AL_RECORRIDO_M)
    ) {
      throw new BadRequestException('Tu ubicacion esta fuera del recorrido');
    }

    const visibles: ColectivoVisible[] = [];
    for (const colectivo of enServicio) {
      const ultima = ultimas.get(colectivo.jornada_id);
      if (!ultima) continue;
      const edad = (ahora.getTime() - ultima.registrada_en.getTime()) / 1000;
      if (edad > SENAL_OCULTA_S) continue;

      const porRecorrer = proyeccionPasajero
        ? proyeccionPasajero.distanciaRutaM - ultima.distancia_ruta_m
        : null;
      const posicion = desdeGeoJson(ultima.ubicacion);
      visibles.push({
        ...colectivo,
        latitud: posicion.latitud,
        longitud: posicion.longitud,
        actualizado_hace_s: Math.round(edad),
        atenuado: edad > SENAL_ATENUADA_S,
        minutos_estimados:
          porRecorrer !== null && porRecorrer >= 0
            ? minutosEstimados(porRecorrer)
            : null,
      });
    }

    return visibles.sort(
      (a, b) =>
        (a.minutos_estimados ?? Number.MAX_SAFE_INTEGER) -
        (b.minutos_estimados ?? Number.MAX_SAFE_INTEGER),
    );
  }
}
