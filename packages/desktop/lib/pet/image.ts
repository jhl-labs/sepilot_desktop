export async function readPetImage(file: File): Promise<string> {
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    file.size > 5 * 1024 * 1024
  ) {
    throw new Error('5MB 이하의 PNG, JPEG, WebP 이미지를 선택하세요.')
  }
  const bitmap = await createImageBitmap(file)
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width > 8192 || bitmap.height > 8192)
      throw new Error('이미지는 최대 8192 × 8192 크기까지 지원합니다.')
    const canvas = document.createElement('canvas')
    const ratio = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height))
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio))
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('이미지를 처리할 수 없습니다.')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const data = canvas.toDataURL('image/png')
    if (data.length > 400_000)
      throw new Error('이미지가 너무 복잡합니다. 더 작은 이미지를 선택하세요.')
    return data
  } finally {
    bitmap.close()
  }
}
