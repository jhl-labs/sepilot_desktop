/**
 * LLM Provider IPC 프록시 구현
 *
 * Extension이 ExtensionRuntimeContext.llm API를 통해 LLM 기능에 접근하기 위한 프록시 클래스.
 * IPC를 통해 Main Process의 extension-llm.ts 핸들러와 통신합니다.
 *
 * 스트리밍 모드:
 * - Main Process에서 event.sender.send()로 청크를 전송
 * - preload의 generic on()이 동적 채널을 지원하지 않으므로,
 *   현재는 invoke 결과의 전체 응답을 단일 청크로 yield하는 fallback 사용
 * - 추후 preload에 동적 채널 지원 추가 시 실시간 스트리밍 가능
 */

import type { LLMProvider, Message, LLMChatOptions, LLMChatResponse } from '@sepilot/extension-sdk';

export class LLMProviderImpl implements LLMProvider {
  constructor(
    private extensionId: string,
    private permissions: string[]
  ) {}

  /**
   * LLM 채팅 (전체 응답 반환)
   */
  async chat(messages: Message[], options?: LLMChatOptions): Promise<LLMChatResponse> {
    this.checkPermission('llm:chat');

    if (typeof window === 'undefined' || !window.electronAPI) {
      throw new Error('LLM API is only available in Electron environment');
    }

    const result = await window.electronAPI.invoke('extension:llm:chat', {
      extensionId: this.extensionId,
      messages,
      options,
    });

    if (!result.success) {
      throw new Error(result.error || 'LLM chat failed');
    }

    return result.data as LLMChatResponse;
  }

  /**
   * LLM 스트리밍 채팅 (AsyncGenerator)
   *
   * 현재 구현: Main Process에서 스트리밍 처리 후 전체 응답을 invoke 결과로 반환.
   * invoke 결과를 단일 청크로 yield합니다.
   * 추후 preload에 동적 이벤트 채널 지원 추가 시 실시간 청크 스트리밍으로 전환 가능.
   */
  async *stream(messages: Message[], options?: LLMChatOptions): AsyncIterable<string> {
    this.checkPermission('llm:stream');

    if (typeof window === 'undefined' || !window.electronAPI) {
      throw new Error('LLM API is only available in Electron environment');
    }

    const streamChannel = `extension-llm-stream-${this.extensionId}-${Date.now()}`;

    // invoke로 스트리밍 시작 — Main Process가 내부에서 스트리밍 처리 후 전체 응답 반환
    const result = await window.electronAPI.invoke('extension:llm:stream', {
      extensionId: this.extensionId,
      messages,
      options,
      streamChannel,
    });

    if (!result.success) {
      throw new Error(result.error || 'LLM stream failed');
    }

    // 전체 응답을 단일 청크로 yield (문자열로 변환)
    if (result.data) {
      const content =
        typeof result.data === 'string' ? result.data : (result.data as LLMChatResponse).content;
      yield content;
    }
  }

  private checkPermission(permission: string): void {
    if (this.permissions.length > 0 && !this.permissions.includes(permission)) {
      throw new Error(`Extension "${this.extensionId}" does not have permission: ${permission}`);
    }
  }
}
