/** Zona horaria del servicio: los dias del negocio son dias de Chile. */
export const ZONA_CHILE = 'America/Santiago';

/**
 * Instante en que empieza un dia de Chile (AAAA-MM-DD), considerando el
 * horario de verano (UTC-3) y de invierno (UTC-4). diasDespues = 1 da el
 * inicio del dia siguiente, util como limite superior exclusivo.
 */
export function inicioDelDiaEnChile(fecha: string, diasDespues = 0): Date {
  const medianocheUtc = new Date(`${fecha}T00:00:00Z`);
  medianocheUtc.setUTCDate(medianocheUtc.getUTCDate() + diasDespues);
  const comoChile = new Date(medianocheUtc.toLocaleString('en-US', { timeZone: ZONA_CHILE }));
  const comoUtc = new Date(medianocheUtc.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(medianocheUtc.getTime() + (comoUtc.getTime() - comoChile.getTime()));
}
