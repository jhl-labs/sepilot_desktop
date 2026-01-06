/**
 * MIME 타입 매핑 및 유틸리티
 */

export const MIME_TYPE_MAP: Record<string, string> = {
  // 이미지
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
} as const;

/**
 * 확장자로 MIME 타입 조회
 * @param ext - 파일 확장자 (.jpg, .png 등)
 * @returns MIME 타입
 */
export function getMimeTypeByExtension(ext: string): string {
  const normalized = ext.toLowerCase();
  return MIME_TYPE_MAP[normalized] || 'application/octet-stream';
}

/**
 * File 객체에서 MIME 타입 조회
 * @param file - File 객체
 * @returns MIME 타입
 */
export function getMimeTypeByFile(file: File): string {
  // File 객체의 type이 있으면 우선 사용
  if (file.type) {
    return file.type;
  }

  // 없으면 파일명에서 확장자 추출
  const ext = file.name.substring(file.name.lastIndexOf('.'));
  return getMimeTypeByExtension(ext);
}
