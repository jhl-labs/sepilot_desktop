import React, { useState, useEffect } from 'react'
import { useLocale } from './useLocale'
import { useModalViewportLock } from '../../lib/hooks/use-modal-viewport-lock'

const KEYBOARD_HELP_COPY = {
  en: {
    dialogAria: 'Keyboard shortcuts',
    title: 'Keyboard Shortcuts',
    closeWithEsc: 'Close (Esc)',
    newChat: 'New chat session',
    toggleSidebar: 'Toggle session sidebar',
    openSettings: 'Open settings',
    clearMessages: 'Clear messages',
    toggleHelp: 'Toggle this help',
    sendMessage: 'Send message',
    newLine: 'New line in message',
    helpShortcut: 'Open help from the composer',
    shellShortcut: 'Local shell shortcut (CLI TUI only)',
    memorySave: 'Save a memory entry',
    memorySearch: 'Search memory',
    contextShortcut: 'Attach context in CLI TUI; drop or paste files here',
    stopRun: 'Stop active run / close dialogs',
  },
  ko: {
    dialogAria: '키보드 단축키',
    title: '키보드 단축키',
    closeWithEsc: '닫기 (Esc)',
    newChat: '새 채팅 세션',
    toggleSidebar: '세션 사이드바 토글',
    openSettings: '설정 열기',
    clearMessages: '메시지 지우기',
    toggleHelp: '도움말 토글',
    sendMessage: '메시지 전송',
    newLine: '메시지 안에서 줄바꿈',
    helpShortcut: '입력창에서 도움말 열기',
    shellShortcut: '로컬 셸 단축키 (CLI TUI 전용)',
    memorySave: '메모리 항목 저장',
    memorySearch: '메모리 검색',
    contextShortcut: 'CLI TUI에서는 컨텍스트 첨부, 여기서는 파일 드롭/붙여넣기',
    stopRun: '활성 런 중단 / 대화상자 닫기',
  },
} as const

export function KeyboardHelp() {
  const { locale } = useLocale()
  const copy = KEYBOARD_HELP_COPY[locale] ?? KEYBOARD_HELP_COPY.en
  const [visible, setVisible] = useState(false)
  useModalViewportLock(visible)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '?' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setVisible((v) => !v)
      }
      if (e.key === 'Escape' && visible) {
        setVisible(false)
      }
    }
    const handleToggleHelp = () => setVisible((v) => !v)
    window.addEventListener('keydown', handler)
    window.addEventListener('sepilot:toggle-keyboard-help', handleToggleHelp)
    return () => {
      window.removeEventListener('keydown', handler)
      window.removeEventListener('sepilot:toggle-keyboard-help', handleToggleHelp)
    }
  }, [visible])

  if (!visible) return null

  const shortcuts = [
    { keys: 'Ctrl+N', action: copy.newChat },
    { keys: 'Ctrl+B', action: copy.toggleSidebar },
    { keys: 'Ctrl+,', action: copy.openSettings },
    { keys: 'Ctrl+L', action: copy.clearMessages },
    { keys: 'Ctrl+?', action: copy.toggleHelp },
    { keys: 'Enter', action: copy.sendMessage },
    { keys: 'Shift+Enter', action: copy.newLine },
    { keys: '?', action: copy.helpShortcut },
    { keys: '!cmd', action: copy.shellShortcut },
    { keys: '#text', action: copy.memorySave },
    { keys: '#? query', action: copy.memorySearch },
    { keys: '@path', action: copy.contextShortcut },
    { keys: 'Escape', action: copy.stopRun },
  ]

  return (
    <div
      className="modal-overlay"
      onClick={() => setVisible(false)}
      role="dialog"
      aria-modal="true"
      aria-label={copy.dialogAria}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2 className="modal-title">{copy.title}</h2>
        </header>
        <div
          className="modal-scroll-body"
          role="region"
          aria-label={copy.dialogAria}
        >
          <table className="shortcuts-table">
            <tbody>
              {shortcuts.map((s) => (
                <tr key={s.keys}>
                  <td>
                    <kbd className="kbd">{s.keys}</kbd>
                  </td>
                  <td className="text-secondary">{s.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="modal-footer text-center">
          <button className="btn btn-secondary btn-sm" onClick={() => setVisible(false)}>
            {copy.closeWithEsc}
          </button>
        </footer>
      </div>
    </div>
  )
}
