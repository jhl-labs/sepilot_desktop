/**
 * Extension Importers (Auto-generated)
 *
 * ⚠️  DO NOT EDIT MANUALLY
 * 이 파일은 scripts/generate-extension-imports.js에 의해 자동 생성됩니다.
 *
 * 개발 모드에서만 사용되며, webpack의 동적 import를 위한 static mapping을 제공합니다.
 * 프로덕션에서는 runtime loading (sepilot-ext:// protocol)을 사용하므로 이 파일이 필요 없습니다.
 *
 * Generated: 2026-02-22T13:58:15.326Z
 */

export const EXTENSION_IMPORTERS: Record<string, () => Promise<any>> = {
  architect: () => import('@sepilot/extension-architect'),
  browser: () => import('@sepilot/extension-browser'),
  confluence: () => import('@sepilot/extension-confluence'),
  editor: () => import('@sepilot/extension-editor'),
  'git-desktop-assistant': () => import('@sepilot/extension-git-desktop-assistant'),
  'github-actions': () => import('@sepilot/extension-github-actions'),
  'github-pr-review': () => import('@sepilot/extension-github-pr-review'),
  'github-project': () => import('@sepilot/extension-github-project'),
  'jira-scrum': () => import('@sepilot/extension-jira-scrum'),
  'mail-file-watcher': () => import('@sepilot/extension-mail-file-watcher'),
  presentation: () => import('@sepilot/extension-presentation'),
  terminal: () => import('@sepilot/extension-terminal'),
};
