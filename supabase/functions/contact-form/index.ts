import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const allowedOrigins = (Deno.env.get('CORS_ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((origin) => origin.toLowerCase())
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
  const normalizedOrigin = origin?.toLowerCase() ?? null

  if (origins.length === 0) {
    return normalizedOrigin ?? '*'
  }

  if (normalizedOrigin && origins.includes(normalizedOrigin)) {
    return normalizedOrigin
  }

  return null
}

const TELEGRAM_TIMEOUT_MS = 8000
const TELEGRAM_MAX_ATTEMPTS = 3
const TELEGRAM_BASE_BACKOFF_MS = 500
const TELEGRAM_RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504])

const normalizeField = (value: unknown, fallback = 'N/A', maxLength = 1000) => {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) return fallback
  return normalized.slice(0, maxLength)
}

const escapeHtml = (value: string) => {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return value.replace(/[&<>"']/g, (char) => htmlEntities[char])
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const getBackoffMs = (attemptNumber: number) => attemptNumber * TELEGRAM_BASE_BACKOFF_MS
const toRetryAfterMs = (seconds: unknown) =>
  typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
    ? seconds * 1000
    : null

const parseTelegramError = async (response: Response) => {
  const raw = await response.text()
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      const description =
        typeof parsed.description === 'string' && parsed.description.trim()
          ? parsed.description.trim()
          : 'Unknown Telegram API error'
      const errorCode = typeof parsed.error_code === 'number' ? parsed.error_code : response.status
      const retryAfterMs = toRetryAfterMs(parsed?.parameters?.retry_after)
      return {
        description,
        errorCode,
        retryAfterMs,
        raw,
      }
    }
  } catch {
    // Fall through to non-JSON fallback.
  }

  return {
    description: raw || `Telegram API request failed with status ${response.status}`,
    errorCode: response.status,
    retryAfterMs: null,
    raw,
  }
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
    if (!formData || typeof formData !== 'object') {
        return new Response(
          JSON.stringify({ success: false, error: "invalid request payload" }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        }
      )
    }

    const data = formData as Record<string, unknown>
    const name = normalizeField(data.name ?? data.fullName, 'N/A', 120)
    const email = normalizeField(data.email, 'N/A', 180)
    const phone = normalizeField(data.phone ?? data.phoneNumber, 'N/A', 80)
    const subject = normalizeField(data.subject, 'N/A', 200)
    const message = normalizeField(data.message, '', 3200)

    if (!message) {
        return new Response(
          JSON.stringify({ success: false, error: "message is required" }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        }
      )
    }

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

    const safeName = escapeHtml(name)
    const safeEmail = escapeHtml(email)
    const safePhone = escapeHtml(phone)
    const safeSubject = escapeHtml(subject)
    const safeMessage = escapeHtml(message)

    const text = `📩 <b>New Contact Message (dagrandv3)</b>\n\n👤 <b>Name:</b> ${safeName}\n📧 <b>Email:</b> ${safeEmail}\n📞 <b>Phone:</b> ${safePhone}\n📝 <b>Subject:</b> ${safeSubject}\n💬 <b>Message:</b>\n${safeMessage}`

    let lastError = "Failed to send telegram message"
    for (let attempt = 1; attempt <= TELEGRAM_MAX_ATTEMPTS; attempt += 1) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS)
      try {
        const telegramResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          }),
          signal: controller.signal,
        })

        if (!telegramResponse.ok) {
          const parsedError = await parseTelegramError(telegramResponse)
          lastError = parsedError.description
          const isRetryable = TELEGRAM_RETRYABLE_STATUS.has(telegramResponse.status)
          console.error("Failed to send telegram message", {
            attempt,
            status: telegramResponse.status,
            description: parsedError.description,
            retryAfterMs: parsedError.retryAfterMs,
          })
          if (attempt < TELEGRAM_MAX_ATTEMPTS && isRetryable) {
            await delay(parsedError.retryAfterMs ?? getBackoffMs(attempt))
            continue
          }
          return new Response(
            JSON.stringify({ success: false, error: lastError, retryable: isRetryable }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: isRetryable ? 503 : 502,
            }
          )
        }

        const telegramResult = await telegramResponse.json().catch(() => null)
        if (!telegramResult || telegramResult.ok !== true) {
          const description =
            typeof telegramResult?.description === 'string' && telegramResult.description.trim()
              ? telegramResult.description.trim()
              : "Telegram API returned an invalid success response"
          const errorCode = typeof telegramResult?.error_code === 'number' ? telegramResult.error_code : 502
          const retryAfterMs = toRetryAfterMs(telegramResult?.parameters?.retry_after)
          lastError = description
          const isRetryable = TELEGRAM_RETRYABLE_STATUS.has(errorCode)
          console.error("Telegram API returned non-success payload", {
            attempt,
            errorCode,
            description,
            retryAfterMs,
          })
          if (attempt < TELEGRAM_MAX_ATTEMPTS && isRetryable) {
            await delay(retryAfterMs ?? getBackoffMs(attempt))
            continue
          }
          return new Response(
            JSON.stringify({ success: false, error: description, retryable: isRetryable }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: isRetryable ? 503 : 502,
            }
          )
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: "Message sent successfully",
            telegramMessageId: telegramResult?.result?.message_id ?? null,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        )
      } catch (telegramError: unknown) {
        const isAbortError =
          typeof telegramError === 'object' &&
          telegramError !== null &&
          (telegramError as { name?: string }).name === 'AbortError'
        const fallbackError = isAbortError
          ? "Telegram request timed out"
          : (telegramError instanceof Error ? telegramError.message : "Telegram network request failed")
        lastError = fallbackError
        console.error("Telegram network error", { attempt, error: fallbackError })
        if (attempt < TELEGRAM_MAX_ATTEMPTS) {
          await delay(getBackoffMs(attempt))
          continue
        }
        return new Response(
          JSON.stringify({ success: false, error: fallbackError, retryable: true }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 503,
          }
        )
      } finally {
        clearTimeout(timeoutId)
      }
    }

    // Safety fallback: should be unreachable because the loop returns on final failure.
    return new Response(
      JSON.stringify({ success: false, error: lastError }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 503,
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
