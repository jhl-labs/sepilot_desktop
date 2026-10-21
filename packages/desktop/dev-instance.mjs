export function desktopDevDistDir(env = process.env) {
  if (env.NODE_ENV !== 'development' || !env.SEPILOT_DESKTOP_DEV_INSTANCE) return '.next'
  const instance = env.SEPILOT_DESKTOP_DEV_INSTANCE
  if (!/^[a-zA-Z0-9_-]{1,48}$/.test(instance)) {
    throw new Error('SEPILOT_DESKTOP_DEV_INSTANCE must contain 1–48 letters, digits, underscores or hyphens')
  }
  return `.next-dev-${instance}`
}
