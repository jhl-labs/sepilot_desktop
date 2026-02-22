/**
 * VectorDB Access IPC 프록시 구현
 *
 * Extension이 ExtensionRuntimeContext.vectorDB API를 통해 Vector DB에 접근하기 위한 프록시 클래스.
 * IPC를 통해 Main Process의 extension-vectordb.ts 핸들러와 통신합니다.
 */

import type {
  VectorDBAccess,
  VectorSearchOptions,
  VectorSearchResult,
  VectorDocument,
} from '@sepilot/extension-sdk';

export class VectorDBAccessImpl implements VectorDBAccess {
  constructor(
    private extensionId: string,
    private permissions: string[]
  ) {}

  /**
   * 유사 문서 검색
   */
  async search(query: string, options?: VectorSearchOptions): Promise<VectorSearchResult[]> {
    this.checkPermission('vectordb:search');

    if (typeof window === 'undefined' || !window.electronAPI) {
      throw new Error('VectorDB API is only available in Electron environment');
    }

    const result = await window.electronAPI.invoke('extension:vectordb:search', {
      extensionId: this.extensionId,
      query,
      options: {
        topK: options?.limit,
        threshold: options?.threshold,
        collection: options?.filter?.collection as string | undefined,
      },
    });

    if (!result.success) {
      throw new Error(result.error || 'VectorDB search failed');
    }

    return result.data ?? [];
  }

  /**
   * 문서 추가
   */
  async add(documents: VectorDocument[]): Promise<void> {
    this.checkPermission('vectordb:insert');

    if (typeof window === 'undefined' || !window.electronAPI) {
      throw new Error('VectorDB API is only available in Electron environment');
    }

    const result = await window.electronAPI.invoke('extension:vectordb:insert', {
      extensionId: this.extensionId,
      documents,
    });

    if (!result.success) {
      throw new Error(result.error || 'VectorDB insert failed');
    }
  }

  /**
   * 문서 추가 (insert 별칭)
   */
  async insert(documents: VectorDocument[]): Promise<void> {
    return this.add(documents);
  }

  /**
   * 문서 삭제
   */
  async delete(ids: string[]): Promise<void> {
    this.checkPermission('vectordb:delete');

    if (typeof window === 'undefined' || !window.electronAPI) {
      throw new Error('VectorDB API is only available in Electron environment');
    }

    const result = await window.electronAPI.invoke('extension:vectordb:delete', {
      extensionId: this.extensionId,
      ids,
    });

    if (!result.success) {
      throw new Error(result.error || 'VectorDB delete failed');
    }
  }

  private checkPermission(permission: string): void {
    if (this.permissions.length > 0 && !this.permissions.includes(permission)) {
      throw new Error(`Extension "${this.extensionId}" does not have permission: ${permission}`);
    }
  }
}
