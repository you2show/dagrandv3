import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const allowedOrigins = (Deno.env.get('CORS_ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)
  .filter((origin) => {
    try {
      new URL(origin)
      return true
    } catch {
      console.warn(`Ignoring invalid CORS origin: ${origin}`)
      return false
    }
  })

if (allowedOrigins.length === 0) {
  console.warn('CORS_ALLOWED_ORIGINS is empty; contact-form will use wildcard CORS.')
}

const determineAllowedOrigin = (origin: string | null, origins: string[]) => {
  if (origin && (origins.length === 0 || origins.includes(origin))) {
    return origin
  }

  if (origins.length === 0) {
    return '*'
  }

  return null
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const allowOrigin = determineAllowedOrigin(origin, allowedOrigins)
  const corsHeaders: Record<string, string> = {
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  }
  if (allowOrigin) {
    corsHeaders['Access-Control-Allow-Origin'] = allowOrigin
  }

  if (req.method === 'OPTIONS') {
    if (!allowOrigin) {
      return new Response(null, { status: 403, headers: { 'Vary': 'Origin' } })
    }
    return new Response(null, { headers: corsHeaders, status: 204 })
  }

  if (!allowOrigin) {
    return new Response(
      JSON.stringify({ success: false, error: 'Origin not allowed' }),
      {
        headers: { 'Content-Type': 'application/json', 'Vary': 'Origin' },
        status: 403,
      }
    )
  }

  try {
    const formData = await req.json()

    const name = formData.name || formData.fullName || 'N/A'
    const email = formData.email || 'N/A'
    const phone = formData.phone || formData.phoneNumber || 'N/A'
    const subject = formData.subject || 'N/A'
    const message = formData.message || 'N/A'

    const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")
    const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID")

    if (!TELEGRAM_BOT_TOKEN) {
      return new Response(
        JSON.stringify({ success: false, error: "TELEGRAM_BOT_TOKEN is not configured" }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      )
    }

    if (!TELEGRAM_CHAT_ID) {
      return new Response(
        JSON.stringify({ success: false, error: "TELEGRAM_CHAT_ID is not configured" }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      )
    }

    const escapeHtml = (value: string) => {
      const htmlEntities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      };
      return value.replace(/[&<>"']/g, (char) => htmlEntities[char]);
    }

    const safeName = escapeHtml(String(name))
    const safeEmail = escapeHtml(String(email))
    const safePhone = escapeHtml(String(phone))
    const safeSubject = escapeHtml(String(subject))
    const safeMessage = escapeHtml(String(message))

    const text = `📩 <b>New Contact Message (dagrandv3)</b>\n\n👤 <b>Name:</b> ${safeName}\n📧 <b>Email:</b> ${safeEmail}\n📞 <b>Phone:</b> ${safePhone}\n📝 <b>Subject:</b> ${safeSubject}\n💬 <b>Message:</b>\n${safeMessage}`;

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
      const telegramError = await telegramResponse.text()
      console.error("Failed to send telegram message", telegramError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to send telegram message" }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 502,
        }
      )
    }

    return new Response(
      JSON.stringify({ success: true, message: "Message sent successfully" }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error?.message || "Invalid request" }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
