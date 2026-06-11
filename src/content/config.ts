import { defineCollection, z } from 'astro:content';

const rooms = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    sutochnoId: z.string(),
    sourceUrl: z.string().url(),
    icalUrl: z.string().url(),
    priceFrom: z.number(),
    currency: z.string().default('BYN'),
    capacity: z.number(),
    baseGuests: z.number(),
    extraGuestPrice: z.number().optional(),
    area: z.string(),
    floor: z.string(),
    beds: z.string(),
    bedrooms: z.number().optional(),
    rating: z.number().optional(),
    reviews: z.number().optional(),
    shortDescription: z.string(),
    description: z.string(),
    amenities: z.array(z.string()),
    kitchen: z.array(z.string()),
    bathroom: z.array(z.string()),
    rules: z.array(z.string()),

    // Поддерживает и локальные пути /images/..., и внешние https://...
    images: z.array(z.string()),
    heroImage: z.string()
  })
});

const saunas = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    calendarId: z.string(),
    icalUrl: z.string().url(),
    priceFrom: z.number(),
    currency: z.string().default('BYN'),
    capacity: z.number(),
    duration: z.string(),
    area: z.string().optional(),
    shortDescription: z.string(),
    description: z.string(),
    amenities: z.array(z.string()),
    rules: z.array(z.string()),

    // Поддерживает и локальные пути /images/..., и внешние https://...
    images: z.array(z.string()),
    heroImage: z.string()
  })
});

const guides = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    excerpt: z.string(),
    image: z.string(),
    order: z.number().default(1)
  })
});

export const collections = { rooms, saunas, guides };