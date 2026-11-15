import { motivoFueraDePlazo } from './reglas-valoracion';

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
