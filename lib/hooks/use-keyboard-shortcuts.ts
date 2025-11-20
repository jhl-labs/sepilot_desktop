import { useEffect } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean; // Cmd on Mac, Win on Windows
  handler: (event: KeyboardEvent) => void;
  description?: string;
}

/**
 * 키보드 단축키 Hook
 *
 * @param shortcuts - 등록할 단축키 배열
 * @param enabled - 단축키 활성화 여부 (기본: true)
 */
export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  enabled: boolean = true
): void {
  useEffect(() => {
    if (!enabled) {return;}

    const handleKeyDown = (event: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        // 키 체크
        const keyMatch =
          event.key.toLowerCase() === shortcut.key.toLowerCase() ||
          event.code.toLowerCase() === shortcut.key.toLowerCase();

        // 수정키 체크
        const ctrlMatch = shortcut.ctrl ? event.ctrlKey : !event.ctrlKey;
        const altMatch = shortcut.alt ? event.altKey : !event.altKey;
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
        const metaMatch = shortcut.meta ? event.metaKey : !event.metaKey;

        if (keyMatch && ctrlMatch && altMatch && shiftMatch && metaMatch) {
          event.preventDefault();
          shortcut.handler(event);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcuts, enabled]);
}

/**
 * 플랫폼별 수정키 이름 가져오기
 */
export function getModifierKey(): 'Cmd' | 'Ctrl' {
  if (typeof window === 'undefined') {return 'Ctrl';}

  return window.electronAPI?.platform === 'darwin' ? 'Cmd' : 'Ctrl';
}

/**
 * 단축키 표시 문자열 생성
 *
 * @example
 * formatShortcut({ key: 'n', meta: true }) => "Cmd+N" (macOS) or "Ctrl+N" (other)
 */
export function formatShortcut(shortcut: Omit<KeyboardShortcut, 'handler'>): string {
  const parts: string[] = [];
  const modifier = getModifierKey();

  if (shortcut.ctrl) {parts.push('Ctrl');}
  if (shortcut.alt) {parts.push('Alt');}
  if (shortcut.shift) {parts.push('Shift');}
  if (shortcut.meta) {parts.push(modifier);}

  parts.push(shortcut.key.toUpperCase());

  return parts.join('+');
}
