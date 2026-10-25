import { getCollection } from 'astro:content';
import { sortByStart, type Evento } from './eventos';

/** Todos los eventos cargados, ordenados del más próximo al más lejano */
export async function getEventos(): Promise<Evento[]> {
  const entries = await getCollection('eventos');
  return sortByStart(entries.map((entry) => ({ id: entry.id, ...entry.data })));
}
