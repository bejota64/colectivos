import { NotFoundException } from '@nestjs/common';
import { crearAuditoriaFalsa, IDS } from '../../../test/datos/recorrido-9001';
import type { AuditoriaServicio } from '../auditoria/auditoria.servicio';
import { PertenenciaServicio } from '../trazados/pertenencia.servicio';
import type { TrazadosRepositorio } from '../trazados/trazados.repositorio';
import { JornadasRepresentanteServicio } from './jornadas-representante.servicio';
import type { JornadaAbiertaFila, JornadasRepositorio } from './jornadas.repositorio';

describe('JornadasRepresentanteServicio', () => {
  let abiertas: JornadaAbiertaFila[];
  let auditoria: ReturnType<typeof crearAuditoriaFalsa>;
  let servicio: JornadasRepresentanteServicio;

  beforeEach(() => {
    abiertas = [
      {
        id: IDS.jornadaAbierta,
        conductor_id: IDS.conductor1,
        patente: 'ZZZZ01',
        iniciada_en: new Date(),
        conductor_habilitado: true,
      },
    ];
    auditoria = crearAuditoriaFalsa();
    servicio = new JornadasRepresentanteServicio(
      {
        listarAbiertasDeTrazado: (t: string) => Promise.resolve(t === IDS.trazado ? abiertas : []),
        cerrar: (id: string) => {
          const antes = abiertas.length;
          abiertas = abiertas.filter((j) => j.id !== id);
          return Promise.resolve(abiertas.length < antes);
        },
      } as unknown as JornadasRepositorio,
      new PertenenciaServicio(
        {
          esDeRepresentante: (t: string, r: string) => Promise.resolve(t === IDS.trazado && r === IDS.representante),
        } as unknown as TrazadosRepositorio,
        auditoria as unknown as AuditoriaServicio,
      ),
      auditoria as unknown as AuditoriaServicio,
    );
  });

  it('cierra una jornada de su trazado y queda auditado con el motivo', async () => {
    await servicio.cerrar(IDS.trazado, IDS.jornadaAbierta, IDS.representante);
    expect(abiertas).toHaveLength(0);
    expect(auditoria.eventos[0]).toMatchObject({
      tipo: 'fin_jornada',
      detalle: { motivo: 'cerrada_por_representante' },
    });
  });

  it('una jornada que no esta abierta en su trazado responde 404', async () => {
    await expect(servicio.cerrar(IDS.trazado, 'otra', IDS.representante)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('no ve ni cierra jornadas de un trazado ajeno', async () => {
    await expect(servicio.listarAbiertas(IDS.otroTrazado, IDS.representante)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(abiertas).toHaveLength(1);
  });
});
