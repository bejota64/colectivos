import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  crearConsentimientos,
  IDA_9001,
  IDS,
  SENTIDO_IDA,
} from '../../../test/datos/recorrido-9001';
import type { UbicacionDoc } from '../../comun/mongo/mongo.servicio';
import type {
  ColectivoEnServicioFila,
  JornadaFila,
  JornadasRepositorio,
} from '../jornadas/jornadas.repositorio';
import type { Rol } from '../../comun/tipos';
import type { FlotaRepositorio } from '../flota/flota.repositorio';
import type { JornadasServicio } from '../jornadas/jornadas.servicio';
import type { UbicacionesRepositorio } from '../jornadas/ubicaciones.repositorio';
import { RutasServicio } from '../trazados/rutas.servicio';
import type { TrazadosRepositorio } from '../trazados/trazados.repositorio';
import { TiempoRealServicio } from './tiempo-real.servicio';

describe('TiempoRealServicio', () => {
  const AHORA = new Date('2026-10-20T12:00:00Z');
  const PASAJERO = { id: IDS.pasajero1, rol: 'pasajero' as Rol };
  const PUNTO_1 = { latitud: -33.6105, longitud: -70.5757 };
  const PUNTO_2 = { latitud: -33.6062, longitud: -70.5764 }; // 483 m
  const PUNTO_5 = { latitud: -33.5931, longitud: -70.579 }; // 1959 m

  let guardadas: UbicacionDoc[];
  let enServicio: ColectivoEnServicioFila[];
  let consentimiento: { acepto: boolean };
  let servicio: TiempoRealServicio;

  const jornada: JornadaFila = {
    id: IDS.jornadaAbierta,
    conductor_id: IDS.conductor1,
    vehiculo_id: IDS.vehiculo1,
    sentido_actual_id: IDS.sentidoIda,
    asientos_disponibles: 2,
    iniciada_en: AHORA,
    trazado_id: IDS.trazado,
    patente: 'ZZZZ01',
    capacidad: 4,
  };

  const ubicacion = (
    c: { latitud: number; longitud: number },
    distancia: number,
    haceSegundos: number,
    jornadaId = IDS.jornadaAbierta,
  ): UbicacionDoc => ({
    jornada_id: jornadaId,
    vehiculo_id: IDS.vehiculo1,
    sentido_id: IDS.sentidoIda,
    ubicacion: { type: 'Point', coordinates: [c.longitud, c.latitud] },
    distancia_ruta_m: distancia,
    velocidad_kmh: 20,
    asientos_disponibles: 2,
    registrada_en: new Date(AHORA.getTime() - haceSegundos * 1000),
  });

  beforeEach(() => {
    guardadas = [];
    enServicio = [];
    consentimiento = { acepto: true };
    const trazadosFalso = {
      buscarSentido: (id: string) => Promise.resolve(id === IDS.sentidoIda ? SENTIDO_IDA : null),
      puntosRuta: () => Promise.resolve(IDA_9001),
      esDeRepresentante: (t: string, r: string) => Promise.resolve(t === IDS.trazado && r === IDS.representante),
    } as unknown as TrazadosRepositorio;

    servicio = new TiempoRealServicio(
      { exigirAbierta: () => Promise.resolve(jornada) } as unknown as JornadasServicio,
      { listarAbiertasDeSentido: () => Promise.resolve(enServicio) } as unknown as JornadasRepositorio,
      {
        guardar: (u: UbicacionDoc) => {
          guardadas.push(u);
          return Promise.resolve();
        },
        ultima: () => Promise.resolve(guardadas[guardadas.length - 1] ?? null),
        ultimasDe: () =>
          Promise.resolve(new Map(guardadas.map((u) => [u.jornada_id, u] as const))),
      } as unknown as UbicacionesRepositorio,
      new RutasServicio(trazadosFalso),
      trazadosFalso,
      crearConsentimientos(consentimiento),
      {
        buscarConductor: (id: string) =>
          Promise.resolve({ usuario_id: id, trazado_id: id === IDS.conductor1 ? IDS.trazado : IDS.otroTrazado, habilitado: true }),
      } as unknown as FlotaRepositorio,
    );
  });

  describe('Posicion del conductor', () => {
    it('guarda la posicion proyectada sobre el recorrido, con su tramo', async () => {
      const r = await servicio.registrarPosicion(IDS.conductor1, PUNTO_2, AHORA);
      expect(r.distancia_ruta_m).toBe(483);
      expect(r.numero_tramo).toBe(0);
      expect(guardadas[0].ubicacion.coordinates).toEqual([PUNTO_2.longitud, PUNTO_2.latitud]);
    });

    it('rechaza una posicion fuera del recorrido (422)', async () => {
      await expect(
        servicio.registrarPosicion(IDS.conductor1, { latitud: -33.6018, longitud: -70.5805 }, AHORA),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(guardadas).toHaveLength(0);
    });

    it('rechaza un salto imposible respecto de la posicion anterior (GPS falso o erroneo)', async () => {
      guardadas.push(ubicacion(PUNTO_1, 0, 5));
      await expect(
        servicio.registrarPosicion(IDS.conductor1, PUNTO_5, AHORA),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('con una posicion anterior de hace horas no calcula: usa la del GPS', async () => {
      guardadas.push(ubicacion(PUNTO_2, 483, 3 * 60 * 60));
      const r = await servicio.registrarPosicion(
        IDS.conductor1,
        { ...PUNTO_2, velocidadKmh: 30 },
        AHORA,
      );
      expect(r.velocidad_kmh).toBe(30);
    });

    it('usa la velocidad calculada por el servidor aunque el cliente diga 0 km/h', async () => {
      guardadas.push(ubicacion(PUNTO_1, 0, 60));
      const r = await servicio.registrarPosicion(
        IDS.conductor1,
        { ...PUNTO_2, velocidadKmh: 0 },
        AHORA,
      );
      expect(Math.round(r.velocidad_kmh)).toBe(29);
    });
  });

  describe('Mapa del pasajero', () => {
    beforeEach(() => {
      enServicio = [
        { jornada_id: 'j-cerca', patente: 'ZZZZ01', vehiculo: 'Nissan Versa', asientos_disponibles: 2, nota_promedio: 4.5 },
        { jornada_id: 'j-paso', patente: 'ZZZZ02', vehiculo: 'Chevrolet Sail', asientos_disponibles: 1, nota_promedio: null },
        { jornada_id: 'j-sin-senal', patente: 'ZZ9903', vehiculo: 'Hyundai Accent', asientos_disponibles: 4, nota_promedio: 3 },
      ];
      guardadas = [
        ubicacion(PUNTO_2, 483, 4, 'j-cerca'),
        ubicacion(PUNTO_5, 1959, 4, 'j-paso'),
        ubicacion(PUNTO_1, 0, 150, 'j-sin-senal'),
      ];
    });

    it('oculta los colectivos sin señal reciente', async () => {
      const visibles = await servicio.listarColectivos(PASAJERO, IDS.sentidoIda, null, AHORA);
      expect(visibles.map((v) => v.patente).sort()).toEqual(['ZZZZ01', 'ZZZZ02']);
    });

    it('con su ubicacion y sin consentimiento responde 403 (Ley 21.719)', async () => {
      consentimiento.acepto = false;
      await expect(
        servicio.listarColectivos(PASAJERO, IDS.sentidoIda, PUNTO_2, AHORA),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('sin enviar ubicacion ve el mapa aunque no haya aceptado', async () => {
      consentimiento.acepto = false;
      const visibles = await servicio.listarColectivos(PASAJERO, IDS.sentidoIda, null, AHORA);
      expect(visibles).toHaveLength(2);
    });

    it('estima minutos para el que viene y null para el que ya paso', async () => {
      // Pasajero en el punto 4 (1463 m): ZZZZ01 esta a 980 m, ZZZZ02 ya paso.
      const visibles = await servicio.listarColectivos(
        PASAJERO,
        IDS.sentidoIda,
        { latitud: -33.5975, longitud: -70.5781 },
        AHORA,
      );
      expect(visibles[0].patente).toBe('ZZZZ01');
      expect(visibles[0].minutos_estimados).toBe(3);
      expect(visibles[1].minutos_estimados).toBeNull();
    });

    describe('CU-03: antiguedad de la señal', () => {
      const atrasado = () => {
        enServicio.push({
          jornada_id: 'j-atrasado',
          patente: 'ZZZZ04',
          vehiculo: 'Kia Rio',
          asientos_disponibles: 3,
          nota_promedio: null,
        });
        guardadas.push(ubicacion(PUNTO_1, 0, 90, 'j-atrasado'));
      };

      it('con señal de hasta 30 s se muestra normal', async () => {
        const visibles = await servicio.listarColectivos(PASAJERO, IDS.sentidoIda, null, AHORA);
        const cerca = visibles.find((v) => v.patente === 'ZZZZ01');
        expect(cerca).toMatchObject({ actualizado_hace_s: 4, atenuado: false });
      });

      it('entre 30 s y 2 min se sigue mostrando, atenuado', async () => {
        atrasado();
        const visibles = await servicio.listarColectivos(PASAJERO, IDS.sentidoIda, null, AHORA);
        expect(visibles.find((v) => v.patente === 'ZZZZ04')).toMatchObject({
          actualizado_hace_s: 90,
          atenuado: true,
        });
      });

      it('con mas de 2 min sin señal se oculta', async () => {
        const visibles = await servicio.listarColectivos(PASAJERO, IDS.sentidoIda, null, AHORA);
        expect(visibles.map((v) => v.patente)).not.toContain('ZZ9903');
      });
    });

    describe('Matriz de permisos: quien ve el mapa', () => {
      const ver = (id: string, rol: Rol) => servicio.listarColectivos({ id, rol }, IDS.sentidoIda, null, AHORA);

      it('el conductor y el representante del trazado lo ven', async () => {
        await expect(ver(IDS.conductor1, 'conductor')).resolves.toHaveLength(2);
        await expect(ver(IDS.representante, 'representante')).resolves.toHaveLength(2);
      });

      it('el administrador ve cualquier trazado', async () => {
        await expect(ver('admin-1', 'administrador')).resolves.toHaveLength(2);
      });

      it('un conductor o representante de otro trazado recibe 404', async () => {
        await expect(ver('conductor-de-otro-trazado', 'conductor')).rejects.toBeInstanceOf(NotFoundException);
        await expect(ver('representante-de-otro', 'representante')).rejects.toBeInstanceOf(NotFoundException);
      });
    });
  });
});
