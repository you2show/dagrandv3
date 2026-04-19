import { supabase } from './supabaseClient';

export type TelegramContactPayload = {
  name?: string;
  email?: string;
  phone?: string;
  subject?: string;
  message: string;
};

export type TelegramSendResult = {
  success: true;
  message: string;
  telegramDeliveries: Array<{ chatId: string; telegramMessageId: number | null }>;
};

const normalize = (value?: string) => value?.trim() || '';

const escapeHtml = (str: string) =>
  str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c] ?? c));

// ---------------------------------------------------------------------------
// Direct-to-Telegram path (no Supabase required)
// Set VITE_TELEGRAM_BOT_TOKEN and optionally VITE_TELEGRAM_CHAT_ID in your
// .env / .env.local file to use this simpler path.
// ---------------------------------------------------------------------------
const DIRECT_BOT_TOKEN: string = (import.meta as any).env?.VITE_TELEGRAM_BOT_TOKEN ?? '';
const DIRECT_CHAT_ID: string =
  (import.meta as any).env?.VITE_TELEGRAM_CHAT_ID ?? '-1003986946717';
const TELEGRAM_TIMEOUT_MS = 10_000;

const sendDirect = async (payload: ReturnType<typeof buildPayload>): Promise<TelegramSendResult> => {
  const text =
    `📩 <b>New Contact Message (dagrandv3)</b>\n\n` +
    `👤 <b>Name:</b> ${escapeHtml(payload.name || 'N/A')}\n` +
    `📧 <b>Email:</b> ${escapeHtml(payload.email || 'N/A')}\n` +
    `📝 <b>Subject:</b> ${escapeHtml(payload.subject || 'N/A')}\n` +
    `💬 <b>Message:</b>\n${escapeHtml(payload.message)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(
      `https://api.telegram.org/bot${DIRECT_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: DIRECT_CHAT_ID,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      }
    );
  } catch (err) {
    const isTimeout =
      err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
    throw new Error(isTimeout ? 'Request timed out. Please try again.' : 'Network error. Please check your connection.');
  } finally {
    clearTimeout(timeoutId);
  }

  let json: any;
  try { json = await response.json(); } catch { json = null; }

  if (!response.ok || !json?.ok) {
    const desc: string =
      typeof json?.description === 'string' && json.description.trim()
        ? json.description.trim()
        : `Telegram error ${response.status}`;
    throw new Error(desc);
  }

  return {
    success: true,
    message: 'Message sent successfully',
    telegramDeliveries: [{ chatId: DIRECT_CHAT_ID, telegramMessageId: json?.result?.message_id ?? null }],
  };
};

// ---------------------------------------------------------------------------
// Supabase Edge Function path (fallback)
// ---------------------------------------------------------------------------
const sendViaEdgeFunction = async (payload: ReturnType<typeof buildPayload>): Promise<TelegramSendResult> => {
  if (!supabase) {
    throw new Error('Contact service is unavailable. Please set VITE_TELEGRAM_BOT_TOKEN.');
  }

  const { data: result, error } = await supabase.functions.invoke('contact-form', { body: payload });

  if (error) {
    let msg = error.message || 'Failed to send message.';
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const ctx = await context.clone().json();
        if (typeof ctx?.error === 'string' && ctx.error.trim()) msg = ctx.error.trim();
      } catch { /* keep fallback */ }
    }
    throw new Error(msg);
  }

  if (!result?.success) {
    throw new Error(result?.error || 'Failed to send message. Please try again.');
  }

  return result as TelegramSendResult;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const buildPayload = (data: TelegramContactPayload) => ({
  name: normalize(data.name),
  email: normalize(data.email),
  phone: normalize(data.phone),
  subject: normalize(data.subject),
  message: normalize(data.message),
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export const sendTelegramMessage = async (data: TelegramContactPayload): Promise<TelegramSendResult> => {
  const payload = buildPayload(data);

  if (!payload.message) {
    throw new Error('Message is required.');
  }

  // Use direct Telegram API call when bot token is configured — no Supabase needed.
  if (DIRECT_BOT_TOKEN) {
    return sendDirect(payload);
  }

  // Fallback: route through Supabase Edge Function.
  return sendViaEdgeFunction(payload);
};
