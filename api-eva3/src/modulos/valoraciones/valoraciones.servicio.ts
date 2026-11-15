import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  codigoDeError,
  VIOLACION_DE_UNICIDAD,
} from '../../comun/base-datos/errores-postgres';
import { motivoFueraDePlazo } from './reglas-valoracion';
import {
  CalificacionFila,
  ValoracionesRepositorio,
} from './valoraciones.repositorio';

/**
 * Calificacion de 1 a 5 estrellas. Solo califica quien viajo, una vez por
 * viaje y dentro de las 24 horas siguientes (CU-06). El conductor nunca ve
 * quien lo califico: el representante solo recibe promedios.
 */
@Injectable()
export class ValoracionesServicio {
  constructor(private readonly valoraciones: ValoracionesRepositorio) {}

  async calificar(
    pasajeroId: string,
    abordajeId: string,
    estrellas: number,
    ahora: Date = new Date(),
  ): Promise<CalificacionFila> {
    await this.exigirViajeValorable(pasajeroId, abordajeId, ahora);

    let calificacion: CalificacionFila | null;
    try {
      calificacion = await this.valoraciones.calificar({
        abordajeId,
        pasajeroId,
        estrellas,
      });
    } catch (error) {
      if (codigoDeError(error) === VIOLACION_DE_UNICIDAD) {
        throw new ConflictException('Ya calificaste este viaje');
      }
      throw error;
    }
    if (!calificacion) {
      throw new NotFoundException('Viaje no encontrado');
    }
    return calificacion;
  }

  /**
   * El viaje debe ser del pasajero de la sesion y estar dentro del plazo.
   * 404 y no 403 si es de otra persona: no se confirma que ese id exista.
   */
  private async exigirViajeValorable(
    pasajeroId: string,
    abordajeId: string,
    ahora: Date,
  ): Promise<void> {
    const viaje = await this.valoraciones.buscarViajePropio(abordajeId, pasajeroId);
    if (!viaje) {
      throw new NotFoundException('Viaje no encontrado');
    }
    const motivo = motivoFueraDePlazo(viaje.abordado_en, ahora);
    if (motivo) {
      throw new UnprocessableEntityException(motivo);
    }
  }
}
