import { UnprocessableEntityException } from '@nestjs/common';
import { crearAuditoriaFalsa } from '../../../test/datos/recorrido-9001';
import type { MongoServicio } from '../../comun/mongo/mongo.servicio';
import type { AuditoriaServicio } from '../auditoria/auditoria.servicio';
import type { UsuarioFila, UsuariosRepositorio } from '../usuarios/usuarios.repositorio';
import type { ContrasenasServicio } from './contrasenas.servicio';
import { CuentaServicio } from './cuenta.servicio';

describe('CuentaServicio: eliminar la cuenta propia (Ley 21.719)', () => {
  let anonimizada: boolean;
  let avisosBorrados: unknown[];
  let auditoria: ReturnType<typeof crearAuditoriaFalsa>;
  let servicio: CuentaServicio;

  beforeEach(() => {
    anonimizada = false;
    avisosBorrados = [];
    auditoria = crearAuditoriaFalsa();
    servicio = new CuentaServicio(
      {
        buscarPorId: (id: string) =>
          Promise.resolve({ id, contrasena_hash: 'hash-correcto', rol: 'pasajero', activo: true } as UsuarioFila),
        anonimizar: () => {
          anonimizada = true;
          return Promise.resolve(true);
        },
      } as unknown as UsuariosRepositorio,
      {
        coincide: (contrasena: string, hash: string) =>
          Promise.resolve(hash === 'hash-correcto' && contrasena === 'la-clave-correcta'),
      } as unknown as ContrasenasServicio,
      {
        coleccion: () => ({
          deleteMany: (filtro: unknown) => {
            avisosBorrados.push(filtro);
            return Promise.resolve({ deletedCount: 1 });
          },
        }),
      } as unknown as MongoServicio,
      auditoria as unknown as AuditoriaServicio,
    );
  });

  it('con la contrasena correcta anonimiza, borra su aviso y deja el evento sin datos personales', async () => {
    await servicio.eliminarPropia('pasajero-1', 'la-clave-correcta');
    expect(anonimizada).toBe(true);
    expect(avisosBorrados).toEqual([{ pasajero_id: 'pasajero-1' }]);
    expect(auditoria.eventos[0]).toEqual({ tipo: 'eliminacion_cuenta', usuarioId: 'pasajero-1', ip: undefined });
  });

  it('con otra contrasena responde 422 y no toca la cuenta (un token robado no basta)', async () => {
    await expect(servicio.eliminarPropia('pasajero-1', 'otra')).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(anonimizada).toBe(false);
    expect(avisosBorrados).toHaveLength(0);
  });
});
