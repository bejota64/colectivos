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
  let reportados: Set<string>;
  let servicio: ValoracionesServicio;

  beforeEach(() => {
    calificados = new Set();
    reportados = new Set();
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
      crearReporte: (d: { abordajeId: string; pasajeroId: string; tipo: string; categoria: string }) => {
        if (viajes[d.abordajeId]?.pasajero !== d.pasajeroId) return Promise.resolve(null);
        if (reportados.has(d.abordajeId)) {
          return Promise.reject(Object.assign(new Error('duplicado'), { code: '23505' }));
        }
        reportados.add(d.abordajeId);
        return Promise.resolve({ id: 'r-1', tipo: d.tipo, categoria: d.categoria, estado: 'pendiente', creado_en: AHORA });
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

  describe('Reportes (CU-06)', () => {
    const queja = {
      tipo: 'queja' as const,
      categoria: 'uso_de_celular' as const,
      descripcion: 'Iba escribiendo en el celular',
    };

    it('reporta un viaje propio y queda pendiente', async () => {
      const r = await servicio.reportar('pasajero-1', MIO, queja, AHORA);
      expect(r.estado).toBe('pendiente');
    });

    it('un segundo reporte del mismo viaje responde 409', async () => {
      await servicio.reportar('pasajero-1', MIO, queja, AHORA);
      await expect(servicio.reportar('pasajero-1', MIO, queja, AHORA)).rejects.toBeInstanceOf(ConflictException);
    });

    it('fuera de las 24 horas responde 422', async () => {
      await expect(servicio.reportar('pasajero-1', MIO_ANTIGUO, queja, AHORA)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('una felicitacion con categoria de queja responde 422', async () => {
      await expect(
        servicio.reportar('pasajero-1', MIO, { ...queja, tipo: 'felicitacion' }, AHORA),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(reportados.size).toBe(0);
    });

    it('el viaje de otra persona responde 404', async () => {
      await expect(servicio.reportar('pasajero-2', MIO, queja, AHORA)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
