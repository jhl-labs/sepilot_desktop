import type { ReactNode } from 'react'
import { PreviewPanel } from './PreviewPanel'
import { PetCompanion } from '@/components/pet/PetCompanion'
import type { PetAssistantActions } from '@/lib/pet/assistant'

export function MainLayout({
  sidebar,
  children,
  petAssistant,
}: {
  sidebar: ReactNode
  children: ReactNode
  petAssistant?: PetAssistantActions
}) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <PetCompanion actions={petAssistant} />
      {sidebar}
      <main className="relative flex min-w-0 flex-1 overflow-hidden bg-background">
        <div className="h-full min-w-0 flex-1 overflow-hidden">{children}</div>
        <PreviewPanel />
      </main>
    </div>
  )
}
