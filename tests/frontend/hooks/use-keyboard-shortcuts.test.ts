/**
 * Keyboard Shortcuts Hook 테스트
 */

import { renderHook } from '@testing-library/react';
import {
  useKeyboardShortcuts,
  getModifierKey,
  formatShortcut,
  KeyboardShortcut,
} from '@/lib/hooks/use-keyboard-shortcuts';
import { enableElectronMode, disableElectronMode, mockElectronAPI } from '../../setup';

describe('use-keyboard-shortcuts', () => {
  describe('useKeyboardShortcuts', () => {
    let addEventListenerSpy: jest.SpyInstance;
    let removeEventListenerSpy: jest.SpyInstance;

    beforeEach(() => {
      addEventListenerSpy = jest.spyOn(window, 'addEventListener');
      removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
    });

    afterEach(() => {
      addEventListenerSpy.mockRestore();
      removeEventListenerSpy.mockRestore();
    });

    it('should register keydown event listener', () => {
      const handler = jest.fn();
      const shortcuts: KeyboardShortcut[] = [
        { key: 'n', meta: true, handler },
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    });

    it('should remove event listener on unmount', () => {
      const handler = jest.fn();
      const shortcuts: KeyboardShortcut[] = [
        { key: 'n', meta: true, handler },
      ];

      const { unmount } = renderHook(() => useKeyboardShortcuts(shortcuts));
      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    });

    it('should not register listener when disabled', () => {
      const handler = jest.fn();
      const shortcuts: KeyboardShortcut[] = [
        { key: 'n', meta: true, handler },
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts, false));

      expect(addEventListenerSpy).not.toHaveBeenCalled();
    });

    it('should call handler when shortcut matches', () => {
      const handler = jest.fn();
      const shortcuts: KeyboardShortcut[] = [
        { key: 'n', ctrl: true, handler },
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      // Simulate keydown event
      const event = new KeyboardEvent('keydown', {
        key: 'n',
        ctrlKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'preventDefault', { value: jest.fn() });

      window.dispatchEvent(event);

      expect(handler).toHaveBeenCalled();
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('should not call handler when modifier keys do not match', () => {
      const handler = jest.fn();
      const shortcuts: KeyboardShortcut[] = [
        { key: 'n', ctrl: true, handler },
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      // Simulate keydown without ctrl
      const event = new KeyboardEvent('keydown', {
        key: 'n',
        ctrlKey: false,
        bubbles: true,
      });

      window.dispatchEvent(event);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle multiple shortcuts', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const shortcuts: KeyboardShortcut[] = [
        { key: 'n', ctrl: true, handler: handler1 },
        { key: 's', ctrl: true, handler: handler2 },
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      // Trigger first shortcut
      const event1 = new KeyboardEvent('keydown', {
        key: 'n',
        ctrlKey: true,
        bubbles: true,
      });
      Object.defineProperty(event1, 'preventDefault', { value: jest.fn() });
      window.dispatchEvent(event1);

      expect(handler1).toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();

      // Trigger second shortcut
      const event2 = new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: true,
        bubbles: true,
      });
      Object.defineProperty(event2, 'preventDefault', { value: jest.fn() });
      window.dispatchEvent(event2);

      expect(handler2).toHaveBeenCalled();
    });

    it('should handle shift modifier', () => {
      const handler = jest.fn();
      const shortcuts: KeyboardShortcut[] = [
        { key: 'c', ctrl: true, shift: true, handler },
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      const event = new KeyboardEvent('keydown', {
        key: 'c',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'preventDefault', { value: jest.fn() });

      window.dispatchEvent(event);

      expect(handler).toHaveBeenCalled();
    });

    it('should handle alt modifier', () => {
      const handler = jest.fn();
      const shortcuts: KeyboardShortcut[] = [
        { key: 'p', alt: true, handler },
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      const event = new KeyboardEvent('keydown', {
        key: 'p',
        altKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'preventDefault', { value: jest.fn() });

      window.dispatchEvent(event);

      expect(handler).toHaveBeenCalled();
    });

    it('should handle meta (Cmd) modifier', () => {
      const handler = jest.fn();
      const shortcuts: KeyboardShortcut[] = [
        { key: 'k', meta: true, handler },
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      const event = new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'preventDefault', { value: jest.fn() });

      window.dispatchEvent(event);

      expect(handler).toHaveBeenCalled();
    });

    it('should match by key code', () => {
      const handler = jest.fn();
      const shortcuts: KeyboardShortcut[] = [
        { key: 'KeyN', ctrl: true, handler },
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      const event = new KeyboardEvent('keydown', {
        code: 'KeyN',
        ctrlKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'preventDefault', { value: jest.fn() });

      window.dispatchEvent(event);

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('getModifierKey', () => {
    it('should return Cmd for darwin platform', () => {
      enableElectronMode();
      mockElectronAPI.platform = 'darwin';
      (window as any).electronAPI.platform = 'darwin';

      expect(getModifierKey()).toBe('Cmd');
    });

    it('should return Ctrl for non-darwin platform', () => {
      enableElectronMode();
      (window as any).electronAPI.platform = 'win32';

      expect(getModifierKey()).toBe('Ctrl');
    });

    it('should return Ctrl when window is undefined', () => {
      const originalWindow = global.window;
      // @ts-expect-error - Testing undefined window
      delete global.window;

      expect(getModifierKey()).toBe('Ctrl');

      global.window = originalWindow;
    });

    it('should return Ctrl in web environment', () => {
      disableElectronMode();

      expect(getModifierKey()).toBe('Ctrl');
    });
  });

  describe('formatShortcut', () => {
    beforeEach(() => {
      disableElectronMode();
    });

    it('should format simple key', () => {
      expect(formatShortcut({ key: 'n' })).toBe('N');
    });

    it('should format with ctrl modifier', () => {
      expect(formatShortcut({ key: 'n', ctrl: true })).toBe('Ctrl+N');
    });

    it('should format with alt modifier', () => {
      expect(formatShortcut({ key: 'p', alt: true })).toBe('Alt+P');
    });

    it('should format with shift modifier', () => {
      expect(formatShortcut({ key: 'c', shift: true })).toBe('Shift+C');
    });

    it('should format with meta modifier (Ctrl in web mode)', () => {
      expect(formatShortcut({ key: 'k', meta: true })).toBe('Ctrl+K');
    });

    it('should format with multiple modifiers', () => {
      expect(formatShortcut({ key: 'c', ctrl: true, shift: true })).toBe('Ctrl+Shift+C');
    });

    it('should format complex shortcut', () => {
      expect(formatShortcut({ key: 'f', ctrl: true, alt: true, shift: true })).toBe(
        'Ctrl+Alt+Shift+F'
      );
    });

    it('should uppercase the key', () => {
      expect(formatShortcut({ key: 'n' })).toBe('N');
      expect(formatShortcut({ key: 'escape' })).toBe('ESCAPE');
    });
  });
});
