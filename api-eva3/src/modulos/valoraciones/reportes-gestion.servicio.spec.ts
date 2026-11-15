import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { crearAuditoriaFalsa, IDS } from '../../../test/datos/recorrido-9001';
import type { AuditoriaServicio } from '../auditoria/auditoria.servicio';
import { PertenenciaServicio } from '../trazados/pertenencia.servicio';
import type { TrazadosRepositorio } from '../trazados/trazados.repositorio';
import type { EstadoReporte } from './reglas-valoracion';
import { ReportesGestionServicio } from './reportes-gestion.servicio';
import type { ReporteGestionFila, ValoracionesRepositorio } from './valoraciones.repositorio';

describe('ReportesGestionServicio (CU-11)', () => {
  let reporte: ReporteGestionFila;
  let otroLoCambia: boolean;
  let auditoria: ReturnType<typeof crearAuditoriaFalsa>;
  let servicio: ReportesGestionServicio;

  beforeEach(() => {
    reporte = {
      id: 'r-1',
      tipo: 'queja',
      categoria: 'uso_de_celular',
      descripcion: 'Iba escribiendo en el celular',
      estado: 'pendiente',
      respuesta: null,
      creado_en: new Date(),
      cerrado_en: null,
      patente: 'ZZZZ01',
      conductor: 'Luis Fuentealba Rojas',
    };
    otroLoCambia = false;
    auditoria = crearAuditoriaFalsa();
    const repositorio = {
      buscarReporteDeTrazado: (id: string, trazado: string) =>
        Promise.resolve(id === reporte.id && trazado === IDS.trazado ? { ...reporte } : null),
      cambiarEstado: (d: { estadoAnterior: EstadoReporte; estadoNuevo: EstadoReporte; respuesta: string | null }) => {
        if (otroLoCambia || d.estadoAnterior !== reporte.estado) return Promise.resolve(false);
        reporte.estado = d.estadoNuevo;
        reporte.respuesta = d.respuesta ?? reporte.respuesta;
        return Promise.resolve(true);
      },
    } as unknown as ValoracionesRepositorio;
    const pertenencia = new PertenenciaServicio(
      {
        esDeRepresentante: (t: string, r: string) => Promise.resolve(t === IDS.trazado && r === IDS.representante),
      } as unknown as TrazadosRepositorio,
      auditoria as unknown as AuditoriaServicio,
    );
    servicio = new ReportesGestionServicio(repositorio, pertenencia, auditoria as unknown as AuditoriaServicio);
  });

  const gestionar = (estado: 'en_revision' | 'cerrado', respuesta?: string) =>
    servicio.gestionar(IDS.trazado, 'r-1', IDS.representante, { estado, respuesta });

  it('pasa a revision y queda en la auditoria con el estado anterior y el nuevo', async () => {
    await gestionar('en_revision');
    expect(reporte.estado).toBe('en_revision');
    expect(auditoria.eventos[0]).toMatchObject({
      tipo: 'cambio_estado_reporte',
      detalle: { estado_anterior: 'pendiente', estado_nuevo: 'en_revision' },
    });
  });

  it('cerrar sin respuesta responde 422', async () => {
    await expect(gestionar('cerrado')).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('cierra con respuesta, y un reporte cerrado ya no cambia', async () => {
    await gestionar('cerrado', 'Se converso con el conductor');
    expect(reporte.estado).toBe('cerrado');
    await expect(gestionar('en_revision')).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('si otra persona lo cambio entre medio responde 409 y no lo pisa', async () => {
    otroLoCambia = true;
    await expect(gestionar('en_revision')).rejects.toBeInstanceOf(ConflictException);
  });

  it('un reporte de otro trazado responde 404', async () => {
    await expect(
      servicio.gestionar(IDS.otroTrazado, 'r-1', IDS.representante, { estado: 'en_revision' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
