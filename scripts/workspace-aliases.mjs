import { fileURLToPath, URL } from 'node:url'

const workspaceEntryPaths = {
  '@sepilotd/core': '../sepilot-cli/packages/core/src/index.ts',
  '@sepilotd/presentation': '../sepilot-cli/packages/presentation/src/index.ts',
  '@sepilotd/presentation/artifacts/shared': '../sepilot-cli/packages/presentation/src/artifacts/shared.ts',
  '@sepilotd/presentation/artifacts/react': '../sepilot-cli/packages/presentation/src/artifacts/react.tsx',
  '@sepilotd/presentation/canvas/react': '../sepilot-cli/packages/presentation/src/canvas/react.tsx',
  '@sepilotd/api-client': '../sepilot-cli/packages/api-client/src/index.ts',
  '@sepilotd/api-client/node': '../sepilot-cli/packages/api-client/src/node.ts',
  '@sepilotd/api-client/desktop': '../sepilot-cli/packages/api-client/src/desktop.ts',
  '@sepilotd/api-client/http': '../sepilot-cli/packages/api-client/src/http.ts',
  '@sepilotd/api-client/daemon/chat-surface': '../sepilot-cli/packages/api-client/src/daemon/chat-surface.ts',
  '@sepilotd/api-client/daemon/chat-transport': '../sepilot-cli/packages/api-client/src/daemon/chat-transport.ts',
  '@sepilotd/api-client/daemon/http': '../sepilot-cli/packages/api-client/src/daemon/http.ts',
  '@sepilotd/api-client/daemon/image-canvas': '../sepilot-cli/packages/api-client/src/daemon/image-canvas.ts',
  '@sepilotd/api-client/daemon/types': '../sepilot-cli/packages/api-client/src/daemon/types.ts',
  '@sepilotd/api-client/daemon/ws': '../sepilot-cli/packages/api-client/src/daemon/ws.ts',
  '@sepilotd/api-client/daemon/stream': '../sepilot-cli/packages/api-client/src/daemon/stream.ts',
  '@sepilotd/api-client/gateway/http': '../sepilot-cli/packages/api-client/src/gateway/http.ts',
}

const workspaceDirPaths = {
  '@sepilotd/core': '../sepilot-cli/packages/core/src',
  '@sepilotd/presentation': '../sepilot-cli/packages/presentation/src',
  '@sepilotd/api-client': '../sepilot-cli/packages/api-client/src',
}

function resolveWorkspacePath(relativePath) {
  return fileURLToPath(new URL(relativePath, import.meta.url))
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function createWorkspaceEntryAliases(ids) {
  return ids.map((id) => {
    const relativePath = workspaceEntryPaths[id]
    if (!relativePath) {
      throw new Error(`Unknown workspace entry alias: ${id}`)
    }
    return {
      find: new RegExp(`^${escapeRegExp(id)}$`),
      replacement: resolveWorkspacePath(relativePath),
    }
  })
}

export function createWorkspaceDirAliasMap(ids) {
  return Object.fromEntries(
    ids.map((id) => {
      const relativePath = workspaceDirPaths[id]
      if (!relativePath) {
        throw new Error(`Unknown workspace dir alias: ${id}`)
      }
      return [id, resolveWorkspacePath(relativePath)]
    }),
  )
}

export const commonWorkspaceDirAliasIds = [
  '@sepilotd/core',
  '@sepilotd/presentation',
  '@sepilotd/api-client',
]

export const cliVitestWorkspaceAliasIds = [
  '@sepilotd/presentation/artifacts/shared',
  '@sepilotd/presentation/artifacts/react',
  '@sepilotd/presentation/canvas/react',
  '@sepilotd/presentation',
  '@sepilotd/api-client/node',
  '@sepilotd/api-client/daemon/chat-surface',
  '@sepilotd/api-client/daemon/chat-transport',
  '@sepilotd/api-client/daemon/http',
  '@sepilotd/api-client/daemon/types',
  '@sepilotd/api-client/daemon/ws',
  '@sepilotd/api-client/daemon/stream',
  '@sepilotd/api-client/gateway/http',
  '@sepilotd/api-client/desktop',
  '@sepilotd/api-client/http',
  '@sepilotd/api-client',
]

export const desktopVitestWorkspaceAliasIds = [
  '@sepilotd/core',
  '@sepilotd/presentation',
  '@sepilotd/api-client/node',
  '@sepilotd/api-client',
]

export const mobileVitestWorkspaceAliasIds = [
  '@sepilotd/api-client/daemon/image-canvas',
  '@sepilotd/api-client',
]

export const webVitestWorkspaceAliasIds = [
  '@sepilotd/core',
  '@sepilotd/presentation',
  '@sepilotd/api-client/daemon/http',
  '@sepilotd/api-client/daemon/image-canvas',
  '@sepilotd/api-client',
]

export const daemonVitestWorkspaceAliasIds = [
  '@sepilotd/api-client/node',
  '@sepilotd/api-client',
]

export const gatewayVitestWorkspaceAliasIds = [
  '@sepilotd/core',
]
