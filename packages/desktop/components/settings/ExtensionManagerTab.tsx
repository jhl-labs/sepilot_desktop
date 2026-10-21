'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { confirm } from '@/lib/utils/confirm'
import { useTransport } from '@/components/providers/transport-provider'
import { useExtensionsStore } from '@/lib/store/extensions-store'
import { createExtensionsApi } from '@/lib/api/extensions'
import { useExtensionRegistry } from '@/components/providers/extension-provider'
import { explainChatStreamError } from '@/lib/utils/friendly-error'
import { ExtensionCard } from './ExtensionCard'
import { UnimplementedBanner } from './_shared/UnimplementedBanner'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'extensions',
  section: 'integrations',
  label: 'Extensions',
  search: ['extension', 'plugin'],
  render: () => <ExtensionManagerTab />,
})

export function ExtensionManagerTab() {
  const transport = useTransport()
  const items = useExtensionsStore((s) => s.items)
  const reg = useExtensionRegistry()
  const [busyId, setBusyId] = useState<string | null>(null)

  async function toggle(id: string, enable: boolean): Promise<void> {
    setBusyId(id)
    try {
      const api = await createExtensionsApi(transport)
      if (enable) await api.enable(id)
      else await api.disable(id)
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setBusyId(null)
    }
  }

  async function uninstall(id: string, name: string): Promise<void> {
    const ok = await confirm(`'${name}' 확장을 삭제하시겠습니까?`, { destructive: true })
    if (!ok) return
    setBusyId(id)
    try {
      const api = await createExtensionsApi(transport)
      await api.uninstall(id)
      toast.success(`확장 '${name}'을 삭제했습니다.`)
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setBusyId(null)
    }
  }

  if (!reg.capabilityAvailable && items.length === 0) {
    return <UnimplementedBanner what="Extensions" />
  }

  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          등록된 확장이 없습니다.
        </p>
      ) : (
        items.map((it) => (
          <ExtensionCard
            key={it.id}
            item={it}
            busy={busyId === it.id}
            onEnable={() => void toggle(it.id, true)}
            onDisable={() => void toggle(it.id, false)}
            onUninstall={() => void uninstall(it.id, it.name)}
          />
        ))
      )}
    </div>
  )
}
