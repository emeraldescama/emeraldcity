import { defineCollection, z } from 'astro:content';

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

// Collections updated with real 3D products
export const collections = {
  'noticias': noticiasCollection,
  'bazar': bazarCollection,
  'gimmi-pass': gimmiPassCollection,
};

