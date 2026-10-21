import { z } from 'zod'

const SCOPE = z.enum([
  'inspect',
  'chat',
  'files',
  'ws',
  'approvals',
  'memory',
  'tools',
  'sessions',
  'rag',
])

const Schema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  mode: z.string().optional(),
  token: z.object({
    scopes: z.array(SCOPE).default([]),
  }),
})

export type ExtensionManifest = z.infer<typeof Schema>

export function parseExtensionManifest(input: unknown): ExtensionManifest {
  return Schema.parse(input)
}
