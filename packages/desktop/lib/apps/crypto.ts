export interface AppsAesGcmEnvelope {
  salt: string
  iv: string
  cipher: string
  updatedAt: number
}

type WebCryptoProvider = Pick<Crypto, 'getRandomValues' | 'subtle'>

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function getDefaultCrypto(): WebCryptoProvider | null {
  const cryptoProvider = globalThis.crypto
  if (!cryptoProvider?.subtle || typeof cryptoProvider.getRandomValues !== 'function') {
    return null
  }
  return cryptoProvider
}

export function hasAppsAesGcmCrypto(cryptoProvider: WebCryptoProvider | null = getDefaultCrypto()): boolean {
  return Boolean(cryptoProvider?.subtle && typeof cryptoProvider.getRandomValues === 'function')
}

function requireCrypto(cryptoProvider: WebCryptoProvider | null = getDefaultCrypto()): WebCryptoProvider {
  if (!hasAppsAesGcmCrypto(cryptoProvider)) {
    throw new Error('WebCrypto AES-GCM is unavailable in this renderer.')
  }
  return cryptoProvider as WebCryptoProvider
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function normalizeEnvelope(value: unknown): AppsAesGcmEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Encrypted vault payload is invalid.')
  }
  const envelope = value as Partial<AppsAesGcmEnvelope>
  if (
    typeof envelope.salt !== 'string' ||
    typeof envelope.iv !== 'string' ||
    typeof envelope.cipher !== 'string'
  ) {
    throw new Error('Encrypted vault payload is missing salt, iv, or cipher.')
  }
  return {
    salt: envelope.salt,
    iv: envelope.iv,
    cipher: envelope.cipher,
    updatedAt: typeof envelope.updatedAt === 'number' ? envelope.updatedAt : 0,
  }
}

async function deriveAesGcmKey(
  passphrase: string,
  salt: Uint8Array,
  cryptoProvider: WebCryptoProvider,
): Promise<CryptoKey> {
  const baseKey = await cryptoProvider.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return cryptoProvider.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 180000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptAppsAesGcmJson(
  value: unknown,
  passphrase: string,
  cryptoProvider: WebCryptoProvider | null = getDefaultCrypto(),
): Promise<AppsAesGcmEnvelope> {
  const activeCrypto = requireCrypto(cryptoProvider)
  const salt = activeCrypto.getRandomValues(new Uint8Array(16))
  const iv = activeCrypto.getRandomValues(new Uint8Array(12))
  const key = await deriveAesGcmKey(passphrase, salt, activeCrypto)
  const cipher = await activeCrypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(value)),
  )
  return {
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    cipher: bytesToBase64(new Uint8Array(cipher)),
    updatedAt: Date.now(),
  }
}

export async function decryptAppsAesGcmJson<T = unknown>(
  envelope: unknown,
  passphrase: string,
  cryptoProvider: WebCryptoProvider | null = getDefaultCrypto(),
): Promise<T> {
  const activeCrypto = requireCrypto(cryptoProvider)
  const normalized = normalizeEnvelope(envelope)
  const key = await deriveAesGcmKey(passphrase, base64ToBytes(normalized.salt), activeCrypto)
  const plain = await activeCrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(normalized.iv) },
    key,
    base64ToBytes(normalized.cipher),
  )
  return JSON.parse(decoder.decode(plain)) as T
}
