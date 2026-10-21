type RendererEnv = 'legacy' | 'next' | undefined

export interface ResolveInput {
  env: RendererEnv
  isDev: boolean
  legacyFile: string
  nextDevUrl: string | null
  nextStaticUrl: string | null
  nextStaticEntry: string | null
}

export type RendererTarget =
  | { kind: 'url'; url: string }
  | { kind: 'file'; path: string }

export function resolveRendererTarget(input: ResolveInput): RendererTarget {
  const env: RendererEnv = input.env === 'legacy' ? 'legacy' : 'next'
  if (env === 'legacy') return { kind: 'file', path: input.legacyFile }
  if (input.isDev && input.nextDevUrl)
    return { kind: 'url', url: input.nextDevUrl }
  if (input.nextStaticUrl)
    return { kind: 'url', url: input.nextStaticUrl }
  if (input.nextStaticEntry)
    return { kind: 'file', path: input.nextStaticEntry }
  throw new Error('Next renderer requested but no static entry available')
}
