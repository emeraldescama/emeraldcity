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

const bazarCollection = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    category: z.enum(['Miniaturas', 'Útiles', 'Cosplay/Accesorios']),
    description: z.string(),
    material: z.string(),
    dimensions: z.string(),
    image: z.string(),
    available: z.boolean().default(true),
    quote_message: z.string().optional(),
  }),
});

const gimmiPassCollection = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    description: z.string(),
    items_included: z.array(z.string()),
    price_ref: z.number(),
    image: z.string(),
    featured: z.boolean().default(false),
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
  }),
});

// Collections updated with real 3D products
export const collections = {
  'noticias': noticiasCollection,
  'bazar': bazarCollection,
  'gimmi-pass': gimmiPassCollection,
  'eventos': eventosCollection,
};

