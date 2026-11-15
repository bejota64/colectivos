import { Injectable } from '@nestjs/common';
import { BaseDatosServicio } from '../../comun/base-datos/base-datos.servicio';
import {
  codigoDeError,
  VIOLACION_DE_UNICIDAD,
} from '../../comun/base-datos/errores-postgres';

export interface ConductorFila {
  usuario_id: string;
  trazado_id: string;
  habilitado: boolean;
}

export interface VehiculoFila {
  id: string;
  patente: string;
  marca: string;
  modelo: string;
  capacidad: number;
}

/** Vehiculo como lo ve el representante, con su estado. */
export interface VehiculoGestionFila extends VehiculoFila {
  anio: number;
  activo: boolean;
  en_servicio: boolean;
}

/** Conductor como lo ve el representante. */
export interface ConductorGestionFila {
  usuario_id: string;
  nombre_completo: string;
  correo_electronico: string;
  habilitado: boolean;
  en_servicio: boolean;
}

const EN_SERVICIO_VEHICULO = `EXISTS (SELECT 1 FROM jornadas j
  WHERE j.vehiculo_id = v.id AND j.finalizada_en IS NULL)`;

@Injectable()
export class FlotaRepositorio {
  constructor(private readonly baseDatos: BaseDatosServicio) {}

  async buscarConductor(usuarioId: string): Promise<ConductorFila | null> {
    const filas = await this.baseDatos.consultar<ConductorFila>(
      `SELECT usuario_id, trazado_id, habilitado FROM conductores WHERE usuario_id = $1`,
      [usuarioId],
    );
    return filas[0] ?? null;
  }

  /**
   * Vehiculo activo SOLO si es del trazado indicado (regla 2 del LEEME:
   * conductor y vehiculo deben ser del mismo trazado). Si es de otro
   * trazado devuelve null, igual que si no existiera.
   */
  async buscarVehiculoDeTrazado(
    vehiculoId: string,
    trazadoId: string,
  ): Promise<VehiculoFila | null> {
    const filas = await this.baseDatos.consultar<VehiculoFila>(
      `SELECT id, patente, marca, modelo, capacidad
       FROM vehiculos
       WHERE id = $1 AND trazado_id = $2 AND activo`,
      [vehiculoId, trazadoId],
    );
    return filas[0] ?? null;
  }

  /** Vehiculos del trazado que no estan en una jornada abierta. */
  listarDisponibles(trazadoId: string): Promise<VehiculoFila[]> {
    return this.baseDatos.consultar<VehiculoFila>(
      `SELECT v.id, v.patente, v.marca, v.modelo, v.capacidad
       FROM vehiculos v
       WHERE v.trazado_id = $1 AND v.activo
         AND NOT EXISTS (
           SELECT 1 FROM jornadas j
           WHERE j.vehiculo_id = v.id AND j.finalizada_en IS NULL)
       ORDER BY v.patente`,
      [trazadoId],
    );
  }

  // ------------------------------------------------------------------
  // Gestion de la flota por el representante (CU-12). Todas las
  // consultas filtran por el trazado, que el servicio ya verifico que es
  // del representante.
  // ------------------------------------------------------------------

  listarVehiculos(trazadoId: string): Promise<VehiculoGestionFila[]> {
    return this.baseDatos.consultar<VehiculoGestionFila>(
      `SELECT v.id, v.patente, v.marca, v.modelo, v.anio, v.capacidad, v.activo,
              ${EN_SERVICIO_VEHICULO} AS en_servicio
       FROM vehiculos v
       WHERE v.trazado_id = $1
       ORDER BY v.activo DESC, v.patente`,
      [trazadoId],
    );
  }

  /** Devuelve null si la patente ya existe (en cualquier trazado). */
  async crearVehiculo(
    trazadoId: string,
    datos: { patente: string; marca: string; modelo: string; anio: number; capacidad: number },
  ): Promise<VehiculoGestionFila | null> {
    try {
      const filas = await this.baseDatos.consultar<VehiculoGestionFila>(
        `INSERT INTO vehiculos (trazado_id, patente, marca, modelo, anio, capacidad)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, patente, marca, modelo, anio, capacidad, activo, false AS en_servicio`,
        [trazadoId, datos.patente, datos.marca, datos.modelo, datos.anio, datos.capacidad],
      );
      return filas[0];
    } catch (error) {
      if (codigoDeError(error) === VIOLACION_DE_UNICIDAD) {
        return null;
      }
      throw error;
    }
  }

  async buscarVehiculoGestion(
    vehiculoId: string,
    trazadoId: string,
  ): Promise<VehiculoGestionFila | null> {
    const filas = await this.baseDatos.consultar<VehiculoGestionFila>(
      `SELECT v.id, v.patente, v.marca, v.modelo, v.anio, v.capacidad, v.activo,
              ${EN_SERVICIO_VEHICULO} AS en_servicio
       FROM vehiculos v
       WHERE v.id = $1 AND v.trazado_id = $2`,
      [vehiculoId, trazadoId],
    );
    return filas[0] ?? null;
  }

  /**
   * Cambia solo los campos enviados (coalesce deja el valor actual). La
   * condicion "no esta en una jornada abierta" va dentro del UPDATE: si
   * el auto salio a trabajar entre medio, no cambia nada y devuelve null.
   */
  async actualizarVehiculo(
    vehiculoId: string,
    trazadoId: string,
    cambios: { marca?: string; modelo?: string; anio?: number; capacidad?: number; activo?: boolean },
  ): Promise<VehiculoGestionFila | null> {
    const filas = await this.baseDatos.consultar<VehiculoGestionFila>(
      `UPDATE vehiculos v SET
         marca = coalesce($3, v.marca),
         modelo = coalesce($4, v.modelo),
         anio = coalesce($5, v.anio),
         capacidad = coalesce($6, v.capacidad),
         activo = coalesce($7, v.activo)
       WHERE v.id = $1 AND v.trazado_id = $2 AND NOT ${EN_SERVICIO_VEHICULO}
       RETURNING v.id, v.patente, v.marca, v.modelo, v.anio, v.capacidad, v.activo,
                 false AS en_servicio`,
      [
        vehiculoId,
        trazadoId,
        cambios.marca ?? null,
        cambios.modelo ?? null,
        cambios.anio ?? null,
        cambios.capacidad ?? null,
        cambios.activo ?? null,
      ],
    );
    return filas[0] ?? null;
  }

  listarConductores(trazadoId: string): Promise<ConductorGestionFila[]> {
    return this.baseDatos.consultar<ConductorGestionFila>(
      `SELECT c.usuario_id, u.nombre_completo, u.correo_electronico, c.habilitado,
              EXISTS (SELECT 1 FROM jornadas j
                      WHERE j.conductor_id = c.usuario_id AND j.finalizada_en IS NULL) AS en_servicio
       FROM conductores c
       JOIN usuarios u ON u.id = c.usuario_id
       WHERE c.trazado_id = $1 AND u.eliminado_en IS NULL
       ORDER BY u.nombre_completo`,
      [trazadoId],
    );
  }

  /**
   * Crea la cuenta del conductor y su registro en el trazado, en UNA
   * transaccion: o se guardan ambas cosas o ninguna. El rol va escrito en
   * el SQL. Devuelve null si el correo ya tiene cuenta.
   */
  async crearConductor(
    trazadoId: string,
    datos: { nombreCompleto: string; correo: string; contrasenaHash: string },
  ): Promise<ConductorGestionFila | null> {
    try {
      return await this.baseDatos.enTransaccion(async (consultar) => {
        const [usuario] = await consultar<{ id: string }>(
          `INSERT INTO usuarios (nombre_completo, correo_electronico, contrasena_hash, rol)
           VALUES ($1, $2, $3, 'conductor')
           RETURNING id`,
          [datos.nombreCompleto, datos.correo, datos.contrasenaHash],
        );
        await consultar(
          `INSERT INTO conductores (usuario_id, trazado_id) VALUES ($1, $2)`,
          [usuario.id, trazadoId],
        );
        return {
          usuario_id: usuario.id,
          nombre_completo: datos.nombreCompleto,
          correo_electronico: datos.correo,
          habilitado: true,
          en_servicio: false,
        };
      });
    } catch (error) {
      if (codigoDeError(error) === VIOLACION_DE_UNICIDAD) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Nueva contrasena para un conductor del trazado, y cierra todas sus
   * sesiones (politica del diseno: cambiar la contrasena revoca todos los
   * tokens de refresco). false si no es conductor de ese trazado.
   */
  restablecerContrasena(
    conductorId: string,
    trazadoId: string,
    contrasenaHash: string,
  ): Promise<boolean> {
    return this.baseDatos.enTransaccion(async (consultar) => {
      const filas = await consultar<{ id: string }>(
        `UPDATE usuarios u SET contrasena_hash = $3
         FROM conductores c
         WHERE c.usuario_id = u.id AND u.id = $1 AND c.trazado_id = $2
           AND u.eliminado_en IS NULL
         RETURNING u.id`,
        [conductorId, trazadoId, contrasenaHash],
      );
      if (filas.length === 0) {
        return false;
      }
      await consultar(
        `UPDATE tokens_refresco SET revocado_en = now()
         WHERE usuario_id = $1 AND revocado_en IS NULL`,
        [conductorId],
      );
      return true;
    });
  }

  /** Habilita o deshabilita un conductor del trazado. false si no es del trazado. */
  async cambiarHabilitado(
    conductorId: string,
    trazadoId: string,
    habilitado: boolean,
  ): Promise<boolean> {
    const filas = await this.baseDatos.consultar<{ usuario_id: string }>(
      `UPDATE conductores SET habilitado = $3
       WHERE usuario_id = $1 AND trazado_id = $2
       RETURNING usuario_id`,
      [conductorId, trazadoId, habilitado],
    );
    return filas.length > 0;
  }
}
