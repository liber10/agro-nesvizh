import type { APIRoute } from 'astro';
import ical from 'node-ical';
import { getCollection } from 'astro:content';
import { addDays, differenceInCalendarDays, format, isBefore, startOfDay } from 'date-fns';

export const prerender = false;

type CachedAvailability = {
  expires: number;
  value: {
    slug: string;
    bookedDates: string[];
    updatedAt: string;
  };
};

const memoryCache = new Map<string, CachedAvailability>();
const CACHE_TTL_MS = 1000 * 60 * 20;
const HORIZON_DAYS = 60;

function enumerateNights(start: Date, end: Date, today: Date, horizon: Date): string[] {
  const dates: string[] = [];
  let current = startOfDay(start);
  const checkout = startOfDay(end);

  if (isBefore(current, today)) current = today;
  if (isBefore(horizon, checkout)) {
    // keep only first 60 days to avoid very large or recurring ranges
  }

  while (isBefore(current, checkout) && !isBefore(horizon, current)) {
    dates.push(format(current, 'yyyy-MM-dd'));
    current = addDays(current, 1);
  }
  return dates;
}

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug;
  if (!slug) return new Response(JSON.stringify({ error: 'Missing slug' }), { status: 400 });

  const cached = memoryCache.get(slug);
  if (cached && cached.expires > Date.now()) {
    return new Response(JSON.stringify(cached.value), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=600'
      }
    });
  }

  const rooms = await getCollection('rooms');
  const room = rooms.find((entry) => entry.slug === slug);

  if (!room) return new Response(JSON.stringify({ error: 'Room not found' }), { status: 404 });

  try {
    const today = startOfDay(new Date());
    const horizon = addDays(today, HORIZON_DAYS);
    const calendar = await ical.async.fromURL(room.data.icalUrl);
    const booked = new Set<string>();

    Object.values(calendar).forEach((item: any) => {
      if (item.type !== 'VEVENT' || !item.start || !item.end) return;

      const start = new Date(item.start);
      const end = new Date(item.end);
      const durationDays = Math.max(1, differenceInCalendarDays(end, start));

      if (item.rrule?.between) {
        const occurrences = item.rrule.between(today, horizon, true);
        occurrences.forEach((occurrence: Date) => {
          const occurrenceEnd = addDays(occurrence, durationDays);
          enumerateNights(occurrence, occurrenceEnd, today, horizon).forEach((date) => booked.add(date));
        });
        return;
      }

      enumerateNights(start, end, today, horizon).forEach((date) => booked.add(date));
    });

    const value = {
      slug,
      bookedDates: [...booked].sort(),
      updatedAt: new Date().toISOString()
    };

    memoryCache.set(slug, { expires: Date.now() + CACHE_TTL_MS, value });

    return new Response(JSON.stringify(value), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=600'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to load iCal calendar', details: String(error) }), { status: 502 });
  }
};

