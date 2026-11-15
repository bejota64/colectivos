/**
 * Reglas de las tarifas (CU-12), como funciones puras.
 */

/** Rango de precios acordado para el piloto. */
export const MONTO_MINIMO = 1000;
export const MONTO_MAXIMO = 3000;

export interface Franja {
  horaInicio: string | null;
  horaFin: string | null;
}

/** La franja va completa (inicio y fin) o vacia (todo el dia), y no puede durar cero minutos. */
export function motivoFranjaInvalida(franja: Franja): string | null {
  if ((franja.horaInicio === null) !== (franja.horaFin === null)) {
    return 'Indica hora de inicio y de fin, o ninguna para todo el dia';
  }
  if (franja.horaInicio !== null && franja.horaInicio === franja.horaFin) {
    return 'La hora de inicio y la de fin no pueden ser iguales';
  }
  return null;
}

/** "08:00:00" (como lo entrega PostgreSQL) y "08:00" son la misma hora. */
export function mismaHora(a: string | null, b: string | null): boolean {
  return (a?.slice(0, 5) ?? null) === (b?.slice(0, 5) ?? null);
}
