import { open, realpath } from 'node:fs/promises'
import { constants } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

const MAX_PREVIEW_BYTES = 2 * 1024 * 1024

export async function readPreviewFile(input: unknown): Promise<{ path: string; content: string }> {
  if (!input || typeof input !== 'object') throw new Error('파일 경로가 필요합니다.')
  const { path, cwd } = input as { path?: unknown; cwd?: unknown }
  if (typeof path !== 'string' || !path || path.includes('\0')) throw new Error('잘못된 파일 경로입니다.')
  if (!isAbsolute(path) && (typeof cwd !== 'string' || !isAbsolute(cwd))) {
    throw new Error('상대 경로를 열려면 대화의 작업 폴더를 먼저 지정하세요.')
  }
  const resolved = await realpath(isAbsolute(path) ? path : resolve(cwd as string, path))
  const file = await open(resolved, constants.O_RDONLY | constants.O_NONBLOCK)
  try {
    const info = await file.stat()
    if (!info.isFile()) throw new Error('일반 파일만 미리 볼 수 있습니다.')
    if (info.size > MAX_PREVIEW_BYTES) throw new Error('미리보기는 2MB 이하 파일을 지원합니다.')
    const buffer = Buffer.alloc(MAX_PREVIEW_BYTES + 1)
    let size = 0
    while (size < buffer.length) {
      const { bytesRead } = await file.read(buffer, size, buffer.length - size, null)
      if (!bytesRead) break
      size += bytesRead
    }
    if (size > MAX_PREVIEW_BYTES) throw new Error('미리보기는 2MB 이하 파일을 지원합니다.')
    const bytes = buffer.subarray(0, size)
    if (bytes.includes(0)) throw new Error('바이너리 파일은 텍스트로 미리 볼 수 없습니다.')
    return { path: resolved, content: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  } finally { await file.close() }
}
