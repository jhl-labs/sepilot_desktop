export type TrustedSearchDomainParseResult =
  | { ok: true; domain: string }
  | { ok: false; message: string }

const DOMAIN_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u

function invalid(message: string): TrustedSearchDomainParseResult {
  return { ok: false, message }
}

export function parseTrustedSearchDomain(input: string): TrustedSearchDomainParseResult {
  const candidate = input.trim()
  if (!candidate) return invalid('도메인을 입력하세요.')
  if (candidate.includes('*')) return invalid('와일드카드는 필요하지 않습니다. 루트 도메인을 입력하세요.')

  let url: URL
  try {
    url = new URL(candidate.includes('://') ? candidate : `https://${candidate}`)
  } catch {
    return invalid('유효한 도메인 또는 HTTP(S) URL을 입력하세요.')
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return invalid('HTTP(S) 주소만 사용할 수 있습니다.')
  }
  if (url.username || url.password) {
    return invalid('인증 정보가 포함된 URL은 사용할 수 없습니다.')
  }
  if (url.port) {
    return invalid('검색 도메인에는 포트를 지정할 수 없습니다.')
  }

  const domain = url.hostname.toLowerCase().replace(/\.$/u, '')
  if (!domain || domain === 'localhost' || domain.includes(':')) {
    return invalid('공개 DNS 도메인을 입력하세요.')
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(domain)) {
    return invalid('IP 주소 대신 공개 DNS 도메인을 입력하세요.')
  }
  if (domain.length > 253) return invalid('도메인이 너무 깁니다.')

  const labels = domain.split('.')
  if (labels.length < 2 || labels.some((label) => !DOMAIN_LABEL_RE.test(label))) {
    return invalid('유효한 공개 DNS 도메인을 입력하세요.')
  }

  return { ok: true, domain }
}
