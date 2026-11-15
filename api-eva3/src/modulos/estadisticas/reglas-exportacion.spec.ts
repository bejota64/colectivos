import { motivoRangoInvalido, rangoPorDefecto } from './reglas-exportacion';

describe('Rango de la exportacion (CU-10)', () => {
  it('un mes de 31 dias es valido', () => {
    expect(motivoRangoInvalido('2026-10-01', '2026-10-31')).toBeNull();
  });

  it('mas de 31 dias se rechaza', () => {
    expect(motivoRangoInvalido('2026-10-01', '2026-11-01')).not.toBeNull();
  });

  it('desde posterior a hasta se rechaza', () => {
    expect(motivoRangoInvalido('2026-10-10', '2026-10-01')).not.toBeNull();
  });

  it('por defecto toma los ultimos 7 dias', () => {
    expect(rangoPorDefecto('2026-11-17')).toEqual({ desde: '2026-11-11', hasta: '2026-11-17' });
  });
});
