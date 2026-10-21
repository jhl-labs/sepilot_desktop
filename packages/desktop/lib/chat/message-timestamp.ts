export interface MessageTimestampPresentation {
  dateTime: string
  compact: string
  full: string
}

export function formatMessageTimestamp(
  value: number | string | null | undefined,
  locale?: string,
): MessageTimestampPresentation | null {
  if (value == null || value === '') return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null

  const resolvedLocale = locale?.trim() || undefined
  return {
    dateTime: date.toISOString(),
    compact: new Intl.DateTimeFormat(resolvedLocale, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date),
    full: new Intl.DateTimeFormat(resolvedLocale, {
      dateStyle: 'medium',
      timeStyle: 'medium',
    }).format(date),
  }
}
