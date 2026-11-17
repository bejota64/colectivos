import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type {
  UsuarioFila,
  UsuariosRepositorio,
} from '../../modulos/usuarios/usuarios.repositorio';
import { Publico } from '../decoradores/publico.decorador';
import type { UsuarioSesion } from '../tipos';
import { SesionGuard } from './sesion.guard';

/**
 * Pruebas del guard de sesion (Eva 4, OWASP A07:2025). En la Eva 3 solo
 * se probaba por HTTP; aqui se cubren los casos que no tenian prueba
 * propia: cuenta desactivada con un token todavia vigente, y token
 * vencido, sin firma o firmado con otro secreto.
 */
class RutasDePrueba {
  @Publico()
  abierta() {}

  protegida() {}
}

describe('SesionGuard', () => {
  const SECRETO = 'secreto-de-prueba-de-al-menos-32-caracteres-xx';
  const jwt = new JwtService({
    secret: SECRETO,
    signOptions: { expiresIn: '15m', algorithm: 'HS256' },
    verifyOptions: { algorithms: ['HS256'] },
  });

  let usuarios: Map<string, UsuarioFila>;
  let guard: SesionGuard;

  const usuario = (id: string, rol: UsuarioFila['rol'], activo = true): UsuarioFila => ({
    id,
    nombre_completo: 'Persona de Prueba',
    correo_electronico: `${id}@ejemplo.cl`,
    contrasena_hash: 'x',
    rol,
    activo,
  });

  const contexto = (metodo: keyof RutasDePrueba, autorizacion?: string) => {
    const peticion: { headers: Record<string, string>; usuario?: UsuarioSesion } = {
      headers: autorizacion ? { authorization: autorizacion } : {},
    };
    const ctx = {
      getHandler: () => RutasDePrueba.prototype[metodo],
      getClass: () => RutasDePrueba,
      switchToHttp: () => ({ getRequest: () => peticion }),
    } as unknown as ExecutionContext;
    return { ctx, peticion };
  };

  beforeEach(() => {
    usuarios = new Map([
      ['pasajero-1', usuario('pasajero-1', 'pasajero')],
      ['conductor-baja', usuario('conductor-baja', 'conductor', false)],
    ]);
    guard = new SesionGuard(new Reflector(), jwt, {
      buscarPorId: (id: string) => Promise.resolve(usuarios.get(id) ?? null),
    } as unknown as UsuariosRepositorio);
  });

  it('una ruta @Publico() pasa sin token', async () => {
    await expect(guard.canActivate(contexto('abierta').ctx)).resolves.toBe(true);
  });

  it('sin token responde 401', async () => {
    await expect(guard.canActivate(contexto('protegida').ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('un esquema distinto de Bearer responde 401', async () => {
    const token = jwt.sign({ sub: 'pasajero-1' });
    await expect(
      guard.canActivate(contexto('protegida', `Basic ${token}`).ctx),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('A07: un token vencido responde 401', async () => {
    const vencido = jwt.sign({ sub: 'pasajero-1' }, { expiresIn: -60 });
    await expect(
      guard.canActivate(contexto('protegida', `Bearer ${vencido}`).ctx),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('A07: un token firmado con otro secreto responde 401', async () => {
    const falso = new JwtService({ secret: 'otro-secreto-de-al-menos-32-caracteres-yy' }).sign({
      sub: 'pasajero-1',
    });
    await expect(
      guard.canActivate(contexto('protegida', `Bearer ${falso}`).ctx),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('A07: un token sin firma (alg none) responde 401', async () => {
    const parte = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const sinFirma = `${parte({ alg: 'none', typ: 'JWT' })}.${parte({ sub: 'pasajero-1' })}.`;
    await expect(
      guard.canActivate(contexto('protegida', `Bearer ${sinFirma}`).ctx),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('A07: una cuenta desactivada no entra aunque su token siga vigente', async () => {
    const vigente = jwt.sign({ sub: 'conductor-baja' });
    await expect(
      guard.canActivate(contexto('protegida', `Bearer ${vigente}`).ctx),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('el rol sale de la base y no del token', async () => {
    const conRolFalso = jwt.sign({ sub: 'pasajero-1', rol: 'administrador' });
    const { ctx, peticion } = contexto('protegida', `Bearer ${conRolFalso}`);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(peticion.usuario).toEqual({ id: 'pasajero-1', rol: 'pasajero' });
  });
});
