export interface DesktopSettingsBuildFeatures {
  google: boolean
  'smart-home': boolean
  'github-oauth': boolean
  'github-sync': boolean
  'team-docs': boolean
}

declare const __SEPILOTD_DESKTOP_SETTINGS_FEATURES__:
  | DesktopSettingsBuildFeatures
  | undefined

const SAFE_FALLBACK: DesktopSettingsBuildFeatures = Object.freeze({
  google: false,
  'smart-home': false,
  'github-oauth': false,
  'github-sync': false,
  'team-docs': true,
})

export const desktopSettingsBuildFeatures: DesktopSettingsBuildFeatures =
  typeof __SEPILOTD_DESKTOP_SETTINGS_FEATURES__ === 'undefined'
    ? SAFE_FALLBACK
    : Object.freeze(__SEPILOTD_DESKTOP_SETTINGS_FEATURES__)

export function requireDesktopSettingsBuildFeature(
  feature: keyof DesktopSettingsBuildFeatures,
): void {
  if (!desktopSettingsBuildFeatures[feature]) {
    throw new Error(`Desktop feature "${feature}" is disabled by the build profile.`)
  }
}
