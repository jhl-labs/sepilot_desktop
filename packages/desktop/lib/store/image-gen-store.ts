import { createResettableStore } from './create-store'
import type { ImageJob } from '@/lib/api/image-gen'

interface ImageGenState {
  jobs: ImageJob[]
  setJobs: (next: ImageJob[]) => void
  upsertJob: (job: ImageJob) => void
  removeJob: (id: string) => void
}

const defaults = { jobs: [] as ImageJob[] }

const sortByCreated = (list: ImageJob[]): ImageJob[] =>
  list.slice().sort((a, b) => b.createdAt - a.createdAt)

const { store, reset } = createResettableStore<ImageGenState>(
  (set, get) => ({
    ...defaults,
    setJobs: (jobs: ImageJob[]) => set({ jobs: sortByCreated(jobs) }),
    upsertJob: (job: ImageJob) => {
      const list = get().jobs
      const i = list.findIndex((x) => x.id === job.id)
      const next = i === -1 ? [job, ...list] : list.slice()
      if (i !== -1) next[i] = job
      set({ jobs: sortByCreated(next) })
    },
    removeJob: (id: string) => set({ jobs: get().jobs.filter((job) => job.id !== id) }),
  }),
  { ...defaults, setJobs: () => {}, upsertJob: () => {}, removeJob: () => {} },
)

export const useImageGenStore = store
export const resetImageGenStore = reset
