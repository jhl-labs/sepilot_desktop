'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from './input';
import { cn } from '@/lib/utils';

interface KeyboardShortcutInputProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * 키보드 이벤트를 Electron 단축키 형식으로 변환
 * 예: Ctrl+Shift+1 -> CommandOrControl+Shift+1
 */
function formatShortcutForElectron(
  key: string,
  ctrl: boolean,
  alt: boolean,
  shift: boolean,
  meta: boolean
): string {
  const parts: string[] = [];

  // CommandOrControl는 meta 또는 ctrl 중 하나가 있으면 사용
  if (meta || ctrl) {
    parts.push('CommandOrControl');
  }

  if (alt) {
    parts.push('Alt');
  }

  if (shift) {
    parts.push('Shift');
  }

  // 마지막 키 추가
  if (key) {
    // 특수 키 처리
    const keyMap: Record<string, string> = {
      ' ': 'Space',
      ArrowUp: 'Up',
      ArrowDown: 'Down',
      ArrowLeft: 'Left',
      ArrowRight: 'Right',
      Enter: 'Return',
      Escape: 'Esc',
      Backspace: 'Backspace',
      Delete: 'Delete',
      Tab: 'Tab',
      Home: 'Home',
      End: 'End',
      PageUp: 'PageUp',
      PageDown: 'PageDown',
      Insert: 'Insert',
      F1: 'F1',
      F2: 'F2',
      F3: 'F3',
      F4: 'F4',
      F5: 'F5',
      F6: 'F6',
      F7: 'F7',
      F8: 'F8',
      F9: 'F9',
      F10: 'F10',
      F11: 'F11',
      F12: 'F12',
    };

    const mappedKey = keyMap[key] || key;
    // 숫자나 알파벳은 그대로 사용
    if (/^[0-9A-Za-z]$/.test(mappedKey)) {
      parts.push(mappedKey);
    } else {
      parts.push(mappedKey);
    }
  }

  return parts.join('+');
}

/**
 * Electron 단축키 형식을 읽기 쉬운 형식으로 변환
 * 예: CommandOrControl+Shift+1 -> Ctrl+Shift+1 (Windows) or Cmd+Shift+1 (Mac)
 */
function formatShortcutForDisplay(value: string, isMac: boolean = false): string {
  if (!value) {
    return '';
  }

  return value
    .replace(/CommandOrControl/g, isMac ? 'Cmd' : 'Ctrl')
    .replace(/Command/g, 'Cmd')
    .replace(/Control/g, 'Ctrl');
}

/**
 * 키보드 단축키 입력 컴포넌트
 * 키를 눌러서 단축키를 등록할 수 있는 현대적인 UX 제공
 */
export function KeyboardShortcutInput({
  value,
  onChange,
  id,
  placeholder,
  className,
  disabled = false,
}: KeyboardShortcutInputProps) {
  const { t } = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const [displayValue, setDisplayValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const isMac =
    typeof window !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  // 기본 placeholder가 없으면 번역된 값 사용
  const displayPlaceholder =
    placeholder || t('settings.quickinput.shortcutPlaceholder', 'Press keys...');

  // value가 변경될 때 displayValue 업데이트
  useEffect(() => {
    setDisplayValue(formatShortcutForDisplay(value, isMac));
  }, [value, isMac]);

  useEffect(() => {
    if (!isRecording || disabled) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape 키로 취소
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIsRecording(false);
        return;
      }

      // Tab 키는 포커스 이동용이므로 무시
      if (e.key === 'Tab') {
        return;
      }

      // 수정키만 눌렀을 때는 무시 (Control, Meta, Alt, Shift 키 자체)
      const modifierKeys = ['Control', 'Meta', 'Alt', 'Shift'];
      if (modifierKeys.includes(e.key)) {
        return;
      }

      // 수정키와 함께 다른 키가 눌렸을 때만 처리
      // 최소 하나의 수정키가 눌려있어야 함 (일반 키만 눌렸을 때는 무시)
      const hasModifier = e.ctrlKey || e.metaKey || e.altKey || e.shiftKey;

      if (hasModifier) {
        e.preventDefault();
        e.stopPropagation();

        const shortcut = formatShortcutForElectron(
          e.key,
          e.ctrlKey,
          e.altKey,
          e.shiftKey,
          e.metaKey
        );

        onChange(shortcut);
        setIsRecording(false);
      }
    };

    // 포커스가 다른 곳으로 이동하면 녹화 중지
    const handleBlur = () => {
      setIsRecording(false);
    };

    const input = inputRef.current;
    if (input) {
      input.addEventListener('blur', handleBlur);
    }

    window.addEventListener('keydown', handleKeyDown, true); // capture phase에서 처리

    return () => {
      if (input) {
        input.removeEventListener('blur', handleBlur);
      }
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isRecording, disabled, onChange]);

  const handleFocus = () => {
    if (!disabled) {
      setIsRecording(true);
    }
  };

  const handleClick = () => {
    if (!disabled && inputRef.current) {
      inputRef.current.focus();
      setIsRecording(true);
    }
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        id={id}
        type="text"
        value={isRecording ? displayPlaceholder : displayValue}
        onFocus={handleFocus}
        onClick={handleClick}
        onChange={() => {}} // 직접 입력 불가
        placeholder={displayPlaceholder}
        className={cn(
          'font-mono cursor-pointer',
          isRecording && 'ring-2 ring-primary ring-offset-2',
          className
        )}
        disabled={disabled}
        readOnly
      />
      {isRecording && (
        <div className="absolute top-full left-0 mt-1 text-xs text-muted-foreground animate-pulse">
          {t(
            'settings.quickinput.shortcutRecordingHint',
            'Press the key combination you want to use, or press Escape to cancel'
          )}
        </div>
      )}
    </div>
  );
}
