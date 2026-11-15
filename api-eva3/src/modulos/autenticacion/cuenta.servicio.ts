import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { MongoServicio } from '../../comun/mongo/mongo.servicio';
import { AuditoriaServicio } from '../auditoria/auditoria.servicio';
import { UsuariosRepositorio } from '../usuarios/usuarios.repositorio';
import { ContrasenasServicio } from './contrasenas.servicio';

/**
 * Eliminar la cuenta propia (matriz de permisos: solo el pasajero; al
 * conductor lo da de baja su representante). Cumple el derecho de
 * supresion de la Ley 21.719: anonimiza la cuenta, revoca consentimientos
 * y sesiones, y borra su aviso de espera activo, que tiene su ubicacion.
 */
@Injectable()
export class CuentaServicio {
  constructor(
    private readonly usuarios: UsuariosRepositorio,
    private readonly contrasenas: ContrasenasServicio,
    private readonly mongo: MongoServicio,
    private readonly auditoria: AuditoriaServicio,
  ) {}

  async eliminarPropia(usuarioId: string, contrasena: string, ip?: string): Promise<void> {
    const usuario = await this.usuarios.buscarPorId(usuarioId);
    if (!usuario) {
      throw new NotFoundException();
    }
    if (!(await this.contrasenas.coincide(contrasena, usuario.contrasena_hash))) {
      throw new UnprocessableEntityException('La contraseña no es correcta');
    }
    if (!(await this.usuarios.anonimizar(usuarioId))) {
      throw new NotFoundException();
    }
    await this.mongo.coleccion('avisos_espera').deleteMany({ pasajero_id: usuarioId });
    // Solo el id: el evento no guarda nombre ni correo de la cuenta eliminada.
    await this.auditoria.registrar({ tipo: 'eliminacion_cuenta', usuarioId, ip });
  }
}
