const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

export interface GoogleTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
  error?: string
  error_description?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function tokenErrorMessage(payload: GoogleTokenResponse): string {
  return payload.error_description || payload.error || 'Google OAuth token request failed.'
}

export async function postGoogleToken(body: Record<string, string>): Promise<GoogleTokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(body),
  })
  const payload = (await response.json().catch(() => ({}))) as GoogleTokenResponse
  if (!response.ok) throw new Error(tokenErrorMessage(payload))
  return payload
}

export async function googleCalendarRequest<T>(
  accessToken: string,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${GOOGLE_CALENDAR_API}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(options.body == null ? {} : { 'Content-Type': 'application/json' }),
    },
    body: options.body == null ? undefined : JSON.stringify(options.body),
  })
  if (response.status === 204) return null as T
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    const message =
      isRecord(payload.error) && typeof payload.error.message === 'string'
        ? payload.error.message
        : `HTTP ${response.status}`
    throw new Error(`Google Calendar API failed: ${message}`)
  }
  return payload as T
}
