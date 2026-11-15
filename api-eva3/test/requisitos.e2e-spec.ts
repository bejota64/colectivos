import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configurarAplicacion } from '../src/configurar-aplicacion';
import { type ConexionesAdmin, conectarComoAdmin } from './datos/admin';

/**
 * Requisitos del MVP que el prototipo de la Eva 3 dejo fuera (Eva 4,
 * indicador 1). Cada "describe" es un caso de uso del diseno (Eva 2).
 * Se escribieron antes de programarlos: contra la Eva 3 fallan con 404
 * porque las rutas no existian.
 *
 * Solo usan HTTP y datos de prueba ficticios; lo que crean lo borran al final.
 */

const CLAVE = 'Clave.Prueba.2026';
const CLAVE_NUEVA = 'caballo-pila-grapa-azul';
const TRAZADO = '00000000-0000-4000-8000-000000000100';
const OTRO_TRAZADO = '00000000-0000-4000-8000-000000000999';
const SENTIDO_IDA = '00000000-0000-4000-8000-000000000101';
const JORNADA_ABIERTA = '00000000-0000-4000-8000-000000000302';
const VEHICULO_EN_SERVICIO = '00000000-0000-4000-8000-000000000201';
const VEHICULO_LIBRE = '00000000-0000-4000-8000-000000000203';
const PASAJERO1 = '00000000-0000-4000-8000-000000000021';
const PREFIJO = 'prueba-e2e-requisitos-';
const TARIFA_PRUEBA = 'Prueba e2e';
const PATENTE_PRUEBA = 'ZZZZ77';
const FORMULA = '=HIPERVINCULO("http://sitio-falso";"ver") iba con el celular';

describe('Requisitos del MVP (Evaluacion 4)', () => {
  let app: INestApplication;
  let servidor: Parameters<typeof request>[0];
  let admin: ConexionesAdmin;
  let representante: string;
  let administrador: string;
  let pasajero: string;
  const abordajesCreados: string[] = [];
  const conductor = { correo: '', id: '', token: '', jornada: '' };
  /** Cuentas creadas por estas pruebas (una eliminada ya no tiene el prefijo en el correo). */
  const usuariosCreados: string[] = [];

  const iniciarSesion = async (correo: string, contrasena = CLAVE) => {
    const r = await request(servidor)
      .post('/api/autenticacion/inicio-sesion')
      .send({ correo_electronico: correo, contrasena });
    return r.body as { token_acceso: string; usuario: { id: string } };
  };

  const conToken = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Cuenta nueva de pasajero, con consentimiento de ubicacion. */
  const pasajeroNuevo = async () => {
    const correo = `${PREFIJO}${Date.now()}-${Math.round(Math.random() * 1e6)}@ejemplo.cl`;
    await request(servidor).post('/api/autenticacion/registro').send({
      nombre_completo: 'Persona de Prueba',
      correo_electronico: correo,
      contrasena: CLAVE_NUEVA,
      acepta_terminos: true,
    });
    const sesion = await iniciarSesion(correo, CLAVE_NUEVA);
    await request(servidor)
      .post('/api/usuarios/yo/consentimientos/geolocalizacion')
      .set(conToken(sesion.token_acceso));
    usuariosCreados.push(sesion.usuario.id);
    return { correo, id: sesion.usuario.id, token: sesion.token_acceso };
  };

  /** Busca un evento de auditoria; se escribe sin bloquear la respuesta, por eso espera hasta 2 s. */
  const eventoDe = async (filtro: Record<string, unknown>) => {
    for (let intento = 0; intento < 20; intento++) {
      const evento = await admin.mongo.collection('registro_eventos').findOne(filtro);
      if (evento) return evento;
      await new Promise((listo) => setTimeout(listo, 100));
    }
    return null;
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarAplicacion(app as NestExpressApplication);
    await app.init();
    servidor = app.getHttpServer() as Parameters<typeof request>[0];
    admin = await conectarComoAdmin(app);
    representante = (await iniciarSesion('representante@colectivos.ejemplo.cl')).token_acceso;
    administrador = (await iniciarSesion('admin@colectivos.ejemplo.cl')).token_acceso;
    pasajero = (await iniciarSesion('pasajero1@colectivos.ejemplo.cl')).token_acceso;
  });

  afterAll(async () => {
    const { rows: nuevos } = await admin.pg.query<{ id: string }>(
      `SELECT id FROM usuarios WHERE correo_electronico LIKE $1`,
      [`${PREFIJO}%`],
    );
    const ids = [...new Set([...nuevos.map((u) => u.id), ...usuariosCreados])];
    await admin.mongo.collection('avisos_espera').deleteMany({ pasajero_id: { $in: ids } });
    await admin.pg.query(`DELETE FROM reportes WHERE abordaje_id = ANY($1::uuid[])`, [abordajesCreados]);
    await admin.pg.query(`DELETE FROM abordajes WHERE id = ANY($1::uuid[])`, [abordajesCreados]);
    await admin.pg.query(`DELETE FROM jornadas WHERE conductor_id = ANY($1::uuid[])`, [ids]);
    await admin.pg.query(`DELETE FROM conductores WHERE usuario_id = ANY($1::uuid[])`, [ids]);
    await admin.pg.query(`DELETE FROM usuarios WHERE id = ANY($1::uuid[])`, [ids]);
    await admin.pg.query(`DELETE FROM tarifas WHERE nombre LIKE $1`, [`${TARIFA_PRUEBA}%`]);
    await admin.pg.query(`DELETE FROM vehiculos WHERE patente = $1`, [PATENTE_PRUEBA]);
    await admin.cerrar();
    await app.close();
  });

  describe('CU-12 Tarifas con historial', () => {
    it('el pasajero ve las tarifas vigentes del trazado (las muestra el mapa, CU-03)', async () => {
      const r = await request(servidor).get(`/api/trazados/${TRAZADO}/tarifas`).set(conToken(pasajero));
      expect(r.status).toBe(200);
      expect(r.body).toEqual(
        expect.arrayContaining([expect.objectContaining({ nombre: 'Recorrido completo', monto: 1500 })]),
      );
    });

    it('el representante crea una tarifa y le cambia el precio: queda el historial y una sola vigente', async () => {
      const ruta = `/api/trazados/${TRAZADO}/tarifas`;
      const creada = await request(servidor).post(ruta).set(conToken(representante)).send({ nombre: TARIFA_PRUEBA, monto: 1200 });
      const cambiada = await request(servidor).post(ruta).set(conToken(representante)).send({ nombre: TARIFA_PRUEBA, monto: 1300 });
      expect([creada.status, cambiada.status]).toEqual([201, 201]);

      const historial = await request(servidor).get(`${ruta}/historial`).set(conToken(representante));
      const deLaPrueba = (historial.body as { nombre: string; monto: number; vigente_hasta: string | null }[]).filter(
        (t) => t.nombre === TARIFA_PRUEBA,
      );
      expect(deLaPrueba).toHaveLength(2);
      expect(deLaPrueba.filter((t) => t.vigente_hasta === null).map((t) => t.monto)).toEqual([1300]);
    });

    it('el cambio de precio queda en la auditoria', async () => {
      const evento = await eventoDe({ tipo: 'cambio_tarifa', 'detalle.nombre': TARIFA_PRUEBA, 'detalle.monto_nuevo': 1300 });
      expect(evento?.detalle).toMatchObject({ monto_anterior: 1200 });
    });

    it('un monto fuera del rango acordado ($1.000 a $3.000) responde 400', async () => {
      const r = await request(servidor)
        .post(`/api/trazados/${TRAZADO}/tarifas`)
        .set(conToken(representante))
        .send({ nombre: TARIFA_PRUEBA, monto: 3500 });
      expect(r.status).toBe(400);
    });

    it('las tarifas de un trazado ajeno responden 404 y el pasajero no puede cambiarlas (403)', async () => {
      const ajeno = await request(servidor).get(`/api/trazados/${OTRO_TRAZADO}/tarifas/historial`).set(conToken(representante));
      const pasajeroCambia = await request(servidor)
        .post(`/api/trazados/${TRAZADO}/tarifas`)
        .set(conToken(pasajero))
        .send({ nombre: TARIFA_PRUEBA, monto: 1000 });
      expect([ajeno.status, pasajeroCambia.status]).toEqual([404, 403]);
    });
  });

  describe('CU-12 Flota del trazado', () => {
    it('el representante registra un vehiculo; la patente se normaliza y no se repite', async () => {
      const ruta = `/api/trazados/${TRAZADO}/vehiculos`;
      const datos = { patente: 'zz-zz-77', marca: 'Kia', modelo: 'Rio', anio: 2022, capacidad: 4 };
      const creado = await request(servidor).post(ruta).set(conToken(representante)).send(datos);
      const repetido = await request(servidor).post(ruta).set(conToken(representante)).send(datos);
      expect(creado.status).toBe(201);
      expect((creado.body as { patente: string }).patente).toBe(PATENTE_PRUEBA);
      expect(repetido.status).toBe(409);
    });

    it('una capacidad sobre el limite legal de 4 pasajeros responde 400', async () => {
      const r = await request(servidor)
        .post(`/api/trazados/${TRAZADO}/vehiculos`)
        .set(conToken(representante))
        .send({ patente: 'ZZZZ78', marca: 'Kia', modelo: 'Rio', anio: 2022, capacidad: 5 });
      expect(r.status).toBe(400);
    });

    it('da de baja un vehiculo libre, pero no uno que esta en una jornada abierta (409)', async () => {
      const lista = await request(servidor).get(`/api/trazados/${TRAZADO}/vehiculos`).set(conToken(representante));
      const prueba = (lista.body as { id: string; patente: string }[]).find((v) => v.patente === PATENTE_PRUEBA);
      const baja = await request(servidor)
        .patch(`/api/trazados/${TRAZADO}/vehiculos/${prueba?.id}`)
        .set(conToken(representante))
        .send({ activo: false });
      const enServicio = await request(servidor)
        .patch(`/api/trazados/${TRAZADO}/vehiculos/${VEHICULO_EN_SERVICIO}`)
        .set(conToken(representante))
        .send({ activo: false });
      expect([baja.status, enServicio.status]).toEqual([200, 409]);
    });

    it('crea la cuenta de un conductor; el conductor entra y abre su jornada', async () => {
      conductor.correo = `${PREFIJO}conductor-${Date.now()}@ejemplo.cl`;
      const creado = await request(servidor)
        .post(`/api/trazados/${TRAZADO}/conductores`)
        .set(conToken(representante))
        .send({ nombre_completo: 'Conductor de Prueba', correo_electronico: conductor.correo, contrasena: CLAVE_NUEVA });
      expect(creado.status).toBe(201);
      conductor.id = (creado.body as { usuario_id: string }).usuario_id;

      const sesion = await iniciarSesion(conductor.correo, CLAVE_NUEVA);
      conductor.token = sesion.token_acceso;
      await request(servidor).post('/api/usuarios/yo/consentimientos/geolocalizacion').set(conToken(conductor.token));
      const jornada = await request(servidor)
        .post('/api/jornadas')
        .set(conToken(conductor.token))
        .send({ vehiculo_id: VEHICULO_LIBRE, sentido_id: SENTIDO_IDA });
      expect(jornada.status).toBe(201);
      conductor.jornada = (jornada.body as { id: string }).id;
    });

    it('un correo que ya tiene cuenta responde 409 y una contrasena comun 400', async () => {
      const ruta = `/api/trazados/${TRAZADO}/conductores`;
      const repetido = await request(servidor)
        .post(ruta)
        .set(conToken(representante))
        .send({ nombre_completo: 'Otra Persona', correo_electronico: conductor.correo, contrasena: CLAVE_NUEVA });
      const comun = await request(servidor)
        .post(ruta)
        .set(conToken(representante))
        .send({ nombre_completo: 'Otra Persona', correo_electronico: `${PREFIJO}otro@ejemplo.cl`, contrasena: 'contrasena1234' });
      expect([repetido.status, comun.status]).toEqual([409, 400]);
    });

    it('el representante ve y cierra la jornada de su conductor; el conductor recibe "Jornada cerrada"', async () => {
      const abiertas = await request(servidor).get(`/api/trazados/${TRAZADO}/jornadas`).set(conToken(representante));
      expect((abiertas.body as { id: string }[]).map((j) => j.id)).toContain(conductor.jornada);
      const cierre = await request(servidor)
        .post(`/api/trazados/${TRAZADO}/jornadas/${conductor.jornada}/cierre`)
        .set(conToken(representante));
      expect(cierre.status).toBe(204);
      const actual = await request(servidor).get('/api/jornadas/actual').set(conToken(conductor.token));
      expect(actual.status).toBe(409);
    });

    it('si lo deshabilita con una jornada abierta, su siguiente accion la cierra (regla 8)', async () => {
      const otra = await request(servidor)
        .post('/api/jornadas')
        .set(conToken(conductor.token))
        .send({ vehiculo_id: VEHICULO_LIBRE, sentido_id: SENTIDO_IDA });
      expect(otra.status).toBe(201);
      const deshabilitado = await request(servidor)
        .patch(`/api/trazados/${TRAZADO}/conductores/${conductor.id}`)
        .set(conToken(representante))
        .send({ habilitado: false });
      expect(deshabilitado.status).toBe(204);
      const siguienteAccion = await request(servidor).get('/api/jornadas/actual').set(conToken(conductor.token));
      expect(siguienteAccion.status).toBe(409);
      expect((siguienteAccion.body as { message: string }).message).toBe('Jornada cerrada');
    });

    it('restablece la contrasena del conductor: la anterior deja de servir', async () => {
      const nueva = 'tetera-volcan-mapa-rio';
      const r = await request(servidor)
        .post(`/api/trazados/${TRAZADO}/conductores/${conductor.id}/contrasena`)
        .set(conToken(representante))
        .send({ contrasena: nueva });
      expect(r.status).toBe(204);
      const conLaAnterior = await request(servidor)
        .post('/api/autenticacion/inicio-sesion')
        .send({ correo_electronico: conductor.correo, contrasena: CLAVE_NUEVA });
      const conLaNueva = await request(servidor)
        .post('/api/autenticacion/inicio-sesion')
        .send({ correo_electronico: conductor.correo, contrasena: nueva });
      expect([conLaAnterior.status, conLaNueva.status]).toEqual([401, 200]);
    });
  });

  describe('CU-06 y CU-11 Reportes: el pasajero reporta y el representante gestiona', () => {
    let abordaje: string;
    let reporte: string;

    beforeAll(async () => {
      const { rows } = await admin.pg.query<{ id: string }>(
        `INSERT INTO abordajes (pasajero_id, jornada_id, sentido_id, distancia_al_vehiculo_m)
         VALUES ($1, $2, $3, 15) RETURNING id`,
        [PASAJERO1, JORNADA_ABIERTA, SENTIDO_IDA],
      );
      abordaje = rows[0].id;
      abordajesCreados.push(abordaje);
    });

    it('el pasajero reporta su viaje una sola vez (201 y luego 409)', async () => {
      const ruta = `/api/abordajes/${abordaje}/reporte`;
      const datos = { tipo: 'queja', categoria: 'uso_de_celular', descripcion: FORMULA };
      const primero = await request(servidor).post(ruta).set(conToken(pasajero)).send(datos);
      const segundo = await request(servidor).post(ruta).set(conToken(pasajero)).send(datos);
      expect([primero.status, segundo.status]).toEqual([201, 409]);
      reporte = (primero.body as { id: string }).id;
    });

    it('una descripcion de menos de 10 caracteres responde 400', async () => {
      const r = await request(servidor)
        .post(`/api/abordajes/${abordaje}/reporte`)
        .set(conToken(pasajero))
        .send({ tipo: 'queja', categoria: 'otro', descripcion: 'malo' });
      expect(r.status).toBe(400);
    });

    it('el representante ve el reporte de su trazado, sin datos de quien lo escribio', async () => {
      const r = await request(servidor)
        .get(`/api/trazados/${TRAZADO}/reportes?estado=pendiente`)
        .set(conToken(representante));
      expect(r.status).toBe(200);
      const reportes = r.body as Record<string, unknown>[];
      expect(reportes.map((x) => x.id)).toContain(reporte);
      expect(JSON.stringify(reportes)).not.toContain(PASAJERO1);
      expect(Object.keys(reportes[0])).not.toEqual(expect.arrayContaining(['pasajero_id']));
    });

    it('lo pasa a revision y lo cierra con respuesta; cerrar sin respuesta responde 422', async () => {
      const ruta = `/api/trazados/${TRAZADO}/reportes/${reporte}`;
      const revision = await request(servidor).patch(ruta).set(conToken(representante)).send({ estado: 'en_revision' });
      const sinRespuesta = await request(servidor).patch(ruta).set(conToken(representante)).send({ estado: 'cerrado' });
      const cerrado = await request(servidor)
        .patch(ruta)
        .set(conToken(representante))
        .send({ estado: 'cerrado', respuesta: 'Se converso con el conductor' });
      expect([revision.status, sinRespuesta.status, cerrado.status]).toEqual([200, 422, 200]);
      expect(await eventoDe({ tipo: 'cambio_estado_reporte', 'detalle.reporte_id': reporte, 'detalle.estado_nuevo': 'cerrado' })).not.toBeNull();
    });
  });

  describe('CU-10 Exportacion a CSV', () => {
    it('exporta los reportes y neutraliza la formula escrita por el pasajero (OWASP A05:2025)', async () => {
      const r = await request(servidor)
        .get(`/api/estadisticas/trazados/${TRAZADO}/reportes/csv`)
        .set(conToken(representante));
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toContain('text/csv');
      expect(r.text).toContain(`"'=HIPERVINCULO(`);
      expect(r.text).not.toMatch(/(^|;|\n)"?=HIPERVINCULO/);
    });

    it('exporta la demanda por tramo y hora', async () => {
      const r = await request(servidor)
        .get(`/api/estadisticas/trazados/${TRAZADO}/demanda/csv`)
        .set(conToken(representante));
      expect(r.status).toBe(200);
      expect(r.text.replace('﻿', '').split('\r\n')[0]).toBe('fecha;sentido;tramo;hora;avisos;personas');
    });

    it('un rango de mas de 31 dias responde 422', async () => {
      const r = await request(servidor)
        .get(`/api/estadisticas/trazados/${TRAZADO}/demanda/csv?desde=2026-01-01&hasta=2026-03-01`)
        .set(conToken(representante));
      expect(r.status).toBe(422);
    });
  });

  describe('CU-14 Revision de la auditoria por el administrador', () => {
    it('el administrador consulta los eventos por tipo', async () => {
      const r = await request(servidor).get('/api/auditoria?tipo=cambio_tarifa').set(conToken(administrador));
      expect(r.status).toBe(200);
      const { eventos } = r.body as { eventos: { tipo: string }[] };
      expect(eventos.length).toBeGreaterThan(0);
      expect(eventos.every((e) => e.tipo === 'cambio_tarifa')).toBe(true);
    });

    it('otro perfil no puede verla (403)', async () => {
      const r = await request(servidor).get('/api/auditoria').set(conToken(representante));
      expect(r.status).toBe(403);
    });

    it('un filtro con operadores de MongoDB se rechaza (400, OWASP A05:2025)', async () => {
      const r = await request(servidor).get('/api/auditoria?tipo[$ne]=x').set(conToken(administrador));
      expect(r.status).toBe(400);
    });
  });

  describe('Matriz de permisos del diseno y datos personales (Ley 21.719)', () => {
    it('el mapa lo ven todos los perfiles; el representante, solo su trazado', async () => {
      const ruta = `/api/tiempo-real/colectivos?sentido_id=${SENTIDO_IDA}`;
      const delRepresentante = await request(servidor).get(ruta).set(conToken(representante));
      const delAdministrador = await request(servidor).get(ruta).set(conToken(administrador));
      expect([delRepresentante.status, delAdministrador.status]).toEqual([200, 200]);
    });

    it('cada perfil edita su nombre y telefono; un telefono invalido responde 400', async () => {
      const valido = await request(servidor).patch('/api/usuarios/yo').set(conToken(representante)).send({ telefono: '+56911110002' });
      const invalido = await request(servidor).patch('/api/usuarios/yo').set(conToken(representante)).send({ telefono: 'llamame' });
      expect([valido.status, invalido.status]).toEqual([200, 400]);
      expect((valido.body as { telefono: string }).telefono).toBe('+56911110002');
    });

    it('el pasajero ve en sus viajes el estado y la respuesta de su reporte', async () => {
      const r = await request(servidor).get('/api/abordajes/mios').set(conToken(pasajero));
      const viaje = (r.body as { id: string; reporte_estado: string | null; reporte_respuesta: string | null }[]).find(
        (v) => v.id === abordajesCreados[0],
      );
      expect(viaje).toMatchObject({ reporte_estado: 'cerrado', reporte_respuesta: 'Se converso con el conductor' });
    });

    it('el representante ve los avisos de espera de su trazado sin identidad ni coordenadas', async () => {
      const persona = await pasajeroNuevo();
      const aviso = await request(servidor)
        .post('/api/avisos-espera')
        .set(conToken(persona.token))
        .send({ sentido_id: SENTIDO_IDA, latitud: -33.6062, longitud: -70.5764, personas: 3 });
      expect(aviso.status).toBe(201);
      const r = await request(servidor).get(`/api/trazados/${TRAZADO}/avisos`).set(conToken(representante));
      expect(r.status).toBe(200);
      expect(r.body).toEqual(expect.arrayContaining([expect.objectContaining({ sentido: 'ida', personas: 3 })]));
      expect(JSON.stringify(r.body)).not.toContain(persona.id);
      expect(JSON.stringify(r.body)).not.toContain('latitud');
    });

    it('el pasajero elimina su cuenta: se anonimiza, se borra su aviso y ya no puede entrar', async () => {
      const persona = await pasajeroNuevo();
      await request(servidor)
        .post('/api/avisos-espera')
        .set(conToken(persona.token))
        .send({ sentido_id: SENTIDO_IDA, latitud: -33.6062, longitud: -70.5764, personas: 1 });

      const malConfirmada = await request(servidor).delete('/api/usuarios/yo').set(conToken(persona.token)).send({ contrasena: 'no-es-la-clave' });
      const eliminada = await request(servidor).delete('/api/usuarios/yo').set(conToken(persona.token)).send({ contrasena: CLAVE_NUEVA });
      expect([malConfirmada.status, eliminada.status]).toEqual([422, 204]);

      const otraVez = await request(servidor)
        .post('/api/autenticacion/inicio-sesion')
        .send({ correo_electronico: persona.correo, contrasena: CLAVE_NUEVA });
      const conElMismoToken = await request(servidor).get('/api/usuarios/yo').set(conToken(persona.token));
      expect([otraVez.status, conElMismoToken.status]).toEqual([401, 401]);

      const { rows } = await admin.pg.query<{ nombre_completo: string; correo_electronico: string }>(
        `SELECT nombre_completo, correo_electronico FROM usuarios WHERE id = $1`,
        [persona.id],
      );
      expect(rows[0].nombre_completo).toBe('Cuenta eliminada');
      expect(rows[0].correo_electronico).not.toContain(PREFIJO);
      expect(await admin.mongo.collection('avisos_espera').countDocuments({ pasajero_id: persona.id })).toBe(0);
      expect(await eventoDe({ tipo: 'eliminacion_cuenta', usuario_id: persona.id })).not.toBeNull();
    });

    it('solo el pasajero puede eliminar su propia cuenta (403 para otros perfiles)', async () => {
      const r = await request(servidor).delete('/api/usuarios/yo').set(conToken(representante)).send({ contrasena: CLAVE });
      expect(r.status).toBe(403);
    });
  });
});
