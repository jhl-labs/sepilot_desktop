export function isLoopbackServiceOrigin(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return hostname === '127.0.0.1'
      || hostname === 'localhost'
      || hostname === '[::1]'
      || hostname === '::1'
  } catch {
    return false
  }
}

export function isLocalHttpServiceOrigin(value: string): boolean {
  try {
    return new URL(value).protocol === 'http:' && isLoopbackServiceOrigin(value)
  } catch {
    return false
  }
}

export function normalizeServiceOrigin(value: string): string | null {
  try {
    return new URL(value.trim()).toString().replace(/\/+$/u, '')
  } catch {
    return null
  }
}

export function serviceOriginsEqual(left: string, right: string): boolean {
  const normalizedLeft = normalizeServiceOrigin(left)
  const normalizedRight = normalizeServiceOrigin(right)
  return normalizedLeft !== null
    && normalizedRight !== null
    && normalizedLeft === normalizedRight
}
