/** Maximo de dias por archivo: acota el tamano de la exportacion. */
export const MAXIMO_DIAS_EXPORTACION = 31;

const DIA_MS = 24 * 60 * 60 * 1000;

/** Fechas AAAA-MM-DD ya validadas. Devuelve el motivo del rechazo o null. */
export function motivoRangoInvalido(desde: string, hasta: string): string | null {
  const dias = (Date.parse(hasta) - Date.parse(desde)) / DIA_MS;
  if (dias < 0) {
    return 'La fecha desde no puede ser posterior a hasta';
  }
  if (dias + 1 > MAXIMO_DIAS_EXPORTACION) {
    return `El rango no puede superar ${MAXIMO_DIAS_EXPORTACION} dias`;
  }
  return null;
}

/** Rango por defecto: los ultimos 7 dias, terminando hoy. */
export function rangoPorDefecto(hoy: string): { desde: string; hasta: string } {
  const desde = new Date(Date.parse(hoy) - 6 * DIA_MS).toISOString().slice(0, 10);
  return { desde, hasta: hoy };
}
