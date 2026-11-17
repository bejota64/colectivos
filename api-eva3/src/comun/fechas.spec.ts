import { inicioDelDiaEnChile } from './fechas';

describe('Dias de Chile', () => {
  it('en verano (noviembre) el dia empieza a las 03:00 UTC', () => {
    expect(inicioDelDiaEnChile('2026-11-17').toISOString()).toBe('2026-11-17T03:00:00.000Z');
  });

  it('en invierno (julio) el dia empieza a las 04:00 UTC', () => {
    expect(inicioDelDiaEnChile('2026-07-10').toISOString()).toBe('2026-07-10T04:00:00.000Z');
  });

  it('diasDespues = 1 da el inicio del dia siguiente', () => {
    expect(inicioDelDiaEnChile('2026-11-17', 1).toISOString()).toBe('2026-11-18T03:00:00.000Z');
  });
});
