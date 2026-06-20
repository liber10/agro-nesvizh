import type { APIRoute } from 'astro';
import { getStore } from '@netlify/blobs';
import { createHash, randomBytes } from 'node:crypto';

export const prerender = false;

type DuplicateEntry = {
  expires: number;
  submittedAt: string;
};

type TelegramConfirmationEntry = {
  expires: number;
  createdAt: string;
  message: string;
  normalizedPhone: string;
};

const duplicateMemoryCache = new Map<string, DuplicateEntry>();
const confirmationMemoryCache = new Map<string, TelegramConfirmationEntry>();
const pendingPhones = new Set<string>();

const DUPLICATE_TTL_MINUTES = Number(import.meta.env.BOOKING_DUPLICATE_TTL_MINUTES || 30);
const DUPLICATE_TTL_MS = Math.max(1, DUPLICATE_TTL_MINUTES) * 60 * 1000;
const CONFIRMATION_TTL_MINUTES = Number(import.meta.env.TELEGRAM_CONFIRMATION_TTL_MINUTES || 1440);
const CONFIRMATION_TTL_MS = Math.max(5, CONFIRMATION_TTL_MINUTES) * 60 * 1000;

function clean(value: unknown): string {
  return String(value ?? '').trim().slice(0, 1200);
}

function escapeHtml(value: unknown): string {
  return clean(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function normalizePhone(value: unknown): string {
  let raw = clean(value).replace(/\D/g, '');

  if (raw.startsWith('80')) {
    raw = `375${raw.slice(2)}`;
  }

  if (raw.startsWith('8') && raw.length === 11) {
    raw = `7${raw.slice(1)}`;
  }

  return raw;
}

function duplicateKey(phone: string): string {
  return createHash('sha256').update(phone).digest('hex');
}

async function getDuplicateFromBlob(key: string): Promise<DuplicateEntry | null> {
  try {
    const store = getStore('booking-deduplication');
    return await store.get(key, { type: 'json' });
  } catch {
    return null;
  }
}

async function setDuplicateInBlob(key: string, value: DuplicateEntry): Promise<void> {
  try {
    const store = getStore('booking-deduplication');
    await store.setJSON(key, value);
  } catch {
    // Local dev and non-Netlify environments fall back to memory cache.
  }
}

async function isDuplicateSubmission(phone: string): Promise<boolean> {
  if (!phone) {
    return false;
  }

  const key = duplicateKey(phone);
  const now = Date.now();

  if (pendingPhones.has(key)) {
    return true;
  }

  const memoryEntry = duplicateMemoryCache.get(key);

  if (memoryEntry && memoryEntry.expires > now) {
    return true;
  }

  const blobEntry = await getDuplicateFromBlob(key);

  if (blobEntry && blobEntry.expires > now) {
    duplicateMemoryCache.set(key, blobEntry);
    return true;
  }

  if (memoryEntry && memoryEntry.expires <= now) {
    duplicateMemoryCache.delete(key);
  }

  return false;
}

async function rememberSubmission(phone: string): Promise<void> {
  if (!phone) {
    return;
  }

  const key = duplicateKey(phone);
  const value = {
    expires: Date.now() + DUPLICATE_TTL_MS,
    submittedAt: new Date().toISOString()
  };

  duplicateMemoryCache.set(key, value);
  await setDuplicateInBlob(key, value);
}

function createConfirmationToken(): string {
  return randomBytes(12).toString('hex');
}

async function rememberTelegramConfirmation(token: string, value: TelegramConfirmationEntry): Promise<void> {
  confirmationMemoryCache.set(token, value);

  try {
    const store = getStore('telegram-confirmations');
    await store.setJSON(token, value);
  } catch {
    // Local dev and non-Netlify environments fall back to memory cache.
  }
}

function getTelegramRecipients(): string[] {
  const groupChatId = clean(import.meta.env.TELEGRAM_GROUP_CHAT_ID);
  const ownerChatId = clean(import.meta.env.TELEGRAM_CHAT_ID);
  const sendOwnerCopy = clean(import.meta.env.TELEGRAM_SEND_OWNER_COPY).toLowerCase() !== 'false';
  const recipients = [groupChatId || ownerChatId];

  if (groupChatId && ownerChatId && sendOwnerCopy) {
    recipients.push(ownerChatId);
  }

  return [...new Set(recipients.filter(Boolean))];
}

function getTelegramBotUsername(): string {
  return clean(import.meta.env.TELEGRAM_BOT_USERNAME || 'nesvizh_bot').replace(/^@+/, '');
}

function normalizeTelegramUsername(value: unknown): string {
  return clean(value)
    .replace(/^@+/, '')
    .replace(/[^\w\d_]/g, '')
    .slice(0, 32);
}

async function sendTelegramMessage(token: string, chatId: string, message: string): Promise<Response> {
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

function makeDateTimeLine(payload: Record<string, unknown>): string {
  const bookingType = clean(payload.bookingType);
  const checkIn = escapeHtml(payload.checkIn) || escapeHtml(payload.manualCheckIn);
  const checkOut = escapeHtml(payload.checkOut) || escapeHtml(payload.manualCheckOut);
  const startTime = escapeHtml(payload.startTime) || escapeHtml(payload.manualStartTime);
  const endTime = escapeHtml(payload.endTime) || escapeHtml(payload.manualEndTime);

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

function makeGuestConfirmationMessage(payload: Record<string, unknown>): string {
  const bookingType = escapeHtml(payload.bookingType) || 'Бронирование';
  const objectTitle = escapeHtml(payload.roomTitle) || 'не выбран';

  return [
    '✅ <b>Заявка принята</b>',
    '',
    'Мы получили вашу заявку и передали ее владельцу.',
    '',
    `🏷️ <b>Тип:</b> ${bookingType}`,
    `🏰 <b>Объект:</b> ${objectTitle}`,
    makeDateTimeLine(payload),
    '',
    'Скоро с вами свяжутся для подтверждения даты и условий.'
  ].join('\n');
}

export const POST: APIRoute = async ({ request }) => {
  const token = import.meta.env.TELEGRAM_BOT_TOKEN;
  const recipients = getTelegramRecipients();

  if (!token || !recipients.length) {
    return jsonResponse({ ok: false, error: 'Missing Telegram environment variables' }, 500);
  }

  let payload: Record<string, unknown>;

  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const normalizedPhone = normalizePhone(payload.phone);

  if (!normalizedPhone) {
    return jsonResponse({ ok: false, error: 'Phone is required' }, 400);
  }

  if (await isDuplicateSubmission(normalizedPhone)) {
    return jsonResponse(
      {
        ok: false,
        duplicate: true,
        message: 'Заявка с этого телефона уже принята. Пожалуйста, дождитесь ответа владельца.'
      },
      409
    );
  }

  const pendingKey = duplicateKey(normalizedPhone);
  pendingPhones.add(pendingKey);

  const bookingType = escapeHtml(payload.bookingType) || 'Бронирование';
  const objectTitle = escapeHtml(payload.roomTitle) || 'не выбран';
  const messenger = escapeHtml(payload.messenger) || 'не указан';
  const telegramUsername = normalizeTelegramUsername(payload.telegramUsername);
  const wantsTelegram = clean(payload.messenger) === 'Telegram';
  const botUsername = getTelegramBotUsername();

  const message = [
    '🕯️ <b>Новая заявка — Агроусадьба Несвижская</b>',
    '',
    `🏷️ <b>Тип:</b> ${bookingType}`,
    `🏰 <b>Объект:</b> ${objectTitle}`,
    `👤 <b>Имя:</b> ${escapeHtml(payload.name)}`,
    `📞 <b>Телефон:</b> ${escapeHtml(payload.phone)}`,
    `💬 <b>Связаться:</b> ${messenger}`,
    telegramUsername ? `📨 <b>Telegram:</b> @${escapeHtml(telegramUsername)}` : '',
    makeDateTimeLine(payload),
    '',
    `📝 <b>Комментарий:</b> ${escapeHtml(payload.comment) || '—'}`,
    '',
    `🔗 <b>Источник:</b> сайт`
  ].filter(Boolean).join('\n');

  try {
    const results = await Promise.all(recipients.map((chatId) => sendTelegramMessage(token, chatId, message)));
    const failedResponse = results.find((response) => !response.ok);

    if (failedResponse) {
      const text = await failedResponse.text();

      return jsonResponse({ ok: false, error: text }, 502);
    }

    await rememberSubmission(normalizedPhone);

    let telegramBotUrl: string | undefined;

    if (wantsTelegram && botUsername) {
      const confirmationToken = createConfirmationToken();

      await rememberTelegramConfirmation(confirmationToken, {
        expires: Date.now() + CONFIRMATION_TTL_MS,
        createdAt: new Date().toISOString(),
        message: makeGuestConfirmationMessage(payload),
        normalizedPhone
      });

      telegramBotUrl = `https://t.me/${botUsername}?start=booking_${confirmationToken}`;
    }

    return jsonResponse({
      ok: true,
      message: wantsTelegram
        ? 'Заявка принята. Бот передал ее в Telegram. Откройте бота и нажмите Start, чтобы получить подтверждение в Telegram.'
        : 'Заявка принята. Бот передал ее в Telegram, скоро с вами свяжутся.',
      telegramBotUrl
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error) }, 502);
  } finally {
    pendingPhones.delete(pendingKey);
  }
};
