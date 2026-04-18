import { supabase } from './supabaseClient';

export type TelegramContactPayload = {
  name?: string;
  email?: string;
  phone?: string;
  subject?: string;
  message: string;
};

export const sendTelegramMessage = async (data: TelegramContactPayload) => {
  if (!supabase) {
    throw new Error('Contact service is unavailable right now.');
  }

  const { data: result, error } = await supabase.functions.invoke('contact-form', {
    body: data
  });

  if (error) {
    throw new Error(error.message || 'Failed to send Telegram message');
  }

  if (!result?.success) {
    throw new Error(result?.error || 'Failed to send Telegram message');
  }

  return result;
};
