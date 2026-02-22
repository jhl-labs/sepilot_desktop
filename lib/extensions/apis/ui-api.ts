/**
 * UI API 구현
 *
 * Extension에게 Toast, Dialog 등 UI 상호작용 기능을 제공합니다.
 */

import type {
  UIAPI,
  ToastOptions,
  DialogOptions,
  DialogResult,
  StatusBarItemOptions,
  StatusBarItem,
  QuickPickItem,
  QuickPickOptions,
} from '@sepilot/extension-sdk';

export class UIAPIImpl implements UIAPI {
  private statusBarItems = new Map<string, StatusBarItemImpl>();

  constructor(
    private extensionId: string,
    private permissions: string[]
  ) {}

  /**
   * 권한 체크
   */
  private checkPermission(permission: string): void {
    if (!this.permissions.includes(permission)) {
      throw new Error(`Extension "${this.extensionId}" does not have permission: ${permission}`);
    }
  }

  /**
   * Toast 메시지 표시
   */
  showToast(message: string, options?: ToastOptions): void {
    this.checkPermission('ui.showToast');

    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.invoke('ui:show-toast', {
        extensionId: this.extensionId,
        message,
        options: {
          type: options?.type || 'info',
          duration: options?.duration || 3000,
        },
      });
    }
  }

  /**
   * Dialog 표시
   */
  async showDialog(options: DialogOptions): Promise<DialogResult> {
    this.checkPermission('ui.showDialog');

    if (typeof window !== 'undefined' && window.electronAPI) {
      const result = await window.electronAPI.invoke('ui:show-dialog', {
        extensionId: this.extensionId,
        options,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to show dialog');
      }

      return result.data;
    }

    throw new Error('UI API is only available in Electron environment');
  }

  /**
   * Status Bar Item 생성
   */
  createStatusBarItem(options: StatusBarItemOptions): StatusBarItem {
    this.checkPermission('ui.createStatusBarItem');

    const itemId = `${this.extensionId}:${Date.now()}`;
    const item = new StatusBarItemImpl(itemId, options, this.extensionId);
    this.statusBarItems.set(itemId, item);

    return item;
  }

  /**
   * Quick Pick 표시
   */
  async showQuickPick<T>(
    items: QuickPickItem<T>[],
    options?: QuickPickOptions
  ): Promise<T | undefined> {
    this.checkPermission('ui.showQuickPick');

    if (typeof window !== 'undefined' && window.electronAPI) {
      const result = await window.electronAPI.invoke('ui:show-quick-pick', {
        extensionId: this.extensionId,
        items,
        options,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to show quick pick');
      }

      return result.data;
    }

    throw new Error('UI API is only available in Electron environment');
  }

  /**
   * 모든 Status Bar Item 해제
   */
  dispose(): void {
    for (const item of this.statusBarItems.values()) {
      item.dispose();
    }
    this.statusBarItems.clear();
  }
}

/**
 * Status Bar Item 구현
 */
class StatusBarItemImpl implements StatusBarItem {
  private _text: string;
  private _tooltip?: string;
  private _isVisible = false;

  constructor(
    private itemId: string,
    options: StatusBarItemOptions,
    private extensionId: string
  ) {
    this._text = options.text;
    this._tooltip = options.tooltip;

    // IPC를 통해 Status Bar Item 생성
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.invoke('ui:create-status-bar-item', {
        itemId: this.itemId,
        extensionId: this.extensionId,
        options,
      });
    }
  }

  get text(): string {
    return this._text;
  }

  set text(value: string) {
    this._text = value;
    this.update();
  }

  get tooltip(): string | undefined {
    return this._tooltip;
  }

  set tooltip(value: string | undefined) {
    this._tooltip = value;
    this.update();
  }

  show(): void {
    if (!this._isVisible) {
      this._isVisible = true;
      if (typeof window !== 'undefined' && window.electronAPI) {
        window.electronAPI.invoke('ui:show-status-bar-item', { itemId: this.itemId });
      }
    }
  }

  hide(): void {
    if (this._isVisible) {
      this._isVisible = false;
      if (typeof window !== 'undefined' && window.electronAPI) {
        window.electronAPI.invoke('ui:hide-status-bar-item', { itemId: this.itemId });
      }
    }
  }

  dispose(): void {
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.invoke('ui:dispose-status-bar-item', { itemId: this.itemId });
    }
  }

  private update(): void {
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.invoke('ui:update-status-bar-item', {
        itemId: this.itemId,
        text: this._text,
        tooltip: this._tooltip,
      });
    }
  }
}
