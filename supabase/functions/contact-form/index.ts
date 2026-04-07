import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const formData = await req.json()

    const name = formData.name || formData.fullName || 'N/A'
    const email = formData.email || 'N/A'
    const phone = formData.phone || formData.phoneNumber || 'N/A'
    const subject = formData.subject || 'N/A'
    const message = formData.message || 'N/A'

    const TELEGRAM_BOT_TOKEN = "8729871717:AAFWwQ77BuHZytSbJk23Brzd75dzZLg5-Lg";
    const TELEGRAM_CHAT_ID = "905513579";

    const text = `📩 <b>New Contact Message</b>\n\n👤 <b>Name:</b> ${name}\n📧 <b>Email:</b> ${email}\n📞 <b>Phone:</b> ${phone}\n📝 <b>Subject:</b> ${subject}\n💬 <b>Message:</b>\n${message}`;

    const telegramResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: text,
        parse_mode: 'HTML'
      }),
    });

    if (!telegramResponse.ok) {
      console.error("Failed to send telegram message", await telegramResponse.text());
    }

    return new Response(
      JSON.stringify({ success: true, message: "Message sent successfully" }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
