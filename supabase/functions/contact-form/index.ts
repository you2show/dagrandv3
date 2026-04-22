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
const TELEGRAM_MAX_ATTEMPTS = 3
const TELEGRAM_BASE_BACKOFF_MS = 500
const TELEGRAM_RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504])
// Contact form submissions must be delivered only to this Telegram user ID.
const CONTACT_FORM_TARGET_CHAT_ID = '905513579'

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
const getBackoffMs = (attemptNumber: number) => Math.min(attemptNumber * TELEGRAM_BASE_BACKOFF_MS, 4000)
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
      return { description, errorCode, retryAfterMs, raw }
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

// ---------------------------------------------------------------------------
// Send a single message to one Telegram chat with retry
// ---------------------------------------------------------------------------
type DeliverySuccess = { chatId: string; telegramMessageId: number | null }
type DeliveryFailure = { chatId: string; error: string; retryable: boolean }

async function sendToChat(
  token: string,
  chatId: string,
  text: string,
  correlationId: string,
): Promise<{ sent: boolean; result?: DeliverySuccess; failure?: DeliveryFailure }> {
  let lastError = 'Failed to send telegram message'
  let lastRetryable = true

  for (let attempt = 1; attempt <= TELEGRAM_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS)
    try {
      const telegramResponse = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          }),
          signal: controller.signal,
        },
      )

      if (!telegramResponse.ok) {
        const parsedError = await parseTelegramError(telegramResponse)
        lastError = parsedError.description
        const isRetryable = TELEGRAM_RETRYABLE_STATUS.has(telegramResponse.status)
        lastRetryable = isRetryable
        console.error('telegram_send_failed', {
          correlationId, chatId, attempt,
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
            : 'Telegram API returned an invalid success response'
        const errorCode = typeof telegramResult?.error_code === 'number' ? telegramResult.error_code : 502
        const retryAfterMs = toRetryAfterMs(telegramResult?.parameters?.retry_after)
        lastError = description
        const isRetryable = TELEGRAM_RETRYABLE_STATUS.has(errorCode)
        lastRetryable = isRetryable
        console.error('telegram_invalid_response', {
          correlationId, chatId, attempt, errorCode, description, retryAfterMs,
        })
        if (attempt < TELEGRAM_MAX_ATTEMPTS && isRetryable) {
          await delay(retryAfterMs ?? getBackoffMs(attempt))
          continue
        }
        break
      }

      const messageId = telegramResult?.result?.message_id ?? null
      console.log('telegram_send_ok', { correlationId, chatId, attempt, messageId })
      return { sent: true, result: { chatId, telegramMessageId: messageId } }
    } catch (telegramError: unknown) {
      const isAbortError =
        typeof telegramError === 'object' &&
        telegramError !== null &&
        (telegramError as { name?: string }).name === 'AbortError'
      const fallbackError = isAbortError
        ? 'Telegram request timed out'
        : (telegramError instanceof Error ? telegramError.message : 'Telegram network request failed')
      lastError = fallbackError
      // Do NOT retry after a timeout (AbortError). The request was already
      // in-flight for TELEGRAM_TIMEOUT_MS; Telegram may have processed it and
      // retrying would deliver a duplicate message. Only retry on
      // connection-level errors where the request never reached the Telegram API.
      lastRetryable = !isAbortError
      console.error('telegram_network_error', { correlationId, chatId, attempt, error: fallbackError, isAbortError })
      if (attempt < TELEGRAM_MAX_ATTEMPTS && !isAbortError) {
        await delay(getBackoffMs(attempt))
        continue
      }
      break
    } finally {
      clearTimeout(timeoutId)
    }
  }

  return { sent: false, failure: { chatId, error: lastError, retryable: lastRetryable } }
}

// ---------------------------------------------------------------------------
// Health-check handler (GET) — validates bot token and each configured chat
// ---------------------------------------------------------------------------
type HealthStep = { label: string; ok: boolean; detail: string }

async function handleHealthCheck(corsHeaders: Record<string, string>): Promise<Response> {
  const steps: HealthStep[] = []
  const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
  const tokenConfigured = Boolean(TELEGRAM_BOT_TOKEN)

  steps.push({
    label: 'Bot token configured (TELEGRAM_BOT_TOKEN)',
    ok: tokenConfigured,
    detail: tokenConfigured
      ? `Token present (${TELEGRAM_BOT_TOKEN!.slice(0, 8)}…)`
      : 'TELEGRAM_BOT_TOKEN is not set in Supabase Edge Function secrets',
  })

  if (!tokenConfigured) {
    return new Response(
      JSON.stringify({ ok: false, steps }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    )
  }

  // Validate token via getMe
  const ctrl1 = new AbortController()
  const tid1 = setTimeout(() => ctrl1.abort(), TELEGRAM_TIMEOUT_MS)
  let getMeOk = false
  let botUsername = ''
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`,
      { signal: ctrl1.signal },
    )
    clearTimeout(tid1)
    const json = await res.json()
    getMeOk = res.ok && json?.ok === true
    botUsername = typeof json?.result?.username === 'string' ? `@${json.result.username}` : ''
    steps.push({
      label: 'Bot token valid (getMe)',
      ok: getMeOk,
      detail: getMeOk
        ? `Bot found: ${botUsername}`
        : `Telegram error: ${json?.description ?? res.status}`,
    })
  } catch (err) {
    clearTimeout(tid1)
    const isTimeout = err instanceof Error && err.name === 'AbortError'
    steps.push({
      label: 'Bot token valid (getMe)',
      ok: false,
      detail: isTimeout ? 'Request timed out' : 'Network error reaching Telegram API',
    })
    return new Response(
      JSON.stringify({ ok: false, steps }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    )
  }

  if (!getMeOk) {
    return new Response(
      JSON.stringify({ ok: false, steps }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    )
  }

  // Check only the fixed, owner-approved recipient chat ID.
  const chatId = CONTACT_FORM_TARGET_CHAT_ID
  const label = `Chat ID reachable (${chatId})`
  const ctrl2 = new AbortController()
  const tid2 = setTimeout(() => ctrl2.abort(), TELEGRAM_TIMEOUT_MS)
  let allChatsOk = true
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getChat?chat_id=${encodeURIComponent(chatId)}`,
      { signal: ctrl2.signal },
    )
    clearTimeout(tid2)
    const json = await res.json()
    const chatOk = res.ok && json?.ok === true
    const title = json?.result?.title ?? json?.result?.username ?? '?'
    const type = json?.result?.type ?? '?'
    steps.push({
      label,
      ok: chatOk,
      detail: chatOk
        ? `${type}: ${title}`
        : `Telegram error: ${json?.description ?? res.status}. Ensure the bot is added to the chat.`,
    })
    if (!chatOk) allChatsOk = false
  } catch (err) {
    clearTimeout(tid2)
    const isTimeout = err instanceof Error && err.name === 'AbortError'
    steps.push({
      label,
      ok: false,
      detail: isTimeout ? 'Request timed out' : 'Network error reaching Telegram API',
    })
    allChatsOk = false
  }

  const ok = getMeOk && allChatsOk
  return new Response(
    JSON.stringify({ ok, steps }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
  )
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  const origin = req.headers.get('origin')
  const normalizedOrigin = origin ? normalizeOrigin(origin) : null
  const allowOriginHeader =
    normalizedOrigin ?? (allowedOrigins.length === 0 ? '*' : null)
  // Requests without an Origin header are non-browser calls (e.g. Supabase
  // Dashboard test tool, curl, server-to-server). CORS is a browser security
  // mechanism and does not apply to these — always allow them through.
  const isOriginAllowed =
    normalizedOrigin === null ||
    allowedOrigins.length === 0 ||
    allowedOrigins.includes(normalizedOrigin)
  const corsHeaders: Record<string, string> = {
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id, x-idempotency-key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
      },
    )
  }

  // Health check (GET)
  if (req.method === 'GET') {
    return handleHealthCheck(corsHeaders)
  }

  // Message submission (POST)
  const correlationId = req.headers.get('x-request-id') ?? crypto.randomUUID()
  const responseHeaders = { ...corsHeaders, 'Content-Type': 'application/json', 'X-Correlation-ID': correlationId }

  try {
    const formData = await req.json()
    if (!formData || typeof formData !== 'object') {
      return new Response(
        JSON.stringify({ success: false, error: 'invalid request payload', correlationId }),
        { headers: responseHeaders, status: 400 },
      )
    }

    const data = formData as Record<string, unknown>
    const idempotencyKey = typeof data.idempotencyKey === 'string' ? data.idempotencyKey.trim() : null
    const name = normalizeField(data.name ?? data.fullName, 'N/A', 120)
    const email = normalizeField(data.email, 'N/A', 180)
    const phone = normalizeField(data.phone ?? data.phoneNumber, 'N/A', 80)
    const subject = normalizeField(data.subject, 'N/A', 200)
    const message = normalizeField(data.message, '', 3200)

    console.log('contact_form_submission', {
      correlationId,
      idempotencyKey,
      hasName: name !== 'N/A',
      hasEmail: email !== 'N/A',
      hasPhone: phone !== 'N/A',
      hasSubject: subject !== 'N/A',
      messageLength: message.length,
    })

    if (!message) {
      return new Response(
        JSON.stringify({ success: false, error: 'message is required', correlationId }),
        { headers: responseHeaders, status: 400 },
      )
    }

    const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
    const TELEGRAM_CHAT_IDS = [CONTACT_FORM_TARGET_CHAT_ID]

    if (!TELEGRAM_BOT_TOKEN) {
      console.error('telegram_not_configured', { correlationId })
      return new Response(
        JSON.stringify({ success: false, error: 'TELEGRAM_BOT_TOKEN is not configured', correlationId }),
        { headers: responseHeaders, status: 500 },
      )
    }

    const text =
      `📩 <b>New Contact Message (dagrandv3)</b>\n\n` +
      `👤 <b>Name:</b> ${escapeHtml(name)}\n` +
      `📧 <b>Email:</b> ${escapeHtml(email)}\n` +
      `📞 <b>Phone:</b> ${escapeHtml(phone)}\n` +
      `📝 <b>Subject:</b> ${escapeHtml(subject)}\n` +
      `💬 <b>Message:</b>\n${escapeHtml(message)}`

    const successfulDeliveries: DeliverySuccess[] = []
    const failedDeliveries: DeliveryFailure[] = []

    for (const chatId of TELEGRAM_CHAT_IDS) {
      const { sent, result, failure } = await sendToChat(TELEGRAM_BOT_TOKEN, chatId, text, correlationId)
      if (sent && result) {
        successfulDeliveries.push(result)
      } else if (failure) {
        failedDeliveries.push(failure)
      }
    }

    if (successfulDeliveries.length === 0) {
      const hasRetryableFailure = failedDeliveries.some((f) => f.retryable)
      console.error('telegram_all_failed', { correlationId, failedDeliveries })
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to deliver message to any Telegram chat',
          retryable: hasRetryableFailure,
          deliveredChatIds: [],
          failedDeliveries,
          correlationId,
        }),
        { headers: responseHeaders, status: hasRetryableFailure ? 503 : 502 },
      )
    }

    // At least one delivery succeeded — treat as success.
    // Log any partial failures for monitoring but do not block the user.
    if (failedDeliveries.length > 0) {
      console.warn('telegram_partial_success', { correlationId, successfulDeliveries, failedDeliveries })
    } else {
      console.log('telegram_all_ok', { correlationId, successfulDeliveries })
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Message sent successfully',
        telegramDeliveries: successfulDeliveries,
        correlationId,
      }),
      { headers: responseHeaders, status: 200 },
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Invalid request'
    console.error('contact_form_error', { correlationId, error: message })
    return new Response(
      JSON.stringify({ success: false, error: message, correlationId }),
      { headers: responseHeaders, status: 400 },
    )
  }
})
