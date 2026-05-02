import type { APIRoute } from 'astro';

export const prerender = false;

function clean(value: unknown): string {
  return String(value ?? '').trim().slice(0, 1200);
}

export const POST: APIRoute = async ({ request }) => {
  const token = import.meta.env.TELEGRAM_BOT_TOKEN;
  const chatId = import.meta.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing Telegram environment variables' }), { status: 500 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 });
  }

  const message = [
    '🕯️ <b>Новая заявка — Агроусадьба Несвижская</b>',
    '',
    `🏰 <b>Покой:</b> ${clean(payload.roomTitle) || 'не выбран'}`,
    `👤 <b>Имя:</b> ${clean(payload.name)}`,
    `📞 <b>Телефон:</b> ${clean(payload.phone)}`,
    `💬 <b>Мессенджер:</b> ${clean(payload.messenger)}`,
    `📅 <b>Заезд:</b> ${clean(payload.checkIn) || clean(payload.manualCheckIn) || 'не указан'}`,
    `📅 <b>Выезд:</b> ${clean(payload.checkOut) || clean(payload.manualCheckOut) || 'не указан'}`,
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
    return new Response(JSON.stringify({ ok: false, error: text }), { status: 502 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
