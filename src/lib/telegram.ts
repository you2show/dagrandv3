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
  correlationId?: string;
};

const normalize = (value?: string) => value?.trim() || '';

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

// ---------------------------------------------------------------------------
// Supabase Edge Function path (single production path)
// All contact form submissions are routed through the Edge Function so that
// the Telegram bot token is never exposed in the client bundle and retry /
// logging / fallback logic lives in one place.
// ---------------------------------------------------------------------------
const sendViaEdgeFunction = async (payload: ReturnType<typeof buildPayload>): Promise<TelegramSendResult> => {
  if (!supabase) {
    throw new Error('Contact service is unavailable. Please check Supabase configuration.');
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
    throw new Error(result?.error || 'Failed to send message. Please try again.');
  }

  return result as TelegramSendResult;
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
// Public API
// ---------------------------------------------------------------------------
export const sendTelegramMessage = async (data: TelegramContactPayload): Promise<TelegramSendResult> => {
  const payload = buildPayload(data);

  if (!payload.message) {
    throw new Error('Message is required.');
  }

  return sendViaEdgeFunction(payload);
};
