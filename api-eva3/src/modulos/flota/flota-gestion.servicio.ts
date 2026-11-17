import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditoriaServicio } from '../auditoria/auditoria.servicio';
import { ContrasenasServicio } from '../autenticacion/contrasenas.servicio';
import { PertenenciaServicio } from '../trazados/pertenencia.servicio';
import { FlotaRepositorio } from './flota.repositorio';

type Sesion = { representanteId: string; ip?: string };

/**
 * Gestion de vehiculos y conductores por el representante (CU-12).
 * Rol + pertenencia en cada operacion, y cada cambio queda en la
 * auditoria como cambio_datos_maestros.
 */
@Injectable()
export class FlotaGestionServicio {
  constructor(
    private readonly flota: FlotaRepositorio,
    private readonly pertenencia: PertenenciaServicio,
    private readonly auditoria: AuditoriaServicio,
    private readonly contrasenas: ContrasenasServicio,
  ) {}

  private exigirPropio(trazadoId: string, sesion: Sesion, accion: string) {
    return this.pertenencia.exigirTrazadoPropio(trazadoId, sesion.representanteId, accion, sesion.ip);
  }

  private registrar(sesion: Sesion, detalle: Record<string, unknown>) {
    return this.auditoria.registrar({
      tipo: 'cambio_datos_maestros',
      usuarioId: sesion.representanteId,
      ip: sesion.ip,
      detalle,
    });
  }

  async listarVehiculos(trazadoId: string, sesion: Sesion) {
    await this.exigirPropio(trazadoId, sesion, 'ver_flota');
    return this.flota.listarVehiculos(trazadoId);
  }

  async crearVehiculo(
    trazadoId: string,
    datos: { patente: string; marca: string; modelo: string; anio: number; capacidad: number },
    sesion: Sesion,
  ) {
    await this.exigirPropio(trazadoId, sesion, 'crear_vehiculo');
    const vehiculo = await this.flota.crearVehiculo(trazadoId, datos);
    if (!vehiculo) {
      throw new ConflictException('Ya existe un vehiculo con esa patente');
    }
    await this.registrar(sesion, {
      entidad: 'vehiculo',
      accion: 'crear',
      trazado_id: trazadoId,
      vehiculo_id: vehiculo.id,
      patente: vehiculo.patente,
    });
    return vehiculo;
  }

  async actualizarVehiculo(
    trazadoId: string,
    vehiculoId: string,
    cambios: { marca?: string; modelo?: string; anio?: number; capacidad?: number; activo?: boolean },
    sesion: Sesion,
  ) {
    await this.exigirPropio(trazadoId, sesion, 'cambiar_vehiculo');
    const actual = await this.flota.buscarVehiculoGestion(vehiculoId, trazadoId);
    if (!actual) {
      throw new NotFoundException('Vehiculo no encontrado');
    }
    if (actual.en_servicio) {
      throw new ConflictException('El vehiculo esta en una jornada abierta: espera a que termine');
    }
    const vehiculo = await this.flota.actualizarVehiculo(vehiculoId, trazadoId, cambios);
    if (!vehiculo) {
      throw new ConflictException('El vehiculo esta en una jornada abierta: espera a que termine');
    }
    await this.registrar(sesion, {
      entidad: 'vehiculo',
      accion: 'cambiar',
      trazado_id: trazadoId,
      vehiculo_id: vehiculoId,
      cambios,
    });
    return vehiculo;
  }

  async listarConductores(trazadoId: string, sesion: Sesion) {
    await this.exigirPropio(trazadoId, sesion, 'ver_flota');
    return this.flota.listarConductores(trazadoId);
  }

  /** Misma politica de contrasenas que el registro (NIST SP 800-63B). */
  private exigirPolitica(contrasena: string): void {
    const motivo = this.contrasenas.revisarPolitica(contrasena, 'conductor');
    if (motivo) {
      throw new BadRequestException(motivo);
    }
  }

  async crearConductor(
    trazadoId: string,
    datos: { nombreCompleto: string; correo: string; contrasena: string },
    sesion: Sesion,
  ) {
    await this.exigirPropio(trazadoId, sesion, 'crear_conductor');
    this.exigirPolitica(datos.contrasena);
    const conductor = await this.flota.crearConductor(trazadoId, {
      nombreCompleto: datos.nombreCompleto,
      correo: datos.correo,
      contrasenaHash: await this.contrasenas.generarHash(datos.contrasena),
    });
    if (!conductor) {
      throw new ConflictException('Ya existe una cuenta con ese correo');
    }
    await this.registrar(sesion, {
      entidad: 'conductor',
      accion: 'crear',
      trazado_id: trazadoId,
      conductor_id: conductor.usuario_id,
    });
    return conductor;
  }

  /** La contrasena nueva nunca se guarda en la auditoria ni en el registro del servidor. */
  async restablecerContrasena(
    trazadoId: string,
    conductorId: string,
    contrasena: string,
    sesion: Sesion,
  ): Promise<void> {
    await this.exigirPropio(trazadoId, sesion, 'restablecer_contrasena');
    this.exigirPolitica(contrasena);
    const hash = await this.contrasenas.generarHash(contrasena);
    if (!(await this.flota.restablecerContrasena(conductorId, trazadoId, hash))) {
      throw new NotFoundException('Conductor no encontrado');
    }
    await this.registrar(sesion, {
      entidad: 'conductor',
      accion: 'restablecer_contrasena',
      trazado_id: trazadoId,
      conductor_id: conductorId,
    });
  }

  /**
   * Deshabilitar tiene efecto inmediato: el conductor no puede abrir
   * jornadas, y si tiene una abierta se cierra en su siguiente accion
   * (JornadasServicio) o en la siguiente pasada del cierre automatico.
   */
  async cambiarHabilitado(
    trazadoId: string,
    conductorId: string,
    habilitado: boolean,
    sesion: Sesion,
  ): Promise<void> {
    await this.exigirPropio(trazadoId, sesion, 'habilitar_conductor');
    if (!(await this.flota.cambiarHabilitado(conductorId, trazadoId, habilitado))) {
      throw new NotFoundException('Conductor no encontrado');
    }
    await this.registrar(sesion, {
      entidad: 'conductor',
      accion: habilitado ? 'habilitar' : 'deshabilitar',
      trazado_id: trazadoId,
      conductor_id: conductorId,
    });
  }
}
