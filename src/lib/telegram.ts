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

    let responseStatus: number | null = null;
    let responseRetryable = false;

    if (error) {
      message = error.message || message;
      const context = (error as { context?: Response }).context;
      if (context) {
        responseStatus = context.status;
        try {
          const contextPayload = await context.clone().json();
          if (typeof contextPayload?.error === 'string' && contextPayload.error.trim()) {
            message = contextPayload.error.trim();
          }
          if (contextPayload?.retryable === true) {
            responseRetryable = true;
          }
        } catch {
          // Keep fallback error message.
        }
      }
    } else if (result && !result.success) {
      message = result.error || message;
      responseRetryable = result.retryable === true;
    }

    const isEdgeRequestError =
      (error as { name?: string } | null)?.name === 'FunctionsFetchError';
    const isRetryableStatus = responseStatus !== null && responseStatus >= 500;
    const isRetryableMessage =
      /network|fetch|timeout|502|503|504|temporary|temporarily|unavailable|try again|rate limit/i.test(message);

    lastError = isEdgeRequestError
      ? 'Delivery status is unknown because of a network response issue. Please retry once only if you did not receive confirmation.'
      : message;
    const shouldRetry =
      isEdgeRequestError || responseRetryable || isRetryableStatus || isRetryableMessage;
    if (attempt < maxAttempts && shouldRetry) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }
    break;
  }

  throw new Error(lastError);
};
