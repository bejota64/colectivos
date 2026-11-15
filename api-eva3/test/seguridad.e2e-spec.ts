import { type INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import {
  DiscoveryModule,
  DiscoveryService,
  MetadataScanner,
  Reflector,
} from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { BaseDatosServicio } from '../src/comun/base-datos/base-datos.servicio';
import { CLAVE_PUBLICO } from '../src/comun/decoradores/publico.decorador';
import { CLAVE_ROLES } from '../src/comun/decoradores/roles.decorador';
import { MongoServicio } from '../src/comun/mongo/mongo.servicio';
import { AbordajesRepositorio } from '../src/modulos/abordajes/abordajes.repositorio';
import { ROLES, type Rol } from '../src/comun/tipos';
import { configurarAplicacion } from '../src/configurar-aplicacion';
import { type ConexionesAdmin, conectarComoAdmin } from './datos/admin';

/**
 * Pruebas de seguridad de la Evaluacion 4.
 *
 * Cada "describe" es una fila de la matriz de vulnerabilidades del informe:
 * codigo del hallazgo (V-01 a V-08), categoria OWASP Top 10:2025 y control
 * de ISO/IEC 27002:2022 que lo corrige. Se escribieron ANTES de corregir el
 * codigo: contra la version de la Eva 3 fallan, y ese fallo es la evidencia
 * del hallazgo. Las marcadas como "regresion" ya pasaban y se dejan para
 * que un cambio futuro no rompa el control.
 *
 * V-03 (dependencias con vulnerabilidades conocidas) no esta aqui: lo
 * revisa el paso npm audit de la integracion continua.
 *
 * Solo se ataca el prototipo propio, en bases desechables (Ley 21.459).
 */

const CLAVE = 'Clave.Prueba.2026';
const CORREOS: Record<Rol, string> = {
  pasajero: 'pasajero1@colectivos.ejemplo.cl',
  conductor: 'conductor1@colectivos.ejemplo.cl',
  representante: 'representante@colectivos.ejemplo.cl',
  administrador: 'admin@colectivos.ejemplo.cl',
};
const PASAJERO1 = '00000000-0000-4000-8000-000000000021';
const SENTIDO_IDA = '00000000-0000-4000-8000-000000000101';
const JORNADA_CERRADA = '00000000-0000-4000-8000-000000000301';
const JORNADA_ABIERTA = '00000000-0000-4000-8000-000000000302';
const UUID_CUALQUIERA = '00000000-0000-4000-8000-000000000999';
const PUNTO_2 = { latitud: -33.6062, longitud: -70.5764 };
const PREFIJO = 'prueba-e2e-seguridad-';
const MAXIMO_ABORDAJES_POR_DIA = 6;

interface RutaDeclarada {
  metodo: 'get' | 'post' | 'put' | 'patch' | 'delete';
  ruta: string;
  publica: boolean;
  roles: Rol[] | null;
  paraCualquierPerfil: boolean;
}

describe('Seguridad del prototipo (Evaluacion 4)', () => {
  let app: INestApplication;
  let servidor: Parameters<typeof request>[0];
  let admin: ConexionesAdmin;
  let rutas: RutaDeclarada[];
  const tokens = {} as Record<Rol, string>;
  const abordajesCreados: string[] = [];

  const llamar = (metodo: RutaDeclarada['metodo'], ruta: string) => {
    const agente = request(servidor);
    switch (metodo) {
      case 'get':
        return agente.get(ruta);
      case 'post':
        return agente.post(ruta);
      case 'put':
        return agente.put(ruta);
      case 'patch':
        return agente.patch(ruta);
      default:
        return agente.delete(ruta);
    }
  };

  const iniciarSesion = async (correo: string, contrasena = CLAVE) => {
    const r = await request(servidor)
      .post('/api/autenticacion/inicio-sesion')
      .send({ correo_electronico: correo, contrasena });
    return r;
  };

  /** Recorre los controladores registrados y arma la lista de rutas con lo que declara cada una. */
  const leerRutas = (): RutaDeclarada[] => {
    const reflector = app.get(Reflector);
    const escaner = app.get(MetadataScanner);
    const lista: RutaDeclarada[] = [];
    for (const { instance, metatype } of app.get(DiscoveryService).getControllers()) {
      if (!instance || !metatype) continue;
      const base = String(Reflect.getMetadata(PATH_METADATA, metatype) ?? '');
      const prototipo = Object.getPrototypeOf(instance) as Record<string, object>;
      for (const nombre of escaner.getAllMethodNames(prototipo)) {
        const manejador = prototipo[nombre];
        const subruta = Reflect.getMetadata(PATH_METADATA, manejador) as string | undefined;
        const metodo = Reflect.getMetadata(METHOD_METADATA, manejador) as RequestMethod | undefined;
        if (subruta === undefined || metodo === undefined) continue;
        const destinos = [manejador as () => void, metatype];
        const roles = reflector.getAllAndOverride<Rol[] | undefined>(CLAVE_ROLES, destinos);
        lista.push({
          metodo: RequestMethod[metodo].toLowerCase() as RutaDeclarada['metodo'],
          ruta: `/api/${base}/${subruta}`
            .replace(/\/+/g, '/')
            .replace(/\/$/, '')
            .replace(/:[A-Za-z]+/g, UUID_CUALQUIERA),
          publica: Boolean(reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, destinos)),
          roles: roles && roles.length > 0 ? roles : null,
          paraCualquierPerfil: Boolean(
            reflector.getAllAndOverride<boolean>('esAutenticado', destinos),
          ),
        });
      }
    }
    return lista;
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule, DiscoveryModule],
    }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarAplicacion(app as NestExpressApplication);
    await app.init();
    servidor = app.getHttpServer() as Parameters<typeof request>[0];
    admin = await conectarComoAdmin(app);
    rutas = leerRutas();
    for (const rol of ROLES) {
      const r = await iniciarSesion(CORREOS[rol]);
      tokens[rol] = (r.body as { token_acceso: string }).token_acceso;
    }
  });

  afterAll(async () => {
    if (abordajesCreados.length > 0) {
      await admin.pg.query(`DELETE FROM calificaciones WHERE abordaje_id = ANY($1::uuid[])`, [abordajesCreados]);
      await admin.pg.query(`DELETE FROM abordajes WHERE id = ANY($1::uuid[])`, [abordajesCreados]);
    }
    await admin.pg.query(
      `DELETE FROM abordajes WHERE pasajero_id IN (SELECT id FROM usuarios WHERE correo_electronico LIKE $1)`,
      [`${PREFIJO}%`],
    );
    await admin.pg.query(`DELETE FROM usuarios WHERE correo_electronico LIKE $1`, [`${PREFIJO}%`]);
    await admin.cerrar();
    await app.close();
  });

  describe('V-01 La API no usa una cuenta privilegiada de PostgreSQL (OWASP A02:2025, ISO 27002 8.2)', () => {
    it('la cuenta de la API no es superusuario ni puede crear tablas, roles o bases', async () => {
      const [cuenta] = await app.get(BaseDatosServicio).consultar<Record<string, boolean>>(
        `SELECT r.rolsuper AS superusuario,
                r.rolcreaterole AS crea_roles,
                r.rolcreatedb AS crea_bases,
                has_schema_privilege('public', 'CREATE') AS crea_tablas
         FROM pg_roles r WHERE r.rolname = current_user`,
      );
      expect(cuenta).toEqual({
        superusuario: false,
        crea_roles: false,
        crea_bases: false,
        crea_tablas: false,
      });
    });

    it('ninguna tabla se puede borrar (DELETE o TRUNCATE) con la cuenta de la API', async () => {
      const filas = await app.get(BaseDatosServicio).consultar<{ tabla: string }>(
        `SELECT c.relname AS tabla
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r'
           AND (has_table_privilege(c.oid, 'DELETE') OR has_table_privilege(c.oid, 'TRUNCATE'))
         ORDER BY 1`,
      );
      expect(filas.map((f) => f.tabla)).toEqual([]);
    });

    it('un intento real de borrar o alterar calificaciones es rechazado por PostgreSQL (42501)', async () => {
      const baseDatos = app.get(BaseDatosServicio);
      // WHERE false: si la cuenta tuviera el permiso, no se borra ni cambia nada.
      await expect(baseDatos.consultar('DELETE FROM calificaciones WHERE false')).rejects.toMatchObject({
        code: '42501',
      });
      await expect(
        baseDatos.consultar('UPDATE calificaciones SET estrellas = 5 WHERE false'),
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('la cuenta de la API no puede convertir una cuenta en administrador (42501)', async () => {
      const correo = `${PREFIJO}rol-${Date.now()}@ejemplo.cl`;
      await request(servidor).post('/api/autenticacion/registro').send({
        nombre_completo: 'Persona de Prueba',
        correo_electronico: correo,
        contrasena: 'caballo-pila-grapa-azul',
        acepta_terminos: true,
      });
      await expect(
        app
          .get(BaseDatosServicio)
          .consultar(`UPDATE usuarios SET rol = 'administrador' WHERE correo_electronico = $1`, [correo]),
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  describe('V-02 El registro de auditoria no se puede borrar ni alterar (OWASP A09:2025, ISO 27002 8.15)', () => {
    // El filtro no calza con ningun documento: si la cuenta tuviera el permiso, no se pierde nada.
    const NINGUNO = { tipo: 'evento-que-no-existe' };

    it('la cuenta de la API no puede borrar eventos (codigo 13, sin autorizacion)', async () => {
      const eventos = app.get(MongoServicio).coleccion('registro_eventos');
      await expect(eventos.deleteMany(NINGUNO)).rejects.toMatchObject({ code: 13 });
    });

    it('la cuenta de la API no puede modificar eventos', async () => {
      const eventos = app.get(MongoServicio).coleccion('registro_eventos');
      await expect(eventos.updateMany(NINGUNO, { $set: { detalle: {} } })).rejects.toMatchObject({ code: 13 });
    });

    it('la cuenta de la API no puede borrar el historial de posiciones', async () => {
      const ubicaciones = app.get(MongoServicio).coleccion('ubicaciones_vehiculos');
      await expect(ubicaciones.deleteMany({ jornada_id: 'ninguna' })).rejects.toMatchObject({ code: 13 });
    });
  });

  describe('V-04 "Me subi" simultaneos no superan el tope diario (OWASP A06:2025, ISO 27002 8.28)', () => {
    it('en la base: 12 registros simultaneos del mismo pasajero dejan exactamente 6', async () => {
      // Se llama directo al repositorio, sin HTTP: asi las 12 inserciones
      // llegan a PostgreSQL al mismo tiempo, que es la condicion de carrera.
      const { rows } = await admin.pg.query<{ id: string }>(
        `INSERT INTO usuarios (nombre_completo, correo_electronico, contrasena_hash, rol)
         VALUES ('Persona de Prueba', $1, 'x', 'pasajero') RETURNING id`,
        [`${PREFIJO}carrera-${Date.now()}@ejemplo.cl`],
      );
      const pasajeroId = rows[0].id;
      const repositorio = app.get(AbordajesRepositorio);
      const resultados = await Promise.all(
        Array.from({ length: 12 }, () =>
          repositorio.registrar({
            pasajeroId,
            jornadaId: JORNADA_ABIERTA,
            distanciaM: 10,
            maximoPorDia: MAXIMO_ABORDAJES_POR_DIA,
          }),
        ),
      );
      const { rows: conteo } = await admin.pg.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM abordajes WHERE pasajero_id = $1`,
        [pasajeroId],
      );
      expect({
        registrados: resultados.filter((r) => r !== null).length,
        total: conteo[0].total,
      }).toEqual({ registrados: MAXIMO_ABORDAJES_POR_DIA, total: MAXIMO_ABORDAJES_POR_DIA });
    });

    it('por HTTP: con 5 viajes hoy, 12 "me subi" al mismo tiempo dejan exactamente 6', async () => {
      // Pasajero nuevo con consentimiento de ubicacion.
      const correo = `${PREFIJO}${Date.now()}@ejemplo.cl`;
      await request(servidor).post('/api/autenticacion/registro').send({
        nombre_completo: 'Persona de Prueba',
        correo_electronico: correo,
        contrasena: 'caballo-pila-grapa-azul',
        acepta_terminos: true,
      });
      const sesion = await iniciarSesion(correo, 'caballo-pila-grapa-azul');
      const { token_acceso: token, usuario } = sesion.body as {
        token_acceso: string;
        usuario: { id: string };
      };
      await request(servidor)
        .post('/api/usuarios/yo/consentimientos/geolocalizacion')
        .set('Authorization', `Bearer ${token}`);

      // Ya tiene 5 viajes hoy: le queda uno.
      for (let i = 0; i < MAXIMO_ABORDAJES_POR_DIA - 1; i++) {
        await admin.pg.query(
          `INSERT INTO abordajes (pasajero_id, jornada_id, sentido_id, distancia_al_vehiculo_m)
           VALUES ($1, $2, $3, 10)`,
          [usuario.id, JORNADA_ABIERTA, SENTIDO_IDA],
        );
      }

      // El colectivo informa su posicion para que el "me subi" sea valido.
      const posicion = await request(servidor)
        .post('/api/tiempo-real/posiciones')
        .set('Authorization', `Bearer ${tokens.conductor}`)
        .send(PUNTO_2);
      expect(posicion.status).toBe(201);

      const respuestas = await Promise.all(
        Array.from({ length: 12 }, () =>
          request(servidor)
            .post('/api/abordajes')
            .set('Authorization', `Bearer ${token}`)
            .send({ jornada_id: JORNADA_ABIERTA, ...PUNTO_2 }),
        ),
      );
      const aceptados = respuestas.filter((r) => r.status === 201).length;
      const { rows } = await admin.pg.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM abordajes WHERE pasajero_id = $1`,
        [usuario.id],
      );
      expect({ aceptados, total: rows[0].total }).toEqual({
        aceptados: 1,
        total: MAXIMO_ABORDAJES_POR_DIA,
      });
    });
  });

  describe('V-05 Calificar solo dentro de 24 horas desde el viaje (OWASP A06:2025, ISO 27002 8.26)', () => {
    it('un viaje propio de hace 25 horas ya no se puede calificar (422)', async () => {
      const { rows } = await admin.pg.query<{ id: string }>(
        `INSERT INTO abordajes (pasajero_id, jornada_id, sentido_id, distancia_al_vehiculo_m, abordado_en)
         VALUES ($1, $2, $3, 10, now() - interval '25 hours') RETURNING id`,
        [PASAJERO1, JORNADA_CERRADA, SENTIDO_IDA],
      );
      abordajesCreados.push(rows[0].id);
      const r = await request(servidor)
        .post(`/api/abordajes/${rows[0].id}/calificacion`)
        .set('Authorization', `Bearer ${tokens.pasajero}`)
        .send({ estrellas: 1 });
      expect(r.status).toBe(422);
    });
  });

  describe('V-06 Control de acceso que deniega por defecto (OWASP A01:2025, ISO 27002 5.15 y 8.3)', () => {
    it('la API tiene rutas registradas (la prueba no esta vacia)', () => {
      expect(rutas.length).toBeGreaterThan(20);
    });

    it('regresion: toda ruta que no es publica responde 401 sin token', async () => {
      const abiertas: string[] = [];
      for (const r of rutas.filter((x) => !x.publica)) {
        const respuesta = await llamar(r.metodo, r.ruta);
        if (respuesta.status !== 401) abiertas.push(`${r.metodo.toUpperCase()} ${r.ruta} -> ${respuesta.status}`);
      }
      expect(abiertas).toEqual([]);
    });

    it('toda ruta declara quien la usa: @Publico, @Roles o @Autenticado', () => {
      const sinDeclarar = rutas
        .filter((r) => !r.publica && !r.roles && !r.paraCualquierPerfil)
        .map((r) => `${r.metodo.toUpperCase()} ${r.ruta}`);
      expect(sinDeclarar).toEqual([]);
    });

    it('regresion: cada perfil recibe 403 en todas las rutas que no son de su rol', async () => {
      const filtradas: string[] = [];
      for (const r of rutas.filter((x) => x.roles)) {
        for (const rol of ROLES.filter((x) => !r.roles?.includes(x))) {
          const respuesta = await llamar(r.metodo, r.ruta).set('Authorization', `Bearer ${tokens[rol]}`);
          if (respuesta.status !== 403) {
            filtradas.push(`${rol}: ${r.metodo.toUpperCase()} ${r.ruta} -> ${respuesta.status}`);
          }
        }
      }
      expect(filtradas).toEqual([]);
    });

    it('regresion: el rechazo por rol queda en la auditoria como acceso_denegado (A09:2025; Ley 21.459)', async () => {
      const desde = new Date();
      const r = await request(servidor)
        .post('/api/jornadas')
        .set('Authorization', `Bearer ${tokens.pasajero}`)
        .send({});
      expect(r.status).toBe(403);
      // La auditoria se escribe sin bloquear la respuesta: se espera hasta 2 s.
      let evento = null;
      for (let intento = 0; intento < 20 && !evento; intento++) {
        evento = await admin.mongo.collection('registro_eventos').findOne({
          tipo: 'acceso_denegado',
          usuario_id: PASAJERO1,
          'detalle.ruta': '/api/jornadas',
          ocurrido_en: { $gte: desde },
        });
        if (!evento) await new Promise((listo) => setTimeout(listo, 100));
      }
      expect(evento).not.toBeNull();
    });
  });

  describe('V-07 Las respuestas con tokens y datos personales no se guardan en cache (OWASP A02:2025, ISO 27002 8.9)', () => {
    it('el inicio de sesion responde Cache-Control: no-store', async () => {
      const r = await iniciarSesion(CORREOS.representante);
      expect(r.status).toBe(200);
      expect(r.headers['cache-control']).toContain('no-store');
    });

    it('el perfil propio responde Cache-Control: no-store', async () => {
      const r = await request(servidor).get('/api/usuarios/yo').set('Authorization', `Bearer ${tokens.pasajero}`);
      expect(r.status).toBe(200);
      expect(r.headers['cache-control']).toContain('no-store');
    });

    it('regresion: encabezados de seguridad de helmet y sin X-Powered-By', async () => {
      const r = await request(servidor).get('/api/usuarios/yo');
      expect(r.headers['x-content-type-options']).toBe('nosniff');
      expect(r.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('V-08 Limite explicito al tamano de lo que recibe la API (OWASP A02:2025 y A10:2025, ISO 27002 8.6)', () => {
    it('un cuerpo de 64 KB se rechaza con 413 antes de procesarlo', async () => {
      const r = await request(servidor)
        .post('/api/autenticacion/registro')
        .send({ nombre_completo: 'x'.repeat(64 * 1024) });
      expect(r.status).toBe(413);
    });

    it('un cuerpo de 200 KB responde 413 y no un error interno 500', async () => {
      const r = await request(servidor)
        .post('/api/autenticacion/registro')
        .send({ nombre_completo: 'x'.repeat(200 * 1024) });
      expect(r.status).toBe(413);
    });

    it('regresion: un JSON mal formado responde 400 y no 500 (OWASP A10:2025)', async () => {
      const r = await request(servidor)
        .post('/api/autenticacion/inicio-sesion')
        .set('Content-Type', 'application/json')
        .send('{"correo_electronico":');
      expect(r.status).toBe(400);
    });
  });
});
