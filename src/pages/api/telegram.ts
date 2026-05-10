import type { APIRoute } from 'astro';

export const prerender = false;

function clean(value: unknown): string {
  return String(value ?? '').trim().slice(0, 1200);
}

function makeDateTimeLine(payload: Record<string, unknown>): string {
  const bookingType = clean(payload.bookingType);
  const checkIn = clean(payload.checkIn) || clean(payload.manualCheckIn);
  const checkOut = clean(payload.checkOut) || clean(payload.manualCheckOut);
  const startTime = clean(payload.startTime) || clean(payload.manualStartTime);
  const endTime = clean(payload.endTime) || clean(payload.manualEndTime);

  if (bookingType === 'Баня') {
    return [
      `📅 <b>Дата:</b> ${checkIn || 'не указана'}`,
      `🕰️ <b>Время:</b> ${startTime || 'не указано'}–${endTime || 'не указано'}`
    ].join('\n');
  }

  return [
    `📅 <b>Заезд:</b> ${checkIn || 'не указан'}`,
    `📅 <b>Выезд:</b> ${checkOut || 'не указан'}`
  ].join('\n');
}

export const POST: APIRoute = async ({ request }) => {
  const token = import.meta.env.TELEGRAM_BOT_TOKEN;
  const chatId = import.meta.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing Telegram environment variables' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let payload: Record<string, unknown>;

  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const bookingType = clean(payload.bookingType) || 'Бронирование';
  const objectTitle = clean(payload.roomTitle) || 'не выбран';

  const message = [
    '🕯️ <b>Новая заявка — Агроусадьба Несвижская</b>',
    '',
    `🏷️ <b>Тип:</b> ${bookingType}`,
    `🏰 <b>Объект:</b> ${objectTitle}`,
    `👤 <b>Имя:</b> ${clean(payload.name)}`,
    `📞 <b>Телефон:</b> ${clean(payload.phone)}`,
    `💬 <b>Мессенджер:</b> ${clean(payload.messenger)}`,
    makeDateTimeLine(payload),
    '',
    `📝 <b>Комментарий:</b> ${clean(payload.comment) || '—'}`,
    '',
    `🔗 <b>Источник:</b> сайт`
  ].join('\n');

  const tgResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  });

  if (!tgResponse.ok) {
    const text = await tgResponse.text();

    return new Response(JSON.stringify({ ok: false, error: text }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};