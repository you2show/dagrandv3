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

// No automatic client-side retries. The edge function already retries
// internally for transient Telegram API errors. Retrying from the client
// risks duplicate messages: if the edge function sent successfully but the
// HTTP response was lost in transit, a client retry would send a second
// identical message to Telegram.
export const sendTelegramMessage = async (data: TelegramContactPayload): Promise<TelegramSendResult> => {
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

  const { data: result, error } = await supabase.functions.invoke('contact-form', {
    body: payload,
  });

  if (error) {
    let message = error.message || 'Failed to send message.';
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
    throw new Error(message);
  }

  if (!result?.success) {
    throw new Error(result?.error || 'Failed to send message. Please try again.');
  }

  return result as TelegramSendResult;
};
