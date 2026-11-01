/**
 * Lee la hoja anterior (descargada de Google como Excel .xlsx o como CSV) y reconoce sus
 * columnas por el título (nombre de entrenador, código, edad…), para importar a los miembros.
 */
import { readXlsxRows } from './xlsxReader';
import { pokemonNumber } from './pokemonPicker';

export interface ImportedMember {
  fecha: string;
  entrenador: string;
  nombre: string;
  ciudad: string;
  codigo: string;
  campfire: boolean | null;
  campfireNombre: string;
  edad: number | null;
  telefono: string;
  cumpleDia: number | null;
  cumpleMes: number | null;
  pokemon: number | null;
  /** Nombre del Pokémon tal como venía en la hoja */
  pokemonTexto?: string;
}

// "captura" solo sirve para que esa columna no se confunda con otra; no se importa
type Field = Exclude<keyof ImportedMember, 'cumpleDia' | 'cumpleMes'> | 'cumple' | 'captura';

/** Orden importa: los campos más específicos se reconocen primero */
const FIELDS: { key: Field; label: string; match: (h: string) => boolean }[] = [
  // Antes que "Fecha": "Fecha de nacimiento" es el cumpleaños, no la fecha del registro
  { key: 'cumple', label: 'Cumpleaños', match: (h) => /cumple|nacimiento|nacido|birthday|birth/.test(h) },
  { key: 'pokemon', label: 'Pokémon favorito', match: (h) => /pokemon/.test(h) && /favorit|preferid/.test(h) },
  { key: 'fecha', label: 'Fecha', match: (h) => /marca temporal|timestamp|^fecha/.test(h) },
  { key: 'campfireNombre', label: 'Nombre en Campfire', match: (h) => h.includes('campfire') && /nombre|usuario|user|nick/.test(h) },
  { key: 'campfire', label: '¿Tiene Campfire?', match: (h) => h.includes('campfire') },
  { key: 'entrenador', label: 'Nombre de entrenador', match: (h) => /entrenador|trainer|nick/.test(h) && !h.includes('codigo') },
  { key: 'nombre', label: 'Nombre y apellido', match: (h) => /apellido|nombre completo|^nombre$/.test(h) },
  { key: 'codigo', label: 'Código de amistad', match: (h) => /codigo|friend code/.test(h) },
  { key: 'captura', label: 'Captura (no se importa)', match: (h) => /captura|foto|imagen|screenshot|pantalla|perfil|adjunt|sube/.test(h) },
  { key: 'telefono', label: 'Teléfono / WhatsApp', match: (h) => /telefono|celular|whatsapp|movil|^tel\b/.test(h) },
  { key: 'ciudad', label: 'Ciudad o país', match: (h) => /ciudad|pais|zona|ubicacion|sector|donde/.test(h) },
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

/** "21/10/2026 14:30:05" (formato de Google en español), fechas ISO o fechas de Excel */
function parseDate(text: string): string {
  // En un .xlsx la fecha es un número de días desde 1899-12-30, en hora local de Caracas
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    return new Date((Number(text) - 25569) * 86_400_000 + 4 * 3_600_000).toISOString();
  }
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) {
    const [, d, m, y, h = '0', min = '0', s = '0'] = match;
    return new Date(Date.UTC(+y, +m - 1, +d, +h + 4, +min, +s)).toISOString();
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

/** Los códigos guardados como número pierden los ceros iniciales: se recuperan */
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Día y mes del cumpleaños, venga como venga: fecha de Excel, "15/03/1995", "15-03",
 * "1995-03-15" o "15 de marzo". Con números, primero va el día (como se escribe en
 * Venezuela), salvo que el segundo número no pueda ser un mes.
 */
export function parseBirthday(text: string): { dia: number; mes: number } | null {
  const raw = normalize(text);
  if (!raw) return null;
  const valid = (dia: number, mes: number) => (mes >= 1 && mes <= 12 && dia >= 1 && dia <= DAYS_IN_MONTH[mes - 1] ? { dia, mes } : null);

  // Fecha de Excel: días desde 1899-12-30
  if (/^\d{4,5}(\.\d+)?$/.test(raw) && Number(raw) > 1000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(raw)) * 86400000);
    return valid(date.getUTCDate(), date.getUTCMonth() + 1);
  }
  const iso = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return valid(Number(iso[3]), Number(iso[2]));

  const numbers = raw.match(/^(\d{1,2})[-/. ](\d{1,2})(?:[-/. ](\d{2,4}))?$/);
  if (numbers) {
    const a = Number(numbers[1]);
    const b = Number(numbers[2]);
    return b > 12 ? valid(b, a) : valid(a, b);
  }

  // "15 de marzo", "marzo 15", "15 mar 1995"
  const day = raw.match(/\b(\d{1,2})\b/);
  const monthIndex = [MONTHS, MONTHS_EN].map((list) => list.findIndex((m) => new RegExp(`\\b${m}`).test(raw))).find((i) => i >= 0) ?? -1;
  if (day && monthIndex >= 0) return valid(Number(day[1]), monthIndex + 1);
  return null;
}

function parseCode(text: string): string {
  const digits = text.replace(/\D/g, '');
  return digits.length > 0 && digits.length < 12 ? digits.padStart(12, '0') : digits.length === 12 ? digits : '';
}

export interface ImportPreview {
  members: ImportedMember[];
  columns: { label: string; header: string | null }[];
  withoutCode: number;
  withBirthday: number;
}

/** Acepta el archivo tal como lo descarga Google: Excel (.xlsx) o CSV */
export async function readMembersFromFile(file: File): Promise<ImportPreview> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xls')) {
    throw new Error('Ese es el formato de Excel antiguo (.xls). Guárdalo como .xlsx o descárgalo de Google como .xlsx o .csv.');
  }
  const rows = name.endsWith('.xlsx') ? await readXlsxRows(await file.arrayBuffer()) : parseCsv(await file.text());
  const preview = readMembers(rows);
  // El Pokémon favorito viene escrito con su nombre: se busca su número
  for (const member of preview.members) {
    if (member.pokemonTexto) member.pokemon = (await pokemonNumber(member.pokemonTexto)) ?? null;
  }
  return preview;
}

export function readMembers([headerRow = [], ...rows]: string[][]): ImportPreview {
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
  // Un enlace nunca es una ciudad (por ejemplo, el link de Drive de una captura)
  const place = (row: string[]) => (/^https?:\/\//i.test(get(row, 'ciudad')) ? '' : get(row, 'ciudad'));
  const members = rows
    .map((row) => {
      const campfire = normalize(get(row, 'campfire'));
      const edad = parseInt(get(row, 'edad'), 10);
      const birthday = parseBirthday(get(row, 'cumple'));
      return {
        fecha: parseDate(get(row, 'fecha')),
        entrenador: get(row, 'entrenador'),
        nombre: get(row, 'nombre'),
        ciudad: place(row),
        telefono: get(row, 'telefono'),
        codigo: parseCode(get(row, 'codigo')),
        // Si la hoja solo tenía el usuario de Campfire, tenerlo escrito cuenta como "Sí"
        campfire: campfire.startsWith('s') ? true : campfire.startsWith('n') ? false : get(row, 'campfireNombre') ? true : null,
        campfireNombre: get(row, 'campfireNombre'),
        edad: Number.isInteger(edad) ? edad : null,
        cumpleDia: birthday?.dia ?? null,
        cumpleMes: birthday?.mes ?? null,
        pokemon: null as number | null,
        pokemonTexto: get(row, 'pokemon'),
      };
    })
    .filter((m) => m.entrenador);

  return {
    members,
    columns: FIELDS.map((f) => ({ label: f.label, header: map.has(f.key) ? headerRow[map.get(f.key)!] : null })),
    withoutCode: members.filter((m) => !m.codigo).length,
    withBirthday: members.filter((m) => m.cumpleDia).length,
  };
}
