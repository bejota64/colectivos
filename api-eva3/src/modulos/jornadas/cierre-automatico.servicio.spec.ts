import type { ConfigService } from '@nestjs/config';
import { crearAuditoriaFalsa } from '../../../test/datos/recorrido-9001';
import type { UbicacionDoc } from '../../comun/mongo/mongo.servicio';
import type { AuditoriaServicio } from '../auditoria/auditoria.servicio';
import { CierreAutomaticoServicio } from './cierre-automatico.servicio';
import type { JornadaAbiertaFila, JornadasRepositorio } from './jornadas.repositorio';
import type { UbicacionesRepositorio } from './ubicaciones.repositorio';

describe('Cierre automatico de jornadas (CU-08)', () => {
  const AHORA = new Date('2026-10-20T12:00:00Z');
  const haceMinutos = (m: number) => new Date(AHORA.getTime() - m * 60 * 1000);
  let abiertas: JornadaAbiertaFila[];
  let ultimas: Map<string, Pick<UbicacionDoc, 'registrada_en'>>;
  let auditoria: ReturnType<typeof crearAuditoriaFalsa>;
  let servicio: CierreAutomaticoServicio;

  const jornada = (id: string, iniciadaHace: number, habilitado = true): JornadaAbiertaFila => ({
    id,
    conductor_id: `conductor-${id}`,
    patente: 'ZZZZ01',
    iniciada_en: haceMinutos(iniciadaHace),
    conductor_habilitado: habilitado,
  });

  beforeEach(() => {
    abiertas = [
      jornada('con-senal', 120),
      jornada('sin-senal', 120),
      jornada('recien-abierta', 10),
      jornada('nunca-envio', 45),
      jornada('deshabilitado', 120, false),
    ];
    ultimas = new Map([
      ['con-senal', { registrada_en: haceMinutos(2) }],
      ['sin-senal', { registrada_en: haceMinutos(31) }],
      ['deshabilitado', { registrada_en: haceMinutos(1) }],
    ]);
    auditoria = crearAuditoriaFalsa();
    servicio = new CierreAutomaticoServicio(
      {
        listarAbiertas: () => Promise.resolve(abiertas),
        cerrar: (id: string) => {
          const antes = abiertas.length;
          abiertas = abiertas.filter((j) => j.id !== id);
          return Promise.resolve(abiertas.length < antes);
        },
      } as unknown as JornadasRepositorio,
      { ultimasDe: () => Promise.resolve(ultimas) } as unknown as UbicacionesRepositorio,
      auditoria as unknown as AuditoriaServicio,
      { get: () => 'test' } as unknown as ConfigService,
    );
  });

  it('cierra las de mas de 30 min sin señal y las de conductores deshabilitados', async () => {
    const cerradas = await servicio.cerrarSinSenal(AHORA);
    expect(cerradas.sort()).toEqual(['deshabilitado', 'nunca-envio', 'sin-senal']);
    expect(abiertas.map((j) => j.id).sort()).toEqual(['con-senal', 'recien-abierta']);
  });

  it('cada cierre queda en la auditoria con su motivo', async () => {
    await servicio.cerrarSinSenal(AHORA);
    expect(auditoria.eventos.map((e) => e.detalle?.motivo).sort()).toEqual([
      'conductor_deshabilitado',
      'sin_senal',
      'sin_senal',
    ]);
  });

  it('una jornada que ya se cerro entre medio no se audita dos veces', async () => {
    await servicio.cerrarSinSenal(AHORA);
    auditoria.eventos.length = 0;
    await servicio.cerrarSinSenal(AHORA);
    expect(auditoria.eventos).toHaveLength(0);
  });
});
