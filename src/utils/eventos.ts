/**
 * Utilidades compartidas para los eventos y quedadas de Emerald City.
 * Se usan tanto al compilar el sitio como en el navegador (sección semanal,
 * cuenta regresiva y panel de administración).
 *
 * Todas las fechas se interpretan en hora de Caracas (UTC-4, sin horario de verano).
 */

export const EVENT_TYPES = [
  'Día de la Comunidad',
  'Incursiones',
  'GO Tour',
  'GO Fest',
  'Wild Area',
  'Combates Max',
  'Hora Destacada',
  'Evento del juego',
  'Quedada',
  'Torneo PvP',
  'Otro',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

// Lugar oficial de los Días de la Comunidad
export const DEFAULT_EVENT_LOCATION = 'Parque del Este, Caracas';

export interface Evento {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM (24h)
  location: string;
  type: EventType;
  description: string;
  flyer: string;
  image?: string; // Ilustración del Pokémon principal (eventos automáticos)
  link?: string; // Página oficial del evento (eventos automáticos)
  reunion?: boolean; // false = evento del juego sin quedada (por defecto hay quedada)
  endDate?: string; // YYYY-MM-DD, para eventos de varios días
  bonus?: string; // bonus de la Hora Destacada, p. ej. "Doble experiencia por evolución"
}

export const hasMeetup = (e: Pick<Evento, 'reunion'>) => e.reunion !== false;

/** Último día del evento */
export const eventEnd = (e: Pick<Evento, 'date' | 'endDate'>) => e.endDate ?? e.date;

/** ¿El evento ocurre (aunque sea un día) entre `start` y `end`? */
export function overlaps(e: Pick<Evento, 'date' | 'endDate'>, start: string, end: string): boolean {
  return e.date <= end && eventEnd(e) >= start;
}

const CARACAS_OFFSET_MS = -4 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Instante (ms) en que empieza el evento */
export function eventStart(e: Pick<Evento, 'date' | 'time'>): number {
  return new Date(`${e.date}T${e.time || '00:00'}:00-04:00`).getTime();
}

/** Fecha de hoy en Caracas como YYYY-MM-DD */
export function caracasToday(now: number = Date.now()): string {
  return new Date(now + CARACAS_OFFSET_MS).toISOString().slice(0, 10);
}

function parseDay(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Lunes y domingo (YYYY-MM-DD) de la semana que contiene `date` */
export function weekRange(date: string): { start: string; end: string } {
  const d = parseDay(date);
  const offsetToMonday = (d.getUTCDay() + 6) % 7;
  const start = new Date(d.getTime() - offsetToMonday * DAY_MS);
  const end = new Date(start.getTime() + 6 * DAY_MS);
  return { start: toDay(start), end: toDay(end) };
}

/**
 * Semana que conviene compartir en el flyer: la actual, salvo los domingos,
 * cuando ya interesa la que empieza el lunes siguiente.
 */
export function flyerWeek(today: string): { start: string; end: string; isNext: boolean } {
  const isSunday = parseDay(today).getUTCDay() === 0;
  return { ...weekRange(isSunday ? addDays(today, 1) : today), isNext: isSunday };
}

export function addDays(date: string, days: number): string {
  return toDay(new Date(parseDay(date).getTime() + days * DAY_MS));
}

/** "2:00 PM" */
export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "Sábado 31 de octubre" */
export function formatLongDate(date: string): string {
  const d = parseDay(date);
  return `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} de ${MONTH_NAMES[d.getUTCMonth()]}`;
}

/** "Sábado" */
export function dayName(date: string): string {
  return DAY_NAMES[parseDay(date).getUTCDay()];
}

/** "31 oct" */
export function formatShortDate(date: string): string {
  const d = parseDay(date);
  return `${d.getUTCDate()} ${MONTH_SHORT[d.getUTCMonth()]}`;
}

/** "26 oct – 1 nov 2026" */
export function formatWeekRange(start: string, end: string): string {
  const year = parseDay(end).getUTCFullYear();
  return `${formatShortDate(start)} – ${formatShortDate(end)} ${year}`;
}

export function sortByStart<T extends Pick<Evento, 'date' | 'time'>>(events: T[]): T[] {
  return [...events].sort((a, b) => eventStart(a) - eventStart(b));
}

/** "31 oct – 2 nov" para eventos de varios días */
export function formatDateRange(e: Pick<Evento, 'date' | 'endDate'>): string {
  return e.endDate && e.endDate !== e.date ? `${formatShortDate(e.date)} – ${formatShortDate(e.endDate)}` : formatShortDate(e.date);
}
