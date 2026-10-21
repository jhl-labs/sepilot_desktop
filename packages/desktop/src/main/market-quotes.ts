import { request as httpsRequest } from 'node:https'
import type {
  DesktopMarketQuoteAsset,
  DesktopMarketQuoteBatchResult,
  DesktopMarketQuotePoint,
  DesktopMarketQuoteResult,
  DesktopMarketQuotesInput,
} from '@sepilotd/api-client'

const YAHOO_CHART_ORIGIN = 'https://query1.finance.yahoo.com'
const MARKET_QUOTE_TIMEOUT_MS = 10_000
const MARKET_QUOTE_MAX_BYTES = 2 * 1024 * 1024
const MARKET_QUOTE_MAX_ASSETS = 50
const MARKET_QUOTE_CONCURRENCY = 6
const MARKET_QUOTE_RANGES = new Set(['5d', '1mo', '3mo', '6mo', '1y', '2y', '5y'])
const MARKET_QUOTE_INTERVALS = new Set(['1d', '1wk', '1mo'])

interface NormalizedMarketQuoteAsset extends DesktopMarketQuoteAsset {
  requestSymbol: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function cleanMarket(value: unknown): string {
  return cleanText(value, 32).toUpperCase()
}

function cleanCurrency(value: unknown): string {
  return cleanText(value, 12).toUpperCase()
}

function normalizeRange(value: unknown): string {
  const range = cleanText(value, 12)
  return MARKET_QUOTE_RANGES.has(range) ? range : '3mo'
}

function normalizeInterval(value: unknown): string {
  const interval = cleanText(value, 12)
  return MARKET_QUOTE_INTERVALS.has(interval) ? interval : '1d'
}

function normalizeYahooSymbol(rawSymbol: string, market: string, type: string, currency: string): string {
  const symbol = rawSymbol.trim().toUpperCase()
  if (!symbol) return ''

  if (symbol.includes(':')) {
    const [prefix, rest] = symbol.split(':', 2)
    if (prefix === 'KRX' && rest && /^\d{1,6}$/u.test(rest)) return `${rest.padStart(6, '0')}.KS`
    if (prefix === 'KOSDAQ' && rest && /^\d{1,6}$/u.test(rest)) return `${rest.padStart(6, '0')}.KQ`
    if (prefix === 'CRYPTO' && rest) return rest.includes('-') ? rest : `${rest}-${currency || 'USD'}`
    return rest || symbol
  }

  if (market === 'KRX' || market === 'KOSPI' || market === 'KOSDAQ') {
    if (/^\d{1,6}$/u.test(symbol)) {
      return `${symbol.padStart(6, '0')}.${market === 'KOSDAQ' ? 'KQ' : 'KS'}`
    }
  }

  if (
    market === 'CRYPTO' ||
    type.includes('암호') ||
    type.toLowerCase().includes('crypto')
  ) {
    if (symbol.includes('-')) return symbol
    return `${symbol}-${currency || 'USD'}`
  }

  if (/^\d{1,6}$/u.test(symbol)) return `${symbol.padStart(6, '0')}.KS`
  return symbol
}

function normalizeAssets(value: unknown): NormalizedMarketQuoteAsset[] {
  const record = isRecord(value) ? value : {}
  const assets = Array.isArray(record.assets) ? record.assets : []
  return assets
    .slice(0, MARKET_QUOTE_MAX_ASSETS)
    .map((raw, index): NormalizedMarketQuoteAsset | null => {
      const asset = isRecord(raw) ? raw : {}
      const id = cleanText(asset.id, 160) || `asset-${index + 1}`
      const symbol = cleanText(asset.symbol, 80)
      const market = cleanMarket(asset.market)
      const type = cleanText(asset.type, 80)
      const currency = cleanCurrency(asset.currency)
      const requestSymbol = normalizeYahooSymbol(symbol, market, type, currency)
      if (!requestSymbol) return null
      return {
        id,
        name: cleanText(asset.name, 240) || undefined,
        symbol,
        market,
        type,
        currency,
        requestSymbol,
      }
    })
    .filter((asset): asset is NormalizedMarketQuoteAsset => Boolean(asset))
}

function requestJson(url: URL): Promise<unknown> {
  return new Promise((resolveRequest, rejectRequest) => {
    const request = httpsRequest(
      url,
      {
        method: 'GET',
        timeout: MARKET_QUOTE_TIMEOUT_MS,
        headers: {
          accept: 'application/json',
          'user-agent': 'sepilotd-desktop-market-quotes/1.0',
        },
      },
      (response) => {
        const chunks: Buffer[] = []
        let totalBytes = 0
        response.on('data', (chunk: Buffer) => {
          totalBytes += chunk.byteLength
          if (totalBytes > MARKET_QUOTE_MAX_BYTES) {
            request.destroy(new Error('market quote response is too large'))
            return
          }
          chunks.push(chunk)
        })
        response.once('end', () => {
          const statusCode = response.statusCode ?? 0
          const body = Buffer.concat(chunks).toString('utf-8')
          if (statusCode < 200 || statusCode >= 300) {
            rejectRequest(new Error(`Yahoo Finance returned HTTP ${statusCode}`))
            return
          }
          try {
            resolveRequest(JSON.parse(body))
          } catch (error) {
            rejectRequest(error)
          }
        })
      },
    )
    request.once('timeout', () => {
      request.destroy(new Error(`market quote timeout ${MARKET_QUOTE_TIMEOUT_MS}ms`))
    })
    request.once('error', rejectRequest)
    request.end()
  })
}

function numberOrUndefined(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function arrayAtPath(record: Record<string, unknown>, path: string[]): unknown[] {
  let cursor: unknown = record
  for (const part of path) {
    if (!isRecord(cursor)) return []
    cursor = cursor[part]
  }
  return Array.isArray(cursor) ? cursor : []
}

function recordAtPath(record: Record<string, unknown>, path: string[]): Record<string, unknown> {
  let cursor: unknown = record
  for (const part of path) {
    if (!isRecord(cursor)) return {}
    cursor = cursor[part]
  }
  return isRecord(cursor) ? cursor : {}
}

function parseYahooChart(
  asset: NormalizedMarketQuoteAsset,
  sourceUrl: string,
  payload: unknown,
): DesktopMarketQuoteResult {
  const root = isRecord(payload) ? payload : {}
  const chart = recordAtPath(root, ['chart'])
  const error = chart.error
  if (isRecord(error)) {
    throw new Error(cleanText(error.description, 300) || cleanText(error.code, 120) || 'quote error')
  }
  const result = arrayAtPath(chart, ['result'])[0]
  if (!isRecord(result)) throw new Error('Yahoo Finance chart result is empty')

  const meta = recordAtPath(result, ['meta'])
  const timestamps = Array.isArray(result.timestamp) ? result.timestamp : []
  const quote = arrayAtPath(result, ['indicators', 'quote'])[0]
  const closeValues = isRecord(quote) && Array.isArray(quote.close) ? quote.close : []
  const points: DesktopMarketQuotePoint[] = []

  timestamps.forEach((rawTs, index) => {
    const seconds = Number(rawTs)
    const close = numberOrUndefined(closeValues[index])
    if (!Number.isFinite(seconds) || close == null) return
    const ts = seconds * 1000
    points.push({
      ts,
      date: new Date(ts).toISOString().slice(0, 10),
      close,
    })
  })

  if (points.length === 0) throw new Error('Yahoo Finance chart has no close prices')

  const lastPoint = points[points.length - 1]!
  const metaPrice =
    numberOrUndefined(meta.regularMarketPrice) ??
    numberOrUndefined(meta.previousClose) ??
    lastPoint.close

  return {
    id: asset.id,
    name: asset.name,
    symbol: asset.symbol,
    requestSymbol: asset.requestSymbol,
    ok: true,
    price: metaPrice,
    currency: cleanCurrency(meta.currency) || asset.currency || undefined,
    asOf: lastPoint.ts,
    points,
    source: 'yahoo-finance-chart',
    sourceUrl,
  }
}

async function fetchOneMarketQuote(
  asset: NormalizedMarketQuoteAsset,
  range: string,
  interval: string,
): Promise<DesktopMarketQuoteResult> {
  const url = new URL(
    `/v8/finance/chart/${encodeURIComponent(asset.requestSymbol)}`,
    YAHOO_CHART_ORIGIN,
  )
  url.searchParams.set('range', range)
  url.searchParams.set('interval', interval)
  url.searchParams.set('includePrePost', 'false')
  url.searchParams.set('events', 'div,splits')
  const sourceUrl = url.toString()

  try {
    const payload = await requestJson(url)
    return parseYahooChart(asset, sourceUrl, payload)
  } catch (error) {
    return {
      id: asset.id,
      name: asset.name,
      symbol: asset.symbol,
      requestSymbol: asset.requestSymbol,
      ok: false,
      points: [],
      source: 'yahoo-finance-chart',
      sourceUrl,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function fetchDesktopMarketQuotes(
  input: unknown,
): Promise<DesktopMarketQuoteBatchResult> {
  const record = isRecord(input) ? (input as Partial<DesktopMarketQuotesInput>) : {}
  const assets = normalizeAssets(record)
  const range = normalizeRange(record.range)
  const interval = normalizeInterval(record.interval)
  const results: DesktopMarketQuoteResult[] = new Array(assets.length)
  let nextIndex = 0
  const workerCount = Math.min(MARKET_QUOTE_CONCURRENCY, assets.length)

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < assets.length) {
        const index = nextIndex
        nextIndex += 1
        results[index] = await fetchOneMarketQuote(assets[index]!, range, interval)
      }
    }),
  )

  return {
    checkedAt: Date.now(),
    provider: 'Yahoo Finance Chart API',
    range,
    interval,
    results,
  }
}
