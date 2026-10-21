import { createResettableStore } from './create-store'

export interface RagFolder {
  id: string
  name: string
  documents: number
  sourceType: 'manual' | 'git' | 'web'
  tlsVerify?: boolean
  caCert?: string
  path?: string
  include?: string[]
  exclude?: string[]
  lastSyncedAt: number | null
  lastSyncStatus: 'success' | 'error' | null
  lastSyncError: string | null
}

export interface RagDocument {
  id: string
  folderId: string
  title: string
  path?: string
  sourceFileId?: string
  size?: number
  updatedAt: number
}

interface RagState {
  folders: RagFolder[]
  documents: RagDocument[]
  setFolders: (next: RagFolder[]) => void
  setDocuments: (next: RagDocument[]) => void
}

const defaults = { folders: [] as RagFolder[], documents: [] as RagDocument[] }

const { store, reset } = createResettableStore<RagState>(
  (set) => ({
    ...defaults,
    setFolders: (folders: RagFolder[]) => set({ folders }),
    setDocuments: (documents: RagDocument[]) => set({ documents }),
  }),
  { ...defaults, setFolders: () => {}, setDocuments: () => {} },
)

export const useRagStore = store
export const resetRagStore = reset
