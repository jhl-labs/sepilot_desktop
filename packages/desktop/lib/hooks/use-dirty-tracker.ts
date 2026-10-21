'use client'
import { useEffect } from 'react'
import { useSettingsDirtyStore } from '@/lib/store/settings-dirty-store'

export function useDirtyTracker<T>(tabKey: string, current: T, savedSnapshot: T | null): void {
  const markDirty = useSettingsDirtyStore((s) => s.markDirty)
  const markClean = useSettingsDirtyStore((s) => s.markClean)

  useEffect(() => {
    if (savedSnapshot == null) {
      markClean(tabKey)
      return
    }
    const dirty = JSON.stringify(current) !== JSON.stringify(savedSnapshot)
    if (dirty) markDirty(tabKey)
    else markClean(tabKey)
  }, [tabKey, current, savedSnapshot, markDirty, markClean])

  useEffect(() => () => markClean(tabKey), [tabKey, markClean])
}
