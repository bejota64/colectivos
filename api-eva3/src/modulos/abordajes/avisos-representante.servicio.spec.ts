import { NotFoundException } from '@nestjs/common';
import { crearAuditoriaFalsa, IDS, SENTIDO_IDA } from '../../../test/datos/recorrido-9001';
import type { AuditoriaServicio } from '../auditoria/auditoria.servicio';
import { PertenenciaServicio } from '../trazados/pertenencia.servicio';
import type { TrazadosRepositorio } from '../trazados/trazados.repositorio';
import { AvisosRepresentanteServicio } from './avisos-representante.servicio';
import type { AvisosRepositorio } from './avisos.repositorio';

describe('AvisosRepresentanteServicio', () => {
  const trazados = {
    esDeRepresentante: (t: string, r: string) => Promise.resolve(t === IDS.trazado && r === IDS.representante),
    listarSentidos: () => Promise.resolve([SENTIDO_IDA]),
  } as unknown as TrazadosRepositorio;
  const servicio = new AvisosRepresentanteServicio(
    {
      listarActivosDeSentidos: () =>
        Promise.resolve([{ sentido_id: IDS.sentidoIda, distancia_ruta_m: 1467, personas: 2 }]),
    } as unknown as AvisosRepositorio,
    trazados,
    new PertenenciaServicio(trazados, crearAuditoriaFalsa() as unknown as AuditoriaServicio),
  );

  it('muestra sentido, tramo y personas, sin identidad del pasajero', async () => {
    const avisos = await servicio.listar(IDS.trazado, IDS.representante);
    expect(avisos).toEqual([{ sentido: 'ida', numero_tramo: 2, distancia_ruta_m: 1467, personas: 2 }]);
  });

  it('los avisos de un trazado ajeno responden 404', async () => {
    await expect(servicio.listar(IDS.otroTrazado, IDS.representante)).rejects.toBeInstanceOf(NotFoundException);
  });
});
