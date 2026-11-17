import { aCsv, celdaCsv } from './csv';

describe('Exportacion CSV (CU-10, OWASP A05:2025 inyeccion de formulas)', () => {
  it.each(['=1+1', '+56911112222', '-2+3', '@SUMA(A1)', '\t=1'])(
    'un texto que empieza con un caracter de formula se neutraliza: %p',
    (peligroso) => {
      expect(celdaCsv(peligroso).replace(/^"/, '').startsWith("'")).toBe(true);
    },
  );

  it('un intento real queda como texto y entre comillas', () => {
    expect(celdaCsv('=HIPERVINCULO("http://sitio-falso";"ver")')).toBe(
      `"'=HIPERVINCULO(""http://sitio-falso"";""ver"")"`,
    );
  });

  it('los numeros no se alteran', () => {
    expect(celdaCsv(1500)).toBe('1500');
  });

  it('un texto normal sale igual', () => {
    expect(celdaCsv('Muy amable')).toBe('Muy amable');
  });

  it('separa con ; y termina cada linea con CRLF', () => {
    expect(aCsv(['a', 'b'], [[1, null]])).toBe('﻿a;b\r\n1;\r\n');
  });
});
