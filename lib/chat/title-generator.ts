import { Message } from '@/types';

/**
 * 대화 제목 자동 생성
 *
 * 첫 몇 개의 메시지를 기반으로 LLM에게 간결한 제목을 요청합니다.
 * Electron IPC를 통해 Main Process에서 실행하여 CORS 문제를 회피합니다.
 */
export async function generateConversationTitle(
  messages: Array<Pick<Message, 'role' | 'content'>>
): Promise<string> {
  try {
    // 첫 2-3개 메시지만 사용 (너무 많으면 비효율적)
    const contextMessages = messages.slice(0, 3);

    // Electron 환경인 경우 IPC를 통해 Main Process에서 제목 생성
    if (typeof window !== 'undefined' && window.electronAPI?.llm?.generateTitle) {
      const result = await window.electronAPI.llm.generateTitle(contextMessages);

      if (result.success && result.data?.title) {
        const generatedTitle = result.data.title.trim();
        // 생성된 제목이 너무 짧거나 비어있으면 기본값 사용
        if (generatedTitle && generatedTitle.length >= 3) {
          return generatedTitle;
        }
      }

      // IPC 호출 실패 시 fallback
      console.warn('IPC title generation failed, using fallback');
      return generateFallbackTitle(messages);
    }

    // 브라우저 환경에서는 fallback 사용 (CORS 문제 회피)
    console.warn('Not in Electron environment, using fallback title generation');
    return generateFallbackTitle(messages);
  } catch (error) {
    console.error('Failed to generate conversation title:', error);
    return generateFallbackTitle(messages);
  }
}

/**
 * Fallback 제목 생성
 *
 * LLM 호출 실패 시 첫 메시지 내용을 기반으로 간단한 제목 생성
 */
function generateFallbackTitle(messages: Array<Pick<Message, 'role' | 'content'>>): string {
  const firstUserMessage = messages.find((m) => m.role === 'user');

  if (!firstUserMessage) {
    return '새 대화';
  }

  // 첫 사용자 메시지의 처음 50자를 제목으로 사용
  let title = firstUserMessage.content.slice(0, 50).trim();

  // 문장이 중간에 끊긴 경우 마지막 단어 제거
  if (firstUserMessage.content.length > 50) {
    const lastSpaceIndex = title.lastIndexOf(' ');
    if (lastSpaceIndex > 0) {
      title = title.slice(0, lastSpaceIndex);
    }
    title += '...';
  }

  return title || '새 대화';
}

/**
 * 제목이 자동 생성이 필요한지 확인
 */
export function shouldGenerateTitle(currentTitle: string): boolean {
  // 기본 제목이거나 비어있으면 생성 필요
  const defaultTitles = ['새 대화', 'New Conversation', ''];
  return defaultTitles.includes(currentTitle.trim());
}
