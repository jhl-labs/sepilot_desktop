'use client';

import { useHotkeys } from 'react-hotkeys-hook';
import { useChatStore } from '@/lib/store/chat-store';
import { useState } from 'react';

/**
 * Terminal Extension 전역 키보드 단축키 훅
 *
 * 지원하는 단축키:
 * - Ctrl/Cmd + K: 터미널 입력 포커스
 * - Ctrl/Cmd + Shift + N: 새 세션 생성
 * - Ctrl/Cmd + L: 화면 클리어
 * - Ctrl/Cmd + .: 히스토리 토글
 * - Ctrl/Cmd + 1-9: 세션 전환
 * - Ctrl/Cmd + Shift + ?: 단축키 도움말
 */
export function useTerminalHotkeys() {
  const store = useChatStore();
  const { toggleHistory, clearTerminalBlocks } = store as any;

  const sessions = (store as any).sessions || [];
  const createTerminalSession = (store as any).createTerminalSession;
  const setActiveTerminalSession = (store as any).setActiveTerminalSession;

  const [showShortcutsDialog, setShowShortcutsDialog] = useState(false);

  // Ctrl/Cmd + K: 터미널 입력 포커스
  useHotkeys(
    'mod+k',
    (e) => {
      e.preventDefault();
      const terminalInput = document.querySelector<HTMLInputElement>('.terminal-input');
      if (terminalInput) {
        terminalInput.focus();
      }
    },
    { enableOnFormTags: true }
  );

  // Ctrl/Cmd + Shift + N: 새 세션 생성
  useHotkeys(
    'mod+shift+n',
    async (e) => {
      e.preventDefault();
      if (!window.electronAPI?.terminal) {
        return;
      }

      try {
        const result = await window.electronAPI.terminal.createSession(undefined, 120, 30);

        if (result.success && result.data) {
          if (createTerminalSession) {
            createTerminalSession({
              name: `Terminal ${sessions.length + 1}`,
              ptySessionId: result.data.sessionId,
              cwd: result.data.cwd,
              shell: result.data.shell,
            });
          }
        }
      } catch (error) {
        console.error('[useTerminalHotkeys] Failed to create session:', error);
      }
    },
    { enableOnFormTags: false }
  );

  // Ctrl/Cmd + L: 화면 클리어
  useHotkeys(
    'mod+l',
    (e) => {
      e.preventDefault();
      if (clearTerminalBlocks) {
        clearTerminalBlocks();
      }
    },
    { enableOnFormTags: false }
  );

  // Ctrl/Cmd + .: 히스토리 토글
  useHotkeys(
    'mod+.',
    (e) => {
      e.preventDefault();
      if (toggleHistory) {
        toggleHistory();
      }
    },
    { enableOnFormTags: false }
  );

  // Ctrl/Cmd + 1-9: 세션 전환
  useHotkeys(
    'mod+1,mod+2,mod+3,mod+4,mod+5,mod+6,mod+7,mod+8,mod+9',
    (e) => {
      e.preventDefault();
      const key = e.key;
      const index = parseInt(key, 10) - 1;
      const session = sessions[index];
      if (session && setActiveTerminalSession) {
        setActiveTerminalSession(session.id);
      }
    },
    { enableOnFormTags: false },
    [sessions, setActiveTerminalSession]
  );

  // Ctrl/Cmd + Shift + /: 단축키 도움말
  useHotkeys(
    'mod+shift+/',
    (e) => {
      e.preventDefault();
      setShowShortcutsDialog(true);
    },
    { enableOnFormTags: true }
  );

  return {
    showShortcutsDialog,
    setShowShortcutsDialog,
  };
}
