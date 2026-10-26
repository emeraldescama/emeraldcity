import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCollection } from 'astro:content';
import { sortByStart, type Evento } from './eventos';

/**
 * Agrega "?v=…" con una huella del archivo, para que el navegador descargue la imagen
 * nueva cuando un flyer cambia (si no, muestra la vieja guardada en caché hasta por días).
 */
function versioned(url: string | undefined): string | undefined {
  if (!url?.startsWith('/')) return url;
  const file = join(process.cwd(), 'public', url);
  if (!existsSync(file)) return url;
  const hash = createHash('md5').update(readFileSync(file)).digest('hex').slice(0, 8);
  return `${url}?v=${hash}`;
}

/** Todos los eventos cargados, ordenados del más próximo al más lejano */
export async function getEventos(): Promise<Evento[]> {
  const entries = await getCollection('eventos');
  return sortByStart(
    entries.map((entry) => ({
      id: entry.id,
      ...entry.data,
      flyer: versioned(entry.data.flyer) ?? entry.data.flyer,
      image: versioned(entry.data.image),
    })),
  );
}
