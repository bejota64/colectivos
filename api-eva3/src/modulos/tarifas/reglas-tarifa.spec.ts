import { mismaHora, motivoFranjaInvalida } from './reglas-tarifa';

describe('Reglas de tarifas (CU-12)', () => {
  it('todo el dia (sin franja) es valido', () => {
    expect(motivoFranjaInvalida({ horaInicio: null, horaFin: null })).toBeNull();
  });

  it('una franja que cruza la medianoche es valida', () => {
    expect(motivoFranjaInvalida({ horaInicio: '22:00', horaFin: '06:00' })).toBeNull();
  });

  it('una franja a medias se rechaza', () => {
    expect(motivoFranjaInvalida({ horaInicio: '08:00', horaFin: null })).not.toBeNull();
  });

  it('una franja de cero minutos se rechaza', () => {
    expect(motivoFranjaInvalida({ horaInicio: '08:00', horaFin: '08:00' })).not.toBeNull();
  });

  it('compara horas con y sin segundos', () => {
    expect(mismaHora('08:00:00', '08:00')).toBe(true);
    expect(mismaHora(null, null)).toBe(true);
    expect(mismaHora('08:00:00', null)).toBe(false);
  });
});
