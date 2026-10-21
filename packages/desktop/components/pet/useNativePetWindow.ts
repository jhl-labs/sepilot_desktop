'use client'
import { useEffect, type RefObject } from 'react'
import type { PetConfig, PetMood } from '@/lib/pet/model'
import { hasDesktopBridge, getDesktopPlatform, invokeDesktop } from '@/lib/electron/bridge'

export function useNativePetWindow(
  config: PetConfig,
  mood: PetMood,
  ready: boolean,
  source: RefObject<HTMLDivElement | null>,
  onError: (message: string) => void,
) {
  const native = hasDesktopBridge() && getDesktopPlatform() !== null
  useEffect(() => {
    if (!native || !ready) return
    const invoke = invokeDesktop
    let cancelled = false
    const update = async () => {
      if (!config.enabled) {
        await invoke('sepilot:pet/update', { enabled: false })
        return
      }
      const svg = source.current?.querySelector('svg')
      if (!svg) throw new Error('펫 외형을 준비할 수 없습니다.')
      const builtin = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`
      const image = new Image()
      const load = (url: string) =>
        new Promise<void>((resolve, reject) => {
          image.onload = () => resolve()
          image.onerror = () => reject(new Error('펫 이미지를 읽을 수 없습니다.'))
          image.src = url
        })
      try {
        await load(config.images[mood] ?? config.images.idle ?? builtin)
      } catch {
        await load(builtin)
      }
      if (cancelled) return
      const canvas = document.createElement('canvas')
      canvas.width = 256
      canvas.height = 256
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('펫 이미지를 처리할 수 없습니다.')
      const ratio = Math.min(256 / image.naturalWidth, 256 / image.naturalHeight)
      const width = image.naturalWidth * ratio,
        height = image.naturalHeight * ratio
      ctx.drawImage(image, (256 - width) / 2, (256 - height) / 2, width, height)
      if (!cancelled)
        await invoke('sepilot:pet/update', {
          enabled: true,
          image: canvas.toDataURL('image/png'),
          size: config.size,
          motion: config.motion,
        })
    }
    void update().catch((error) => {
      if (!cancelled) onError(error instanceof Error ? error.message : '펫 창을 열 수 없습니다.')
    })
    return () => {
      cancelled = true
    }
  }, [config, mood, ready, native, source, onError])
  return native
}
