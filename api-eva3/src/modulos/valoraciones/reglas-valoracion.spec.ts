import {
  motivoCategoriaInvalida,
  motivoFueraDePlazo,
  motivoTransicionInvalida,
} from './reglas-valoracion';

describe('Plazo para valorar un viaje (CU-06)', () => {
  const AHORA = new Date('2026-10-20T12:00:00Z');
  const haceHoras = (horas: number) => new Date(AHORA.getTime() - horas * 3600 * 1000);

  it('dentro de las 24 horas se acepta', () => {
    expect(motivoFueraDePlazo(haceHoras(23.9), AHORA)).toBeNull();
  });

  it('justo a las 24 horas todavia se acepta', () => {
    expect(motivoFueraDePlazo(haceHoras(24), AHORA)).toBeNull();
  });

  it('pasadas las 24 horas se rechaza', () => {
    expect(motivoFueraDePlazo(haceHoras(25), AHORA)).not.toBeNull();
  });
});

describe('Reportes (CU-06 y CU-11)', () => {
  it('una queja por uso de celular es coherente', () => {
    expect(motivoCategoriaInvalida('queja', 'uso_de_celular')).toBeNull();
  });

  it('una felicitacion por uso de celular no es coherente', () => {
    expect(motivoCategoriaInvalida('felicitacion', 'uso_de_celular')).not.toBeNull();
  });

  it('una queja por buen servicio no es coherente', () => {
    expect(motivoCategoriaInvalida('queja', 'buen_servicio')).not.toBeNull();
  });

  it('"otro" sirve para ambos tipos', () => {
    expect(motivoCategoriaInvalida('felicitacion', 'otro')).toBeNull();
    expect(motivoCategoriaInvalida('queja', 'otro')).toBeNull();
  });

  it('pendiente pasa a revision sin respuesta', () => {
    expect(motivoTransicionInvalida('pendiente', 'en_revision', undefined)).toBeNull();
  });

  it('para cerrar hay que escribir una respuesta', () => {
    expect(motivoTransicionInvalida('en_revision', 'cerrado', undefined)).not.toBeNull();
    expect(motivoTransicionInvalida('en_revision', 'cerrado', 'Se converso con el conductor')).toBeNull();
  });

  it('un reporte cerrado no se vuelve a abrir ni a cambiar', () => {
    expect(motivoTransicionInvalida('cerrado', 'en_revision', undefined)).not.toBeNull();
  });
});
