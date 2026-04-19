import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const normalizeOrigin = (origin: string) => {
  const normalized = origin.trim()
  if (!normalized) return null
  try {
    return new URL(normalized).origin.toLowerCase()
  } catch {
    console.warn(`Ignoring invalid CORS origin: ${origin}`)
    return null
  }
}

const allowedOrigins = (Deno.env.get('CORS_ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((entry) => normalizeOrigin(entry))
  .filter((origin): origin is string => Boolean(origin))

if (allowedOrigins.length === 0) {
  console.warn('CORS_ALLOWED_ORIGINS is empty; contact-form will use wildcard CORS.')
}

const TELEGRAM_TIMEOUT_MS = 8000
const TELEGRAM_MAX_ATTEMPTS = 2
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
  const normalizedOrigin = origin ? normalizeOrigin(origin) : null
  const allowOriginHeader =
    normalizedOrigin ?? (allowedOrigins.length === 0 ? '*' : null)
  const isOriginAllowed =
    allowedOrigins.length === 0 ||
    (normalizedOrigin !== null && allowedOrigins.includes(normalizedOrigin))
  const corsHeaders: Record<string, string> = {
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  }
  if (allowOriginHeader) {
    corsHeaders['Access-Control-Allow-Origin'] = allowOriginHeader
  }

  if (req.method === 'OPTIONS') {
    if (!allowOriginHeader) {
      return new Response(null, { status: 403, headers: { 'Vary': 'Origin' } })
    }
    return new Response(null, { headers: corsHeaders, status: 204 })
  }

  if (!isOriginAllowed) {
    return new Response(
      JSON.stringify({ success: false, error: 'Origin not allowed' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
    const TELEGRAM_CHAT_IDS_RAW = Deno.env.get("TELEGRAM_CHAT_IDS") ?? Deno.env.get("TELEGRAM_CHAT_ID") ?? ""
    const TELEGRAM_CHAT_IDS = TELEGRAM_CHAT_IDS_RAW
      .split(",")
      .map((chatId) => chatId.trim())
      .filter((chatId) => chatId.length > 0)

    if (!TELEGRAM_BOT_TOKEN) {
      return new Response(
        JSON.stringify({ success: false, error: "TELEGRAM_BOT_TOKEN is not configured" }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      )
    }

    if (TELEGRAM_CHAT_IDS.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "TELEGRAM_CHAT_ID or TELEGRAM_CHAT_IDS is not configured" }),
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

    const successfulDeliveries: Array<{ chatId: string; telegramMessageId: number | null }> = []
    const failedDeliveries: Array<{ chatId: string; error: string; retryable: boolean }> = []
    for (const chatId of TELEGRAM_CHAT_IDS) {
      let lastError = "Failed to send telegram message"
      let lastRetryable = true
      let sent = false
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
              chat_id: chatId,
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
            lastRetryable = isRetryable
            console.error("Failed to send telegram message", {
              chatId,
              attempt,
              status: telegramResponse.status,
              description: parsedError.description,
              retryAfterMs: parsedError.retryAfterMs,
            })
            if (attempt < TELEGRAM_MAX_ATTEMPTS && isRetryable) {
              await delay(parsedError.retryAfterMs ?? getBackoffMs(attempt))
              continue
            }
            break
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
            lastRetryable = isRetryable
            console.error("Telegram API returned non-success payload", {
              chatId,
              attempt,
              errorCode,
              description,
              retryAfterMs,
            })
            if (attempt < TELEGRAM_MAX_ATTEMPTS && isRetryable) {
              await delay(retryAfterMs ?? getBackoffMs(attempt))
              continue
            }
            break
          }

          successfulDeliveries.push({
            chatId,
            telegramMessageId: telegramResult?.result?.message_id ?? null,
          })
          sent = true
          break
        } catch (telegramError: unknown) {
          const isAbortError =
            typeof telegramError === 'object' &&
            telegramError !== null &&
            (telegramError as { name?: string }).name === 'AbortError'
          const fallbackError = isAbortError
            ? "Telegram request timed out"
            : (telegramError instanceof Error ? telegramError.message : "Telegram network request failed")
          lastError = fallbackError
          // Do NOT retry after a timeout (AbortError). The request was
          // already in-flight for TELEGRAM_TIMEOUT_MS; Telegram may have
          // processed it and retrying would deliver a duplicate message.
          // Only retry on connection-level errors where the request never
          // reached the Telegram API.
          lastRetryable = !isAbortError
          console.error("Telegram network error", { chatId, attempt, error: fallbackError, isAbortError })
          if (attempt < TELEGRAM_MAX_ATTEMPTS && !isAbortError) {
            await delay(getBackoffMs(attempt))
            continue
          }
          break
        } finally {
          clearTimeout(timeoutId)
        }
      }

      if (!sent) {
        failedDeliveries.push({ chatId, error: lastError, retryable: lastRetryable })
      }
    }

    if (failedDeliveries.length > 0) {
      const hasRetryableFailure = failedDeliveries.some((failure) => failure.retryable)
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to deliver message to one or more Telegram chats",
          retryable: hasRetryableFailure,
          deliveredChatIds: successfulDeliveries.map((result) => result.chatId),
          failedDeliveries,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: hasRetryableFailure ? 503 : 502,
        }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Message sent successfully",
        telegramDeliveries: successfulDeliveries,
      }),
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
