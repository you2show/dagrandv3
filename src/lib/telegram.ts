import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseClient';

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
  correlationId?: string;
};

const normalize = (value?: string) => value?.trim() || '';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 800;
const REQUEST_TIMEOUT_MS = 15_000;
const APP_NAME = 'Dagrand Law Office';
const TIMEZONE = 'Asia/Phnom_Penh';
const TEST_EMAIL = 'test@dagrand.com';
const CONTACT_FORM_TARGET_CHAT_ID = '905513579';

// Build-time Telegram credentials for the direct-API fallback.
// These are only populated when the corresponding VITE_ env vars are set.
const VITE_TELEGRAM_BOT_TOKEN: string | undefined =
  (import.meta as any).env?.VITE_TELEGRAM_BOT_TOKEN || undefined;
const VITE_TELEGRAM_CHAT_ID: string = CONTACT_FORM_TARGET_CHAT_ID;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const buildPayload = (data: TelegramContactPayload) => ({
  name: normalize(data.name),
  email: normalize(data.email),
  phone: normalize(data.phone),
  subject: normalize(data.subject),
  message: normalize(data.message),
  // Idempotency key: unique per submission, used for logging/tracing server-side.
  idempotencyKey: crypto.randomUUID(),
});

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const backoffMs = (attempt: number) => Math.min(attempt * BASE_BACKOFF_MS, 5_000);

// Extract the most useful error message from a Supabase functions.invoke error.
const extractEdgeFunctionError = async (
  error: { message?: string; context?: unknown },
): Promise<string> => {
  let msg = error.message || 'Failed to send message.';
  const context = error.context as Response | undefined;
  if (context) {
    try {
      const ctx = await context.clone().json();
      if (typeof ctx?.error === 'string' && ctx.error.trim()) msg = ctx.error.trim();
    } catch { /* keep fallback */ }
  }
  return msg;
};

// Escape HTML entities for Telegram HTML parse mode.
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------------------------------------------------------------------------
// Strategy 1 — Supabase SDK invoke (primary)
// Sends the payload via supabase.functions.invoke(). One attempt, no retry
// (retries are handled by the outer orchestrator).
// ---------------------------------------------------------------------------
const sendViaSdk = async (payload: ReturnType<typeof buildPayload>): Promise<TelegramSendResult> => {
  if (!supabase) {
    throw new Error('Supabase client is not initialized.');
  }

  const { data: result, error } = await supabase.functions.invoke('contact-form', {
    body: payload,
    headers: { 'x-request-id': payload.idempotencyKey },
  });

  if (error) {
    const msg = await extractEdgeFunctionError(
      error as { message?: string; context?: unknown },
    );
    throw new Error(msg);
  }

  if (!result?.success) {
    throw new Error(result?.error || 'Edge function returned an unsuccessful response.');
  }

  return result as TelegramSendResult;
};

// ---------------------------------------------------------------------------
// Strategy 2 — Direct fetch to the Edge Function URL (bypasses SDK)
// Useful when the Supabase JS SDK has version-specific issues or
// mishandles headers / CORS internally.
// ---------------------------------------------------------------------------
const sendViaDirectFetch = async (payload: ReturnType<typeof buildPayload>): Promise<TelegramSendResult> => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase URL or anon key is not configured.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = `${SUPABASE_URL}/functions/v1/contact-form`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
        'x-request-id': payload.idempotencyKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorMsg = `Edge function responded with ${response.status}`;
      try {
        const body = await response.json();
        if (typeof body?.error === 'string' && body.error.trim()) {
          errorMsg = body.error.trim();
        }
      } catch { /* keep default */ }
      throw new Error(errorMsg);
    }

    const result = await response.json();
    if (!result?.success) {
      throw new Error(result?.error || 'Edge function returned an unsuccessful response.');
    }

    return result as TelegramSendResult;
  } finally {
    clearTimeout(timeoutId);
  }
};

// ---------------------------------------------------------------------------
// Strategy 3 — Direct Telegram Bot API call (last-resort fallback)
// Only works when VITE_TELEGRAM_BOT_TOKEN is set.
// at build time. Sends the message straight to Telegram without any backend.
//
// ⚠️  SECURITY NOTE: Enabling this strategy exposes the bot token in the
//    client JS bundle. Only set VITE_TELEGRAM_BOT_TOKEN
//    if you accept this tradeoff (e.g. internal/private deployments, or the
//    bot is scoped to a single group with minimal permissions). The strategy
//    is disabled by default when these env vars are absent.
// ---------------------------------------------------------------------------
const sendViaDirectTelegramApi = async (
  payload: ReturnType<typeof buildPayload>,
): Promise<TelegramSendResult> => {
  if (!VITE_TELEGRAM_BOT_TOKEN) {
    throw new Error('Direct Telegram API fallback is not configured.');
  }

  const text =
    `📩 <b>New Contact Message (${APP_NAME})</b>\n\n` +
    `👤 <b>Name:</b> ${escapeHtml(payload.name || 'N/A')}\n` +
    `📧 <b>Email:</b> ${escapeHtml(payload.email || 'N/A')}\n` +
    `📞 <b>Phone:</b> ${escapeHtml(payload.phone || 'N/A')}\n` +
    `📝 <b>Subject:</b> ${escapeHtml(payload.subject || 'N/A')}\n` +
    `💬 <b>Message:</b>\n${escapeHtml(payload.message)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${VITE_TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: VITE_TELEGRAM_CHAT_ID,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      },
    );

    const result = await response.json();
    if (!response.ok || result?.ok !== true) {
      throw new Error(
        result?.description || `Telegram API error (${response.status})`,
      );
    }

    return {
      success: true,
      message: 'Message sent via direct Telegram API fallback',
      telegramDeliveries: [{
        chatId: VITE_TELEGRAM_CHAT_ID,
        telegramMessageId: result?.result?.message_id ?? null,
      }],
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

// ---------------------------------------------------------------------------
// Orchestrator — tries every strategy with retries
// ---------------------------------------------------------------------------
type Strategy = {
  label: string;
  fn: (payload: ReturnType<typeof buildPayload>) => Promise<TelegramSendResult>;
  available: boolean;
};

const getStrategies = (): Strategy[] => [
  { label: 'Supabase SDK', fn: sendViaSdk, available: !!supabase },
  { label: 'Direct fetch', fn: sendViaDirectFetch, available: !!SUPABASE_URL && !!SUPABASE_ANON_KEY },
  {
    label: 'Direct Telegram API',
    fn: sendViaDirectTelegramApi,
    available: !!VITE_TELEGRAM_BOT_TOKEN,
  },
];

const tryWithRetries = async (
  strategyFn: (payload: ReturnType<typeof buildPayload>) => Promise<TelegramSendResult>,
  payload: ReturnType<typeof buildPayload>,
  attempts: number,
): Promise<TelegramSendResult> => {
  let lastError: Error | undefined;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await strategyFn(payload);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (i < attempts) {
        await delay(backoffMs(i));
      }
    }
  }
  throw lastError!;
};

// ---------------------------------------------------------------------------
// Test / Debug API
// ---------------------------------------------------------------------------
export type TelegramTestResult = {
  ok: boolean;
  steps: Array<{ label: string; ok: boolean; detail: string }>;
};

export const testTelegramConnection = async (): Promise<TelegramTestResult> => {
  // Step 1: verify Supabase client is ready
  if (!supabase) {
    return {
      ok: false,
      steps: [{
        label: 'Supabase client initialized',
        ok: false,
        detail: 'Supabase is not configured. VITE_SUPABASE_ANON_KEY must be a valid JWT (eyJ…).',
      }],
    };
  }

  const steps: TelegramTestResult['steps'] = [{
    label: 'Supabase client initialized',
    ok: true,
    detail: 'Supabase client is ready. Calling edge function health check…',
  }];

  // Step 2+: delegate to the Edge Function's GET health-check endpoint which
  // validates the bot token, calls getMe, and probes each configured chat.
  try {
    const { data, error } = await (supabase.functions as any).invoke('contact-form', {
      method: 'GET',
    });

    if (error) {
      const msg = await extractEdgeFunctionError(
        error as { message?: string; context?: unknown },
      );
      steps.push({ label: 'Edge function health check', ok: false, detail: msg });
      return { ok: false, steps };
    }

    if (data && Array.isArray(data.steps)) {
      return { ok: Boolean(data.ok), steps: [...steps, ...data.steps] };
    }

    steps.push({
      label: 'Edge function health check',
      ok: false,
      detail: 'Unexpected response from edge function.',
    });
    return { ok: false, steps };
  } catch (err) {
    steps.push({
      label: 'Edge function health check',
      ok: false,
      detail: err instanceof Error ? err.message : 'Unknown error',
    });
    return { ok: false, steps };
  }
};

// ---------------------------------------------------------------------------
// End-to-end test: sends a real test message through the full pipeline
// ---------------------------------------------------------------------------
export type TestMessageResult = {
  ok: boolean;
  steps: Array<{ label: string; ok: boolean; detail: string }>;
};

export const sendTestMessage = async (): Promise<TestMessageResult> => {
  const steps: TestMessageResult['steps'] = [];

  // Step 1 — health check
  const healthResult = await testTelegramConnection();
  steps.push(...healthResult.steps);

  if (!healthResult.ok) {
    steps.push({
      label: 'Send test message',
      ok: false,
      detail: 'Skipped — health check failed. Fix the issues above first.',
    });
    return { ok: false, steps };
  }

  // Step 2 — actually send a test message through the full delivery pipeline
  const timestamp = new Date().toLocaleString('en-US', {
    timeZone: TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'medium',
  });

  try {
    const result = await sendTelegramMessage({
      name: '🧪 Automated Test',
      email: TEST_EMAIL,
      subject: 'Delivery Pipeline Test',
      message: `This is an automated test message sent at ${timestamp} to verify the contact form → Telegram delivery pipeline is working correctly.\n\nIf you see this in your Telegram group, the pipeline is healthy. ✅`,
    });

    const deliveryCount = result.telegramDeliveries?.length ?? 0;
    const chatIds = result.telegramDeliveries
      ?.map((d) => d.chatId)
      .join(', ') || 'N/A';

    steps.push({
      label: 'Send test message',
      ok: true,
      detail: `Delivered to ${deliveryCount} chat(s): ${chatIds}. Check your Telegram group!`,
    });

    return { ok: true, steps };
  } catch (err) {
    steps.push({
      label: 'Send test message',
      ok: false,
      detail: err instanceof Error ? err.message : 'Unknown delivery error',
    });
    return { ok: false, steps };
  }
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export const sendTelegramMessage = async (data: TelegramContactPayload): Promise<TelegramSendResult> => {
  const payload = buildPayload(data);

  if (!payload.message) {
    throw new Error('Message is required.');
  }

  const strategies = getStrategies().filter((s) => s.available);
  if (strategies.length === 0) {
    throw new Error('No delivery method is available. Please check Supabase or Telegram configuration.');
  }

  const errors: string[] = [];

  for (const strategy of strategies) {
    try {
      return await tryWithRetries(strategy.fn, payload, MAX_ATTEMPTS);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[telegram] Strategy "${strategy.label}" failed after ${MAX_ATTEMPTS} attempts: ${msg}`);
      errors.push(`${strategy.label}: ${msg}`);
    }
  }

  // Every strategy exhausted — throw a combined error.
  throw new Error(
    errors.length === 1
      ? errors[0]
      : `All delivery methods failed.\n${errors.map((e) => `• ${e}`).join('\n')}`,
  );
};
