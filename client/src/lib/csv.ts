/**
 * Parser CSV mínimo (sin dependencias). Detecta separador ";" (Excel en español) o ",".
 * Soporta comillas dobles y saltos de línea dentro de campos entrecomillados.
 */
export function parseCSV(text: string): Record<string, string>[] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : firstLine.includes('\t') ? '\t' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) row.push(field), (field = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim())) rows.push(row);

  const [header, ...data] = rows;
  if (!header) return [];
  const keys = header.map((h) =>
    h
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '_')
  );
  return data.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

export const CSV_TEMPLATE =
  'nivel;division;alumno_apellido;alumno_nombre;alumno_dni;fecha_nacimiento;tutor1_apellido;tutor1_nombre;tutor1_dni;tutor1_email;tutor1_telefono;tutor1_vinculo;tutor2_apellido;tutor2_nombre;tutor2_dni;tutor2_email;tutor2_telefono;tutor2_vinculo\n' +
  'Secundario;2º 1ª;Pérez;Juana;50123456;2012-05-14;Pérez;Carlos;28111222;carlos@mail.com;1155550000;Padre;Gómez;Laura;29333444;;1155551111;Madre\n';

export const downloadText = (name: string, content: string, type = 'text/csv;charset=utf-8') => {
  const url = URL.createObjectURL(new Blob(['﻿' + content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
