'use client'
import { useState } from 'react'
import { BookOpen, Image, Settings, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RuntimeFeedback } from '@/lib/utils/runtime-feedback'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { PersonaDialog } from '@/components/persona/PersonaDialog'
import { ChatHistory } from './ChatHistory'
import { CanvasActivityRail } from './CanvasActivityRail'

export interface SidebarChatProps {
  onPickSession: (id: string) => void
  onOpenSettings: () => void
  onOpenDocs?: () => void
  onOpenGallery?: () => void
  onOpenWiki?: () => void
  activeView?: string
  statusNotice?: RuntimeFeedback | null
  showMicroAppChats?: boolean
}

export function SidebarChat({
  onPickSession,
  onOpenSettings,
  onOpenDocs,
  onOpenGallery,
  onOpenWiki,
  activeView = 'chat',
  statusNotice = null,
  showMicroAppChats = false,
}: SidebarChatProps) {
  const [personaDialogOpen, setPersonaDialogOpen] = useState(false)
  const knowledgeActive = ['knowledge', 'wiki', 'rag', 'personal-docs', 'team-docs'].includes(
    activeView,
  )
  const openKnowledge = () => {
    const target = activeView === 'rag' ? (onOpenDocs ?? onOpenWiki) : (onOpenWiki ?? onOpenDocs)
    target?.()
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeView === 'canvas' ? (
          <CanvasActivityRail />
        ) : (
          <ChatHistory
            onPick={onPickSession}
            onOpenSettings={onOpenSettings}
            statusNotice={statusNotice}
            showMicroAppChats={showMicroAppChats}
          />
        )}
      </div>

      <div className="shrink-0 border-t px-2 py-1.5">
        <div className="flex gap-0.5" data-testid="sidebar-footer-actions">
          <ThemeToggle className="h-8 flex-1 [&>svg]:h-4 [&>svg]:w-4" />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPersonaDialogOpen(true)}
            title="페르소나 관리"
            aria-label="페르소나 관리"
            className="h-8 flex-1"
          >
            <User className="h-4 w-4" />
            <span className="sr-only">페르소나 관리</span>
          </Button>
          {onOpenWiki || onOpenDocs ? (
            <Button
              variant={knowledgeActive ? 'secondary' : 'ghost'}
              size="icon"
              onClick={openKnowledge}
              title="Docs · 문서와 Wiki"
              aria-label="Docs · 문서와 Wiki"
              aria-current={knowledgeActive ? 'page' : undefined}
              className="h-8 flex-1"
              data-testid="sidebar-knowledge-btn"
            >
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Docs · 문서와 Wiki</span>
            </Button>
          ) : null}
          {onOpenGallery ? (
            <Button
              variant={activeView === 'gallery' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={onOpenGallery}
              title="Gallery"
              aria-label="gallery"
              className="h-8 flex-1"
            >
              <Image className="h-4 w-4" />
              <span className="sr-only">Gallery</span>
            </Button>
          ) : null}
          <Button
            variant={activeView === 'settings' ? 'secondary' : 'ghost'}
            size="icon"
            onClick={onOpenSettings}
            title="Settings"
            aria-label="settings"
            className="h-8 flex-1"
          >
            <Settings className="h-4 w-4" />
            <span className="sr-only">Settings</span>
          </Button>
        </div>
      </div>

      <PersonaDialog open={personaDialogOpen} onOpenChange={setPersonaDialogOpen} />
    </div>
  )
}
