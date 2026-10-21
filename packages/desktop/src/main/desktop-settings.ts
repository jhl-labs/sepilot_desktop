import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { safeStorage } from 'electron'

export interface DesktopSettings {
  daemonUrl: string | null
  daemonToken: string | null
  gatewayUrl: string | null
  gatewayToken: string | null
  googleOAuthClientId: string | null
  googleOAuthClientSecret: string | null
  smartThingsAccessToken: string | null
  smartThingsLocationId: string | null
  googleHomeOAuthClientId: string | null
  googleHomeOAuthClientSecret: string | null
  googleHomeProjectId: string | null
}

const EMPTY_SETTINGS: DesktopSettings = {
  daemonUrl: null,
  daemonToken: null,
  gatewayUrl: null,
  gatewayToken: null,
  googleOAuthClientId: null,
  googleOAuthClientSecret: null,
  smartThingsAccessToken: null,
  smartThingsLocationId: null,
  googleHomeOAuthClientId: null,
  googleHomeOAuthClientSecret: null,
  googleHomeProjectId: null,
}

const ENCRYPTED_PREFIX = 'enc1:'

function settingsPath(): string {
  const dataDir = process.env.SEPILOTD_DATA_DIR?.trim() || join(homedir(), '.sepilotd')
  return join(dataDir, 'desktop-settings.json')
}

function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function encryptToken(value: string): string {
  if (!encryptionAvailable()) return value
  return `${ENCRYPTED_PREFIX}${safeStorage.encryptString(value).toString('base64')}`
}

function decryptToken(value: string): string | null {
  if (!value.startsWith(ENCRYPTED_PREFIX)) {
    return value
  }
  if (!encryptionAvailable()) {
    return null
  }
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(ENCRYPTED_PREFIX.length), 'base64'))
  } catch {
    return null
  }
}

function readTokenField(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return decryptToken(trimmed)
}

export function loadDesktopSettings(): DesktopSettings {
  const path = settingsPath()
  if (!existsSync(path)) return { ...EMPTY_SETTINGS }
  try {
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<DesktopSettings>
    return {
      daemonUrl: typeof parsed.daemonUrl === 'string' && parsed.daemonUrl.trim() ? parsed.daemonUrl.trim() : null,
      daemonToken: readTokenField(parsed.daemonToken),
      gatewayUrl: typeof parsed.gatewayUrl === 'string' && parsed.gatewayUrl.trim() ? parsed.gatewayUrl.trim() : null,
      gatewayToken: readTokenField(parsed.gatewayToken),
      googleOAuthClientId:
        typeof parsed.googleOAuthClientId === 'string' && parsed.googleOAuthClientId.trim()
          ? parsed.googleOAuthClientId.trim()
          : null,
      googleOAuthClientSecret: readTokenField(parsed.googleOAuthClientSecret),
      smartThingsAccessToken: readTokenField(parsed.smartThingsAccessToken),
      smartThingsLocationId:
        typeof parsed.smartThingsLocationId === 'string' && parsed.smartThingsLocationId.trim()
          ? parsed.smartThingsLocationId.trim()
          : null,
      googleHomeOAuthClientId:
        typeof parsed.googleHomeOAuthClientId === 'string' && parsed.googleHomeOAuthClientId.trim()
          ? parsed.googleHomeOAuthClientId.trim()
          : null,
      googleHomeOAuthClientSecret: readTokenField(parsed.googleHomeOAuthClientSecret),
      googleHomeProjectId:
        typeof parsed.googleHomeProjectId === 'string' && parsed.googleHomeProjectId.trim()
          ? parsed.googleHomeProjectId.trim()
          : null,
    }
  } catch (err) {
    console.warn('[desktop-settings] failed to read settings file:', err)
    return { ...EMPTY_SETTINGS }
  }
}

export class DesktopSettingsValidationError extends Error {
  constructor(public readonly field: keyof DesktopSettings, message: string) {
    super(message)
    this.name = 'DesktopSettingsValidationError'
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function saveDesktopSettings(next: Partial<DesktopSettings>): DesktopSettings {
  const cleaned = sanitize(next)
  for (const key of ['daemonUrl', 'gatewayUrl'] as const) {
    const candidate = cleaned[key]
    if (typeof candidate === 'string' && !isHttpUrl(candidate)) {
      throw new DesktopSettingsValidationError(key, `${key} must be an http(s) URL`)
    }
  }

  const persisted: Partial<DesktopSettings> = { ...cleaned }
  for (const key of [
    'daemonToken',
    'gatewayToken',
    'googleOAuthClientSecret',
    'smartThingsAccessToken',
    'googleHomeOAuthClientSecret',
  ] as const) {
    if (key in persisted) {
      const v = persisted[key]
      persisted[key] = typeof v === 'string' ? encryptToken(v) : v
    }
  }

  const previous = loadDesktopSettings()
  const merged: DesktopSettings = { ...previous, ...cleaned }
  const storedShape = {
    daemonUrl: merged.daemonUrl,
    daemonToken: typeof merged.daemonToken === 'string' ? encryptToken(merged.daemonToken) : merged.daemonToken,
    gatewayUrl: merged.gatewayUrl,
    gatewayToken: typeof merged.gatewayToken === 'string' ? encryptToken(merged.gatewayToken) : merged.gatewayToken,
    googleOAuthClientId: merged.googleOAuthClientId,
    googleOAuthClientSecret:
      typeof merged.googleOAuthClientSecret === 'string'
        ? encryptToken(merged.googleOAuthClientSecret)
        : merged.googleOAuthClientSecret,
    smartThingsAccessToken:
      typeof merged.smartThingsAccessToken === 'string'
        ? encryptToken(merged.smartThingsAccessToken)
        : merged.smartThingsAccessToken,
    smartThingsLocationId: merged.smartThingsLocationId,
    googleHomeOAuthClientId: merged.googleHomeOAuthClientId,
    googleHomeOAuthClientSecret:
      typeof merged.googleHomeOAuthClientSecret === 'string'
        ? encryptToken(merged.googleHomeOAuthClientSecret)
        : merged.googleHomeOAuthClientSecret,
    googleHomeProjectId: merged.googleHomeProjectId,
  }

  const path = settingsPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(storedShape, null, 2) + '\n', 'utf-8')
  try {
    chmodSync(path, 0o600)
  } catch {
  }
  if (
    !encryptionAvailable()
    && (typeof storedShape.daemonToken === 'string'
      || typeof storedShape.gatewayToken === 'string'
      || typeof storedShape.googleOAuthClientSecret === 'string'
      || typeof storedShape.smartThingsAccessToken === 'string'
      || typeof storedShape.googleHomeOAuthClientSecret === 'string')
  ) {
    console.warn(
      '[desktop-settings] OS keyring unavailable — tokens persisted in plaintext at',
      path,
      '. Install gnome-keyring / kwallet (Linux) or run in a desktop session for at-rest encryption.',
    )
  }
  return merged
}

function sanitize(input: Partial<DesktopSettings>): Partial<DesktopSettings> {
  const out: Partial<DesktopSettings> = {}
  for (const key of [
    'daemonUrl',
    'daemonToken',
    'gatewayUrl',
    'gatewayToken',
    'googleOAuthClientId',
    'googleOAuthClientSecret',
    'smartThingsAccessToken',
    'smartThingsLocationId',
    'googleHomeOAuthClientId',
    'googleHomeOAuthClientSecret',
    'googleHomeProjectId',
  ] as const) {
    if (key in input) {
      const v = input[key]
      if (v == null || (typeof v === 'string' && v.trim() === '')) {
        out[key] = null
      } else if (typeof v === 'string') {
        out[key] = v.trim()
      }
    }
  }
  return out
}
