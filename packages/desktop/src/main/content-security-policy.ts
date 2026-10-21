interface DesktopContentSecurityPolicyInput {
  daemonOrigin: string
  gatewayOrigin: string
  allowUnsafeInline?: boolean
  allowUnsafeEval?: boolean
}

export function toWebSocketOrigin(origin: string): string {
  const url = new URL(origin)

  if (url.protocol === 'http:') {
    url.protocol = 'ws:'
  } else if (url.protocol === 'https:') {
    url.protocol = 'wss:'
  }

  return url.origin
}

export function buildDesktopContentSecurityPolicy(
  input: DesktopContentSecurityPolicyInput,
): string {
  const connectSources = Array.from(new Set([
    "'self'",
    input.daemonOrigin,
    input.gatewayOrigin,
    toWebSocketOrigin(input.daemonOrigin),
    toWebSocketOrigin(input.gatewayOrigin),
  ]))

  return [
    "default-src 'self'",
    "object-src 'none'",
    "frame-src 'self' https: http: blob:",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'",
    `script-src 'self'${input.allowUnsafeInline ? " 'unsafe-inline'" : ''}${input.allowUnsafeEval ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `connect-src ${connectSources.join(' ')}`,
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
  ].join('; ')
}
