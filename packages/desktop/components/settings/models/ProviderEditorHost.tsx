'use client'

import { useEffect, useState } from 'react'
import type { ProviderDraft } from './model-settings-view'
import type { SaveProviderDraftOptions } from './use-ai-models-controller'
import { ProviderEditorDialog } from './ProviderEditorDialog'

export interface ProviderEditorActions {
  draft: ProviderDraft | null
  busyAction: string | null
  setDraft(draft: ProviderDraft | null): void
  saveDraft(options?: SaveProviderDraftOptions): Promise<void>
  discoverDraftModels(): Promise<void>
}

interface ProviderEditorHostProps {
  controller: ProviderEditorActions
  purpose?: 'settings' | 'setup'
}

export function ProviderEditorHost({ controller, purpose = 'settings' }: ProviderEditorHostProps) {
  const [validationModel, setValidationModel] = useState('')
  const draftModels = controller.draft?.models

  useEffect(() => {
    setValidationModel((current) => (current && draftModels?.includes(current) ? current : ''))
  }, [controller.draft?.originalId, controller.draft?.isNew, draftModels])

  if (!controller.draft) return null

  return (
    <ProviderEditorDialog
      draft={controller.draft}
      busy={controller.busyAction === 'save'}
      discovering={controller.busyAction === 'discover-draft'}
      purpose={purpose}
      validationModel={validationModel}
      onChange={controller.setDraft}
      onValidationModelChange={setValidationModel}
      onClose={() => controller.setDraft(null)}
      onSave={() =>
        void controller.saveDraft({
          validateBeforeSave: purpose === 'setup',
          validationModel: purpose === 'setup' ? validationModel : undefined,
        })
      }
      onDiscover={() => void controller.discoverDraftModels()}
    />
  )
}
