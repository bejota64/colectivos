/**
 * Reglas de la valoracion del viaje (calificacion y reporte), como
 * funciones puras: se prueban solas en reglas-valoracion.spec.ts.
 */

/** CU-06: se califica o reporta dentro de las 24 horas siguientes al viaje. */
export const PLAZO_VALORACION_MS = 24 * 60 * 60 * 1000;

export const MENSAJE_FUERA_DE_PLAZO =
  'Solo puedes valorar un viaje dentro de las 24 horas siguientes';

/**
 * Sin plazo, un viaje antiguo se podria usar para calificar o reportar a un
 * conductor mucho despues, cuando ya nadie recuerda que paso (hallazgo V-05).
 */
export function motivoFueraDePlazo(abordadoEn: Date, ahora: Date): string | null {
  return ahora.getTime() - abordadoEn.getTime() > PLAZO_VALORACION_MS
    ? MENSAJE_FUERA_DE_PLAZO
    : null;
}
