import { readFileSync } from 'node:fs'

export const browserExtensionFileNames = [
  'manifest.json',
  'background.js',
  'protocol.js',
  'popup.html',
  'popup.js',
  'popup.css',
]
export function loadBrowserExtensionFiles() {
  return Object.fromEntries(
    browserExtensionFileNames.map((name) => [
      name,
      readFileSync(new URL(`../extension-browser/${name}`, import.meta.url), 'utf8'),
    ]),
  )
}
