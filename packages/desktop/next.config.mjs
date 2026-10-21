import { loadDesktopBuildProfile } from './build-features.mjs'
import { desktopDevDistDir } from './dev-instance.mjs'
import { constants, copyFileSync } from 'node:fs'

const releaseBuildId = process.env.SEPILOT_BUILD_ID?.trim()
const desktopBuildProfile = loadDesktopBuildProfile()
const distDir = desktopDevDistDir()
const devTsconfig = distDir === '.next' ? undefined : `.tsconfig${distDir.slice(5)}.json`
if (devTsconfig) {
  try {
    copyFileSync(new URL('./tsconfig.json', import.meta.url), new URL(devTsconfig, import.meta.url), constants.COPYFILE_EXCL)
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
}

const nextConfig = {
  distDir,
  ...(devTsconfig ? { typescript: { tsconfigPath: devTsconfig } } : {}),
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  devIndicators: { position: 'top-left' },
  productionBrowserSourceMaps: false,
  env: {
    NEXT_PUBLIC_SEPILOTD_DESKTOP_SETTINGS_FEATURES: JSON.stringify(desktopBuildProfile.settings),
    NEXT_PUBLIC_SEPILOTD_DESKTOP_MODE_FEATURES: JSON.stringify(desktopBuildProfile.modes),
    NEXT_PUBLIC_SEPILOTD_DESKTOP_APP_CATALOG: JSON.stringify(desktopBuildProfile.apps),
  },
  ...(releaseBuildId
    ? {
        generateBuildId: async () => releaseBuildId,
      }
    : {}),

  webpack: (config) => {
    config.resolve = config.resolve ?? {}
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    }
    return config
  },
}

export default nextConfig
