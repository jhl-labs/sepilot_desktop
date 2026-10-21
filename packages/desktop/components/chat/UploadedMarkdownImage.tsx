'use client'
import { useEffect, useState } from 'react'
import { useTransport } from '@/components/providers/transport-provider'
import { createFilesApi } from '@/lib/api/files'
import { isSafeInlineImageMimeType } from '@/lib/utils/image-mime'

export function uploadedMarkdownImageId(src: string): string | undefined {
  const match = /^\/api\/v1\/files\/([a-zA-Z0-9_-]+)\/download$/.exec(src)
  return match?.[1]
}

export function UploadedMarkdownImage({ fileId, alt }: { fileId: string; alt: string }) {
  const transport = useTransport()
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    let owned: string | undefined
    setUrl('')
    setFailed(false)
    void (async () => {
      const api = await createFilesApi(transport)
      const blob = await api.download(fileId, controller.signal)
      if (!isSafeInlineImageMimeType(blob.type)) throw new Error('Unsupported image format')
      if (controller.signal.aborted) return
      owned = URL.createObjectURL(blob)
      setUrl(owned)
    })().catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => { controller.abort(); if (owned) URL.revokeObjectURL(owned) }
  }, [fileId, transport])
  return url ? <img src={url} alt={alt} className="my-1.5 h-auto max-h-[480px] max-w-full rounded-md border border-border" />
    : <span role={failed ? 'alert' : 'status'}>{alt}{failed ? ' ⚠' : ' …'}</span>
}
