import type { APIRoute } from 'astro';
import ical from 'node-ical';
import { getCollection } from 'astro:content';
import { addDays, addMilliseconds, startOfDay } from 'date-fns';

export const prerender = false;

type BookedSlot = {
  date: string;
  start: string;
  end: string;
  title: string;
};

type AvailabilityResponse = {
  slug: string;
  bookedSlots: BookedSlot[];
  updatedAt: string;
  source: string;
  timeZone: string;
};

type CachedAvailability = {
  expires: number;
  value: AvailabilityResponse;
};

const memoryCache = new Map<string, CachedAvailability>();

const CACHE_TTL_MS = 1000 * 60 * 10;
const HORIZON_DAYS = 60;
const TIME_ZONE = 'Europe/Minsk';

function formatDateInTimeZone(date: Date, timeZone = TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

function formatTimeInTimeZone(date: Date, timeZone = TIME_ZONE): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

function isAllDayEvent(item: any): boolean {
  if (!item.start || !item.end) return false;

  const start = new Date(item.start);
  const end = new Date(item.end);

  return (
    start.getUTCHours() === 0 &&
    start.getUTCMinutes() === 0 &&
    end.getUTCHours() === 0 &&
    end.getUTCMinutes() === 0 &&
    end.getTime() - start.getTime() >= 24 * 60 * 60 * 1000
  );
}

function pushSlot(slots: BookedSlot[], item: any, start: Date, end: Date) {
  const title = String(item.summary || 'Баня занята');

  if (isAllDayEvent({ start, end })) {
    slots.push({
      date: formatDateInTimeZone(start),
      start: '00:00',
      end: '23:59',
      title
    });

    return;
  }

  slots.push({
    date: formatDateInTimeZone(start),
    start: formatTimeInTimeZone(start),
    end: formatTimeInTimeZone(end),
    title
  });
}

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug;

  if (!slug) {
    return new Response(JSON.stringify({ error: 'Missing slug' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const cached = memoryCache.get(slug);

  if (cached && cached.expires > Date.now()) {
    return new Response(JSON.stringify(cached.value), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300'
      }
    });
  }

  const saunas = await getCollection('saunas');
  const sauna = saunas.find((entry) => entry.slug === slug);

  if (!sauna) {
    return new Response(JSON.stringify({ error: 'Sauna not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const today = startOfDay(new Date());
    const horizon = addDays(today, HORIZON_DAYS);
    const calendar = await ical.async.fromURL(sauna.data.icalUrl);

    const bookedSlots: BookedSlot[] = [];

    Object.values(calendar).forEach((item: any) => {
      if (item.type !== 'VEVENT' || !item.start || !item.end) {
        return;
      }

      if (String(item.transparency || '').toUpperCase() === 'TRANSPARENT') {
        return;
      }

      const start = new Date(item.start);
      const end = new Date(item.end);
      const durationMs = Math.max(30 * 60 * 1000, end.getTime() - start.getTime());

      if (end < today || start > horizon) {
        return;
      }

      if (item.rrule?.between) {
        const occurrences = item.rrule.between(today, horizon, true);

        occurrences.forEach((occurrence: Date) => {
          const occurrenceEnd = addMilliseconds(occurrence, durationMs);
          pushSlot(bookedSlots, item, occurrence, occurrenceEnd);
        });

        return;
      }

      pushSlot(bookedSlots, item, start, end);
    });

    const value: AvailabilityResponse = {
      slug,
      bookedSlots: bookedSlots.sort((a, b) => {
        const byDate = a.date.localeCompare(b.date);
        if (byDate !== 0) return byDate;
        return a.start.localeCompare(b.start);
      }),
      updatedAt: new Date().toISOString(),
      source: 'google-calendar-ical',
      timeZone: TIME_ZONE
    };

    memoryCache.set(slug, {
      expires: Date.now() + CACHE_TTL_MS,
      value
    });

    return new Response(JSON.stringify(value), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300'
      }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to load sauna iCal calendar',
        details: String(error)
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};