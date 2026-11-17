/** Transformaciones de entrada comunes a los DTO (class-transformer). */

/** Quita los espacios de los extremos de un texto. */
export const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
