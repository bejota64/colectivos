import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ValoracionesRepositorio } from './valoraciones.repositorio';
import { ValoracionesServicio } from './valoraciones.servicio';

describe('ValoracionesServicio', () => {
  const AHORA = new Date('2026-10-20T12:00:00Z');
  const MIO = 'abordaje-mio';
  const MIO_ANTIGUO = 'abordaje-mio-de-hace-25-horas';
  const viajes: Record<string, { pasajero: string; abordado_en: Date }> = {
    [MIO]: { pasajero: 'pasajero-1', abordado_en: new Date(AHORA.getTime() - 2 * 3600 * 1000) },
    [MIO_ANTIGUO]: { pasajero: 'pasajero-1', abordado_en: new Date(AHORA.getTime() - 25 * 3600 * 1000) },
  };
  let calificados: Set<string>;
  let servicio: ValoracionesServicio;

  beforeEach(() => {
    calificados = new Set();
    servicio = new ValoracionesServicio({
      buscarViajePropio: (abordajeId: string, pasajeroId: string) => {
        const viaje = viajes[abordajeId];
        return Promise.resolve(viaje && viaje.pasajero === pasajeroId ? { abordado_en: viaje.abordado_en } : null);
      },
      // Imita el INSERT ... SELECT con la condicion de pertenencia.
      calificar: (d: { abordajeId: string; pasajeroId: string; estrellas: number }) => {
        if (viajes[d.abordajeId]?.pasajero !== d.pasajeroId) return Promise.resolve(null);
        if (calificados.has(d.abordajeId)) {
          return Promise.reject(Object.assign(new Error('duplicado'), { code: '23505' }));
        }
        calificados.add(d.abordajeId);
        return Promise.resolve({ abordaje_id: d.abordajeId, estrellas: d.estrellas, creada_en: AHORA });
      },
    } as unknown as ValoracionesRepositorio);
  });

  it('califica un viaje propio', async () => {
    const c = await servicio.calificar('pasajero-1', MIO, 5, AHORA);
    expect(c.estrellas).toBe(5);
  });

  it('el viaje de otra persona responde 404 (no se confirma que exista)', async () => {
    await expect(servicio.calificar('pasajero-2', MIO, 1, AHORA)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('calificar dos veces el mismo viaje responde 409', async () => {
    await servicio.calificar('pasajero-1', MIO, 4, AHORA);
    await expect(servicio.calificar('pasajero-1', MIO, 1, AHORA)).rejects.toBeInstanceOf(ConflictException);
  });

  it('V-05: un viaje propio de hace 25 horas responde 422 y no se califica', async () => {
    await expect(servicio.calificar('pasajero-1', MIO_ANTIGUO, 1, AHORA)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(calificados.size).toBe(0);
  });
});
