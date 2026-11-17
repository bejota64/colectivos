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

// ---------------------------------------------------------------------
// Reportes: quejas y felicitaciones (CU-06) y su gestion (CU-11)
// ---------------------------------------------------------------------

/** Mismos valores que los CHECK de la tabla reportes (01_esquema.sql). */
export const TIPOS_REPORTE = ['queja', 'felicitacion'] as const;
export type TipoReporte = (typeof TIPOS_REPORTE)[number];

export const CATEGORIAS = [
  'conduccion_riesgosa',
  'uso_de_celular',
  'sospecha_de_alcohol',
  'trato_al_pasajero',
  'cobro_incorrecto',
  'buen_servicio',
  'otro',
] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const ESTADOS_REPORTE = ['pendiente', 'en_revision', 'cerrado'] as const;
export type EstadoReporte = (typeof ESTADOS_REPORTE)[number];

/** Una felicitacion no puede ser por "uso de celular", ni una queja por "buen servicio". */
export function motivoCategoriaInvalida(tipo: TipoReporte, categoria: Categoria): string | null {
  if (categoria === 'otro') {
    return null;
  }
  const esDeFelicitacion = categoria === 'buen_servicio';
  if ((tipo === 'felicitacion') !== esDeFelicitacion) {
    return 'La categoria no corresponde al tipo de reporte';
  }
  return null;
}

/**
 * Ciclo de vida del reporte: pendiente -> en_revision -> cerrado, o
 * pendiente -> cerrado. Cerrado es final, y para cerrar hay que dejar una
 * respuesta (queda como registro de lo que se hizo).
 */
export function motivoTransicionInvalida(
  actual: EstadoReporte,
  nuevo: Exclude<EstadoReporte, 'pendiente'>,
  respuesta: string | undefined,
): string | null {
  if (actual === 'cerrado') {
    return 'El reporte ya esta cerrado';
  }
  if (actual === nuevo) {
    return 'El reporte ya esta en ese estado';
  }
  if (nuevo === 'cerrado' && !respuesta) {
    return 'Para cerrar el reporte escribe una respuesta';
  }
  return null;
}
