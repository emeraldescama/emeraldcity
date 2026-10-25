/**
 * Lee el CSV descargado de la hoja de Google anterior y reconoce sus columnas por el
 * título (nombre de entrenador, código, edad…), para importar a los miembros.
 */

export interface ImportedMember {
  fecha: string;
  entrenador: string;
  nombre: string;
  ciudad: string;
  codigo: string;
  campfire: boolean | null;
  campfireNombre: string;
  edad: number | null;
}

type Field = keyof ImportedMember;

/** Orden importa: los campos más específicos se reconocen primero */
const FIELDS: { key: Field; label: string; match: (h: string) => boolean }[] = [
  { key: 'fecha', label: 'Fecha', match: (h) => /marca temporal|timestamp|^fecha/.test(h) },
  { key: 'campfireNombre', label: 'Nombre en Campfire', match: (h) => h.includes('campfire') && /nombre|usuario|user|nick/.test(h) },
  { key: 'campfire', label: '¿Tiene Campfire?', match: (h) => h.includes('campfire') },
  { key: 'entrenador', label: 'Nombre de entrenador', match: (h) => /entrenador|trainer|nick/.test(h) && !h.includes('codigo') },
  { key: 'nombre', label: 'Nombre y apellido', match: (h) => /apellido|nombre completo|^nombre$/.test(h) },
  { key: 'codigo', label: 'Código de amistad', match: (h) => /codigo|friend code/.test(h) },
  { key: 'ciudad', label: 'Ciudad o país', match: (h) => /ciudad|pais|zona|ubicacion|donde/.test(h) },
  { key: 'edad', label: 'Edad', match: (h) => /edad/.test(h) },
];

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** CSV con comillas, comas dentro de comillas y saltos de línea dentro de celdas */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const sample = clean.slice(0, clean.indexOf('\n') > 0 ? clean.indexOf('\n') : undefined);
  const separator = (sample.match(/;/g)?.length ?? 0) > (sample.match(/,/g)?.length ?? 0) ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (quoted) {
      if (char === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === separator) {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** "21/10/2026 14:30:05" (formato de Google en español) o fechas ISO */
function parseDate(text: string): string {
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) {
    const [, d, m, y, h = '0', min = '0', s = '0'] = match;
    return new Date(Date.UTC(+y, +m - 1, +d, +h + 4, +min, +s)).toISOString();
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

/** Los códigos guardados como número pierden los ceros iniciales: se recuperan */
function parseCode(text: string): string {
  const digits = text.replace(/\D/g, '');
  return digits.length > 0 && digits.length < 12 ? digits.padStart(12, '0') : digits.length === 12 ? digits : '';
}

export interface ImportPreview {
  members: ImportedMember[];
  columns: { label: string; header: string | null }[];
  withoutCode: number;
}

export function readMembers(csv: string): ImportPreview {
  const [headerRow = [], ...rows] = parseCsv(csv);
  const headers = headerRow.map(normalize);
  const used = new Set<number>();
  const map = new Map<Field, number>();
  for (const field of FIELDS) {
    const index = headers.findIndex((h, i) => h && !used.has(i) && field.match(h));
    if (index >= 0) {
      map.set(field.key, index);
      used.add(index);
    }
  }
  if (!map.has('entrenador')) {
    throw new Error('No encontramos la columna del nombre de entrenador. Revisa que el archivo tenga los títulos en la primera fila.');
  }

  const get = (row: string[], key: Field) => (map.has(key) ? (row[map.get(key)!] ?? '').trim() : '');
  const members = rows
    .map((row) => {
      const campfire = normalize(get(row, 'campfire'));
      const edad = parseInt(get(row, 'edad'), 10);
      return {
        fecha: parseDate(get(row, 'fecha')),
        entrenador: get(row, 'entrenador'),
        nombre: get(row, 'nombre'),
        ciudad: get(row, 'ciudad'),
        codigo: parseCode(get(row, 'codigo')),
        // Si la hoja solo tenía el usuario de Campfire, tenerlo escrito cuenta como "Sí"
        campfire: campfire.startsWith('s') ? true : campfire.startsWith('n') ? false : get(row, 'campfireNombre') ? true : null,
        campfireNombre: get(row, 'campfireNombre'),
        edad: Number.isInteger(edad) ? edad : null,
      };
    })
    .filter((m) => m.entrenador);

  return {
    members,
    columns: FIELDS.map((f) => ({ label: f.label, header: map.has(f.key) ? headerRow[map.get(f.key)!] : null })),
    withoutCode: members.filter((m) => !m.codigo).length,
  };
}
