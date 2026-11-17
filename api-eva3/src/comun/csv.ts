/**
 * Exportacion a CSV (CU-10) protegida contra inyeccion de formulas
 * (OWASP A05:2025, CWE-1236). Un texto escrito por un pasajero, como
 * =HIPERVINCULO("http://sitio-falso"), se ejecutaria como formula al abrir
 * el archivo en Excel. Por eso todo texto que empieza con = + - @ o con un
 * tabulador se antepone con un apostrofo: Excel lo muestra como texto.
 *
 * Separador ";" porque Excel con configuracion regional de Chile usa la
 * coma como separador decimal.
 */

export type ValorCsv = string | number | null;

const INICIO_DE_FORMULA = /^[=+\-@\t\r]/;
const NECESITA_COMILLAS = /[";\r\n]/;

export function celdaCsv(valor: ValorCsv): string {
  if (valor === null) {
    return '';
  }
  let texto = String(valor);
  if (typeof valor === 'string' && INICIO_DE_FORMULA.test(texto)) {
    texto = `'${texto}`;
  }
  return NECESITA_COMILLAS.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** Archivo completo. El BOM inicial hace que Excel lea bien las tildes (UTF-8). */
export function aCsv(encabezados: string[], filas: ValorCsv[][]): string {
  const lineas = [encabezados, ...filas].map((fila) => fila.map(celdaCsv).join(';'));
  return `﻿${lineas.join('\r\n')}\r\n`;
}
