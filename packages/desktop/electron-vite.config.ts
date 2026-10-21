import { createRequire } from 'node:module'
import { dirname, resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { loadBrowserExtensionFiles } from './browser-extension-assets.mjs'
import browserExtensionDistribution from './browser-extension-distribution.json'
import {
  commonWorkspaceDirAliasIds,
  createWorkspaceDirAliasMap,
} from '../../scripts/workspace-aliases.mjs'
import { loadDesktopBuildProfile } from './build-features.mjs'

const require = createRequire(import.meta.url)
const desktopBuildProfile = loadDesktopBuildProfile()
const desktopBuildFeatureDefine = {
  __SEPILOTD_DESKTOP_SETTINGS_FEATURES__: JSON.stringify(desktopBuildProfile.settings),
  __SEPILOTD_DESKTOP_MODE_FEATURES__: JSON.stringify(desktopBuildProfile.modes),
}

const workspaceAliases = {
  ...createWorkspaceDirAliasMap(commonWorkspaceDirAliasIds),
  react: dirname(require.resolve('react/package.json')),
  'react/jsx-runtime': require.resolve('react/jsx-runtime'),
  'react/jsx-dev-runtime': require.resolve('react/jsx-dev-runtime'),
  'react-dom': dirname(require.resolve('react-dom/package.json')),
  'react-dom/client': require.resolve('react-dom/client'),
  'react-dom/server': require.resolve('react-dom/server'),
}

export default defineConfig({
  main: {
    define: {
      ...desktopBuildFeatureDefine,
      __SEPILOT_BROWSER_EXTENSION_FILES__: JSON.stringify(loadBrowserExtensionFiles()),
      __SEPILOT_BROWSER_EXTENSION_DISTRIBUTION__: JSON.stringify(browserExtensionDistribution),
    },
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      sourcemap: false,
      minify: 'esbuild',
      rollupOptions: {
        input: resolve(__dirname, 'src/main/index.ts'),
        external: ['bufferutil', 'utf-8-validate', 'node-pty'],
      },
      commonjsOptions: {
        ignore: ['bufferutil', 'utf-8-validate'],
      },
    },
  },
  preload: {
    define: desktopBuildFeatureDefine,
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      sourcemap: false,
      minify: 'esbuild',
      rollupOptions: {
        input: resolve(__dirname, 'src/preload/index.ts'),
      },
    },
  },
  renderer: {
    plugins: [react()],
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: workspaceAliases,
      dedupe: ['react', 'react-dom'],
    },
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      sourcemap: false,
      minify: 'esbuild',
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
  },
})
