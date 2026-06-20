import type { APIRoute } from 'astro';
import { getStore } from '@netlify/blobs';

export const prerender = false;

type TelegramConfirmationEntry = {
  expires: number;
  createdAt: string;
  message: string;
  normalizedPhone: string;
};

type TelegramUpdate = {
  message?: {
    chat?: {
      id?: number | string;
    };
    text?: string;
  };
};

function clean(value: unknown): string {
  return String(value ?? '').trim().slice(0, 1200);
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function getConfirmation(token: string): Promise<TelegramConfirmationEntry | null> {
  try {
    const store = getStore('telegram-confirmations');
    return await store.get(token, { type: 'json' });
  } catch {
    return null;
  }
}

async function sendTelegramMessage(token: string, chatId: string | number, message: string): Promise<Response> {
  return fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  });
}

function getStartPayload(text: string): string {
  const [command, payload = ''] = text.trim().split(/\s+/, 2);

  if (!command.startsWith('/start')) {
    return '';
  }

  return payload;
}

function getConfirmationToken(payload: string): string {
  if (!payload.startsWith('booking_')) {
    return '';
  }

  return payload.replace(/^booking_/, '').replace(/[^\da-f]/gi, '').slice(0, 24);
}

export const POST: APIRoute = async ({ request }) => {
  const botToken = import.meta.env.TELEGRAM_BOT_TOKEN;
  const webhookSecret = clean(import.meta.env.TELEGRAM_WEBHOOK_SECRET);

  if (!botToken) {
    return jsonResponse({ ok: false, error: 'Missing TELEGRAM_BOT_TOKEN' }, 500);
  }

  if (webhookSecret && request.headers.get('x-telegram-bot-api-secret-token') !== webhookSecret) {
    return jsonResponse({ ok: false, error: 'Invalid webhook secret' }, 401);
  }

  let update: TelegramUpdate;

  try {
    update = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const chatId = update.message?.chat?.id;
  const text = clean(update.message?.text);
  const payload = getStartPayload(text);
  const confirmationToken = getConfirmationToken(payload);

  if (!chatId || !text.startsWith('/start')) {
    return jsonResponse({ ok: true, ignored: true });
  }

  if (!confirmationToken) {
    await sendTelegramMessage(
      botToken,
      chatId,
      'Здравствуйте! Заявки с сайта приходят владельцу. Если вы отправили заявку, вернитесь на сайт и нажмите кнопку открытия бота после отправки формы.'
    );

    return jsonResponse({ ok: true, generic: true });
  }

  const confirmation = await getConfirmation(confirmationToken);

  if (!confirmation || confirmation.expires <= Date.now()) {
    await sendTelegramMessage(
      botToken,
      chatId,
      'Ссылка подтверждения заявки устарела. Пожалуйста, отправьте заявку на сайте еще раз.'
    );

    return jsonResponse({ ok: true, expired: true });
  }

  const response = await sendTelegramMessage(botToken, chatId, confirmation.message);

  if (!response.ok) {
    return jsonResponse({ ok: false, error: await response.text() }, 502);
  }

  return jsonResponse({ ok: true });
};
