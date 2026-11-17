import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { crearAuditoriaFalsa, IDS } from '../../../test/datos/recorrido-9001';
import type { AuditoriaServicio } from '../auditoria/auditoria.servicio';
import { PertenenciaServicio } from '../trazados/pertenencia.servicio';
import type { TrazadosRepositorio } from '../trazados/trazados.repositorio';
import type { TarifaFila, TarifasRepositorio } from './tarifas.repositorio';
import { TarifasServicio } from './tarifas.servicio';

describe('TarifasServicio (CU-12)', () => {
  let tarifas: (TarifaFila & { trazado_id: string })[];
  let auditoria: ReturnType<typeof crearAuditoriaFalsa>;
  let servicio: TarifasServicio;

  const fila = (nombre: string, monto: number): TarifaFila & { trazado_id: string } => ({
    id: `t-${tarifas.length + 1}`,
    trazado_id: IDS.trazado,
    nombre,
    monto,
    hora_inicio: null,
    hora_fin: null,
    vigente_desde: new Date(),
    vigente_hasta: null,
  });
  const vigentes = () => tarifas.filter((t) => t.vigente_hasta === null);

  beforeEach(() => {
    tarifas = [];
    tarifas.push(fila('Recorrido completo', 1500));
    auditoria = crearAuditoriaFalsa();
    const repositorio = {
      buscarVigente: (_trazado: string, nombre: string) =>
        Promise.resolve(vigentes().find((t) => t.nombre.toLowerCase() === nombre.toLowerCase()) ?? null),
      reemplazar: (d: { nombre: string; monto: number }) => {
        const anterior = vigentes().find((t) => t.nombre.toLowerCase() === d.nombre.toLowerCase()) ?? null;
        if (anterior) anterior.vigente_hasta = new Date();
        const nueva = fila(d.nombre, d.monto);
        tarifas.push(nueva);
        return Promise.resolve({ anterior, nueva });
      },
      cerrar: (id: string) => {
        const t = vigentes().find((x) => x.id === id) ?? null;
        if (t) t.vigente_hasta = new Date();
        return Promise.resolve(t);
      },
    } as unknown as TarifasRepositorio;
    const pertenencia = new PertenenciaServicio(
      {
        esDeRepresentante: (trazado: string, representante: string) =>
          Promise.resolve(trazado === IDS.trazado && representante === IDS.representante),
      } as unknown as TrazadosRepositorio,
      auditoria as unknown as AuditoriaServicio,
    );
    servicio = new TarifasServicio(repositorio, pertenencia, auditoria as unknown as AuditoriaServicio);
  });

  const fijar = (nombre: string, monto: number, franja: [string | null, string | null] = [null, null]) =>
    servicio.fijar(IDS.trazado, IDS.representante, { nombre, monto, horaInicio: franja[0], horaFin: franja[1] });

  it('crea una tarifa nueva y lo deja en la auditoria', async () => {
    await fijar('Tramo corto', 1000);
    expect(vigentes()).toHaveLength(2);
    expect(auditoria.eventos[0]).toMatchObject({
      tipo: 'cambio_tarifa',
      detalle: { nombre: 'Tramo corto', monto_anterior: null, monto_nuevo: 1000 },
    });
  });

  it('cambiar el precio cierra la anterior: queda historial y una sola vigente con ese nombre', async () => {
    await fijar('recorrido completo', 1600);
    expect(tarifas).toHaveLength(2);
    expect(vigentes()).toHaveLength(1);
    expect(auditoria.eventos[0].detalle).toMatchObject({ monto_anterior: 1500, monto_nuevo: 1600 });
  });

  it('el mismo monto y horario que la vigente responde 422', async () => {
    await expect(fijar('Recorrido completo', 1500)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(tarifas).toHaveLength(1);
  });

  it('una franja horaria incompleta responde 422', async () => {
    await expect(fijar('Nocturna', 2000, ['22:00', null])).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('un representante no cambia tarifas de un trazado ajeno: 404 y queda auditado', async () => {
    await expect(
      servicio.fijar(IDS.otroTrazado, IDS.representante, { nombre: 'X', monto: 1000, horaInicio: null, horaFin: null }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tarifas).toHaveLength(1);
    expect(auditoria.eventos[0].tipo).toBe('acceso_denegado');
  });

  it('cerrar una tarifa que no esta vigente responde 404', async () => {
    await expect(servicio.cerrar(IDS.trazado, 'no-existe', IDS.representante)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
