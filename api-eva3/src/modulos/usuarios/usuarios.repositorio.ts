import { Injectable } from '@nestjs/common';
import { BaseDatosServicio } from '../../comun/base-datos/base-datos.servicio';
import { Rol } from '../../comun/tipos';

export interface UsuarioFila {
  id: string;
  nombre_completo: string;
  correo_electronico: string;
  contrasena_hash: string;
  rol: Rol;
  activo: boolean;
}

export interface PerfilFila {
  id: string;
  nombre_completo: string;
  correo_electronico: string;
  rol: Rol;
  telefono: string | null;
}

const COLUMNAS =
  'id, nombre_completo, correo_electronico, contrasena_hash, rol, activo';

/** Codigo de PostgreSQL para "valor duplicado en una columna unica". */
const VIOLACION_DE_UNICIDAD = '23505';

@Injectable()
export class UsuariosRepositorio {
  constructor(private readonly baseDatos: BaseDatosServicio) {}

  async buscarPorCorreo(correo: string): Promise<UsuarioFila | null> {
    const filas = await this.baseDatos.consultar<UsuarioFila>(
      `SELECT ${COLUMNAS} FROM usuarios WHERE correo_electronico = $1 AND eliminado_en IS NULL`,
      [correo],
    );
    return filas[0] ?? null;
  }

  async buscarPorId(id: string): Promise<UsuarioFila | null> {
    const filas = await this.baseDatos.consultar<UsuarioFila>(
      `SELECT ${COLUMNAS} FROM usuarios WHERE id = $1 AND eliminado_en IS NULL`,
      [id],
    );
    return filas[0] ?? null;
  }

  /**
   * Crea un pasajero y registra su consentimiento en UNA sola sentencia:
   * o se guardan ambas cosas o ninguna. Devuelve null si el correo ya existe.
   * El rol va escrito en el SQL: nunca viene del cliente.
   *
   * Aqui se registran solo los terminos y la politica de privacidad, que es
   * lo que la persona acepto en el formulario. El consentimiento de
   * geolocalizacion NO se agrega en el registro: se pide aparte, la primera
   * vez que la persona usa una funcion que envia su ubicacion.
   */
  async crearPasajero(datos: {
    nombreCompleto: string;
    correo: string;
    contrasenaHash: string;
    versionPolitica: string;
  }): Promise<UsuarioFila | null> {
    try {
      const filas = await this.baseDatos.consultar<UsuarioFila>(
        `WITH nuevo AS (
           INSERT INTO usuarios (nombre_completo, correo_electronico, contrasena_hash, rol)
           VALUES ($1, $2, $3, 'pasajero')
           RETURNING ${COLUMNAS}
         ), consentimiento AS (
           INSERT INTO consentimientos (usuario_id, tipo, version_politica)
           SELECT nuevo.id, tipo, $4
           FROM nuevo, unnest(ARRAY['terminos_de_uso', 'politica_de_privacidad']) AS tipo
         )
         SELECT ${COLUMNAS} FROM nuevo`,
        [
          datos.nombreCompleto,
          datos.correo,
          datos.contrasenaHash,
          datos.versionPolitica,
        ],
      );
      return filas[0] ?? null;
    } catch (error) {
      if ((error as { code?: string }).code === VIOLACION_DE_UNICIDAD) {
        return null;
      }
      throw error;
    }
  }

  /** Perfil propio: solo nombre y telefono. El correo y el rol no se cambian aqui. */
  async actualizarPerfil(
    usuarioId: string,
    cambios: { nombreCompleto?: string; telefono?: string },
  ): Promise<PerfilFila | null> {
    const filas = await this.baseDatos.consultar<PerfilFila>(
      `UPDATE usuarios SET
         nombre_completo = coalesce($2, nombre_completo),
         telefono = coalesce($3, telefono)
       WHERE id = $1 AND eliminado_en IS NULL
       RETURNING id, nombre_completo, correo_electronico, rol, telefono`,
      [usuarioId, cambios.nombreCompleto ?? null, cambios.telefono ?? null],
    );
    return filas[0] ?? null;
  }

  /**
   * Derecho de supresion (Ley 21.719): la cuenta se anonimiza en vez de
   * borrarse, para que el historial de viajes, calificaciones y reportes
   * siga siendo consistente, pero ya no identifica a nadie. En la misma
   * transaccion se revocan sus consentimientos y se cierran sus sesiones.
   */
  anonimizar(usuarioId: string): Promise<boolean> {
    return this.baseDatos.enTransaccion(async (consultar) => {
      const filas = await consultar<{ id: string }>(
        `UPDATE usuarios SET
           nombre_completo = 'Cuenta eliminada',
           correo_electronico = 'eliminada-' || id || '@colectivos.invalid',
           contrasena_hash = '!',
           telefono = NULL,
           activo = false,
           eliminado_en = now()
         WHERE id = $1 AND eliminado_en IS NULL
         RETURNING id`,
        [usuarioId],
      );
      if (filas.length === 0) {
        return false;
      }
      await consultar(
        `UPDATE consentimientos SET revocado_en = now()
         WHERE usuario_id = $1 AND revocado_en IS NULL`,
        [usuarioId],
      );
      await consultar(
        `UPDATE tokens_refresco SET revocado_en = now()
         WHERE usuario_id = $1 AND revocado_en IS NULL`,
        [usuarioId],
      );
      return true;
    });
  }
}
