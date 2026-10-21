const SAFE_INLINE_IMAGE_MIME_TYPES = new Set([
  'image/avif',
  'image/bmp',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/webp',
])

export function isSafeInlineImageMimeType(value: string): boolean {
  const mimeType = value.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  return SAFE_INLINE_IMAGE_MIME_TYPES.has(mimeType)
}
