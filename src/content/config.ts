import { defineCollection, z } from 'astro:content';
import { EVENT_TYPES } from '../utils/eventos';

const noticiasCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    author: z.string().default('Emerald City Team'),
    category: z.enum(['Juego', 'Quedada']),
    description: z.string(),
    image: z.string(),
  }),
});

// Eventos y quedadas cargados desde el panel de administración (/admin)
const eventosCollection = defineCollection({
  type: 'data',
  schema: z.object({
    title: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    location: z.string(),
    type: z.enum(EVENT_TYPES),
    description: z.string().default(''),
    flyer: z.string(),
    image: z.string().optional(),
    link: z.string().url().optional(),
  }),
});

export const collections = {
  'noticias': noticiasCollection,
  'eventos': eventosCollection,
};

