import { supabase } from './supabaseClient';

export type TelegramContactPayload = {
  name?: string;
  email?: string;
  phone?: string;
  subject?: string;
  message: string;
};

const normalize = (value?: string) => value?.trim() || '';

export const sendTelegramMessage = async (data: TelegramContactPayload) => {
  if (!supabase) {
    throw new Error('Contact service is unavailable right now.');
  }

  const payload = {
    name: normalize(data.name),
    email: normalize(data.email),
    phone: normalize(data.phone),
    subject: normalize(data.subject),
    message: normalize(data.message),
  };

  if (!payload.message) {
    throw new Error('Message is required.');
  }

  const maxAttempts = 2;
  let lastError = 'Failed to send Telegram message';

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { data: result, error } = await supabase.functions.invoke('contact-form', {
      body: payload
    });

    if (!error && result?.success) {
      return result;
    }

    let message = lastError;

    if (error) {
      message = error.message || message;
      const context = (error as { context?: Response }).context;
      if (context) {
        try {
          const contextPayload = await context.clone().json();
          if (typeof contextPayload?.error === 'string' && contextPayload.error.trim()) {
            message = contextPayload.error.trim();
          }
        } catch {
          // Keep fallback error message.
        }
      }
    } else if (result && !result.success) {
      message = result.error || message;
    }

    const isEdgeRequestError =
      (error as { name?: string } | null)?.name === 'FunctionsFetchError' ||
      /Failed to send a request to the Edge Function/i.test(message);

    if (isEdgeRequestError) {
      throw new Error(
        'Unable to confirm message delivery because of a network response issue. Please retry once if needed.'
      );
    }

    lastError = message;
    const shouldRetry = /timeout|502|503|504|temporary|temporarily/i.test(message);
    if (attempt < maxAttempts && shouldRetry) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }
    break;
  }

  throw new Error(lastError);
};
