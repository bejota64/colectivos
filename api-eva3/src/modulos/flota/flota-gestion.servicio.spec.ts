import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { crearAuditoriaFalsa, IDS } from '../../../test/datos/recorrido-9001';
import type { AuditoriaServicio } from '../auditoria/auditoria.servicio';
import type { ContrasenasServicio } from '../autenticacion/contrasenas.servicio';
import { PertenenciaServicio } from '../trazados/pertenencia.servicio';
import type { TrazadosRepositorio } from '../trazados/trazados.repositorio';
import { FlotaGestionServicio } from './flota-gestion.servicio';
import type { FlotaRepositorio, VehiculoGestionFila } from './flota.repositorio';

describe('FlotaGestionServicio (CU-12)', () => {
  const sesion = { representanteId: IDS.representante, ip: '203.0.113.20' };
  let vehiculos: VehiculoGestionFila[];
  let correos: Set<string>;
  let hashes: Map<string, string>;
  let auditoria: ReturnType<typeof crearAuditoriaFalsa>;
  let servicio: FlotaGestionServicio;

  const auto = (patente: string, enServicio = false): VehiculoGestionFila => ({
    id: `v-${patente}`,
    patente,
    marca: 'Nissan',
    modelo: 'Versa',
    anio: 2021,
    capacidad: 4,
    activo: true,
    en_servicio: enServicio,
  });

  beforeEach(() => {
    vehiculos = [auto('ZZZZ01', true), auto('ZZZZ02')];
    correos = new Set(['ocupado@ejemplo.cl']);
    hashes = new Map();
    auditoria = crearAuditoriaFalsa();
    const flota = {
      crearVehiculo: (_t: string, d: { patente: string }) => {
        if (vehiculos.some((v) => v.patente === d.patente)) return Promise.resolve(null);
        const nuevo = auto(d.patente);
        vehiculos.push(nuevo);
        return Promise.resolve(nuevo);
      },
      buscarVehiculoGestion: (id: string) => Promise.resolve(vehiculos.find((v) => v.id === id) ?? null),
      actualizarVehiculo: (id: string, _t: string, c: { activo?: boolean }) => {
        const v = vehiculos.find((x) => x.id === id && !x.en_servicio);
        if (v && c.activo !== undefined) v.activo = c.activo;
        return Promise.resolve(v ?? null);
      },
      crearConductor: (_t: string, d: { nombreCompleto: string; correo: string; contrasenaHash: string }) => {
        if (correos.has(d.correo)) return Promise.resolve(null);
        correos.add(d.correo);
        hashes.set('u-1', d.contrasenaHash);
        return Promise.resolve({
          usuario_id: 'u-1',
          nombre_completo: d.nombreCompleto,
          correo_electronico: d.correo,
          habilitado: true,
          en_servicio: false,
        });
      },
      restablecerContrasena: (id: string, _t: string, hash: string) => {
        if (id !== IDS.conductor1) return Promise.resolve(false);
        hashes.set(id, hash);
        return Promise.resolve(true);
      },
      cambiarHabilitado: (id: string) => Promise.resolve(id === IDS.conductor1),
    } as unknown as FlotaRepositorio;
    const pertenencia = new PertenenciaServicio(
      {
        esDeRepresentante: (t: string, r: string) => Promise.resolve(t === IDS.trazado && r === IDS.representante),
      } as unknown as TrazadosRepositorio,
      auditoria as unknown as AuditoriaServicio,
    );
    const contrasenas = {
      revisarPolitica: (c: string) => (c.length < 12 ? 'La contraseña debe tener al menos 12 caracteres' : null),
      generarHash: (c: string) => Promise.resolve(`hash-de:${c}`),
    } as unknown as ContrasenasServicio;
    servicio = new FlotaGestionServicio(
      flota,
      pertenencia,
      auditoria as unknown as AuditoriaServicio,
      contrasenas,
    );
  });

  it('crea un vehiculo y lo deja en la auditoria', async () => {
    const v = await servicio.crearVehiculo(
      IDS.trazado,
      { patente: 'ZZZZ05', marca: 'Kia', modelo: 'Rio', anio: 2022, capacidad: 4 },
      sesion,
    );
    expect(v.patente).toBe('ZZZZ05');
    expect(auditoria.eventos[0]).toMatchObject({ tipo: 'cambio_datos_maestros', detalle: { entidad: 'vehiculo' } });
  });

  it('una patente repetida responde 409', async () => {
    await expect(
      servicio.crearVehiculo(IDS.trazado, { patente: 'ZZZZ02', marca: 'X', modelo: 'Y', anio: 2020, capacidad: 4 }, sesion),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('no se cambia un vehiculo que esta en una jornada abierta (409)', async () => {
    await expect(
      servicio.actualizarVehiculo(IDS.trazado, 'v-ZZZZ01', { activo: false }, sesion),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(vehiculos[0].activo).toBe(true);
  });

  it('da de baja un vehiculo libre', async () => {
    const v = await servicio.actualizarVehiculo(IDS.trazado, 'v-ZZZZ02', { activo: false }, sesion);
    expect(v.activo).toBe(false);
  });

  const nuevo = { nombreCompleto: 'Persona Nueva', correo: 'nueva@ejemplo.cl', contrasena: 'una-clave-bien-larga' };

  it('crea la cuenta del conductor con la contrasena en hash, y queda auditado', async () => {
    const c = await servicio.crearConductor(IDS.trazado, nuevo, sesion);
    expect(c.habilitado).toBe(true);
    expect(hashes.get('u-1')).toBe('hash-de:una-clave-bien-larga');
    expect(auditoria.eventos[0].detalle).toMatchObject({ entidad: 'conductor', accion: 'crear' });
    expect(JSON.stringify(auditoria.eventos)).not.toContain('una-clave-bien-larga');
  });

  it('una contrasena que no cumple la politica responde 400 y no crea la cuenta', async () => {
    await expect(
      servicio.crearConductor(IDS.trazado, { ...nuevo, contrasena: 'corta' }, sesion),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(correos.has(nuevo.correo)).toBe(false);
  });

  it('un correo que ya tiene cuenta responde 409', async () => {
    await expect(
      servicio.crearConductor(IDS.trazado, { ...nuevo, correo: 'ocupado@ejemplo.cl' }, sesion),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('restablece la contrasena de un conductor de su trazado, sin guardarla en la auditoria', async () => {
    await servicio.restablecerContrasena(IDS.trazado, IDS.conductor1, 'otra-clave-bien-larga', sesion);
    expect(hashes.get(IDS.conductor1)).toBe('hash-de:otra-clave-bien-larga');
    expect(JSON.stringify(auditoria.eventos)).not.toContain('otra-clave-bien-larga');
  });

  it('restablecer la contrasena de alguien que no es conductor del trazado responde 404', async () => {
    await expect(
      servicio.restablecerContrasena(IDS.trazado, 'otro', 'otra-clave-bien-larga', sesion),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deshabilitar un conductor queda en la auditoria', async () => {
    await servicio.cambiarHabilitado(IDS.trazado, IDS.conductor1, false, sesion);
    expect(auditoria.eventos[0].detalle).toMatchObject({ accion: 'deshabilitar', conductor_id: IDS.conductor1 });
  });

  it('la flota de un trazado ajeno responde 404 y queda auditado', async () => {
    await expect(servicio.listarVehiculos(IDS.otroTrazado, sesion)).rejects.toBeInstanceOf(NotFoundException);
    expect(auditoria.eventos[0].tipo).toBe('acceso_denegado');
  });
});
