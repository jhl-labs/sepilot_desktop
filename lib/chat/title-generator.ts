import { Message } from '@/types';
import { getLLMClient } from '@/lib/llm/client';

/**
 * 대화 제목 자동 생성
 *
 * 첫 몇 개의 메시지를 기반으로 LLM에게 간결한 제목을 요청합니다.
 */
export async function generateConversationTitle(
  messages: Array<Pick<Message, 'role' | 'content'>>
): Promise<string> {
  try {
    // 첫 2-3개 메시지만 사용 (너무 많으면 비효율적)
    const contextMessages = messages.slice(0, 3);

    // 제목 생성을 위한 프롬프트
    const titlePrompt: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      {
        role: 'system',
        content: `You are a helpful assistant that generates concise, descriptive titles for conversations.
Generate a short title (max 5-7 words) that captures the main topic of the conversation.
Return ONLY the title, without quotes or additional text.`,
      },
      {
        role: 'user',
        content: `Based on this conversation, generate a concise title:\n\n${contextMessages
          .map((m) => `${m.role}: ${m.content}`)
          .join('\n\n')}`,
      },
    ];

    const client = getLLMClient();
    const provider = client.getProvider();

    // LLM 호출
    let generatedTitle = '';
    for await (const chunk of provider.stream(titlePrompt as any)) {
      if (chunk.content) {
        generatedTitle += chunk.content;
      }
    }

    // 제목 정제 (따옴표 제거, 길이 제한 등)
    generatedTitle = generatedTitle
      .trim()
      .replace(/^["']|["']$/g, '') // 시작/끝의 따옴표 제거
      .replace(/\n/g, ' ') // 개행 제거
      .slice(0, 100); // 최대 100자

    // 생성된 제목이 너무 짧거나 비어있으면 기본값 사용
    if (!generatedTitle || generatedTitle.length < 3) {
      return generateFallbackTitle(messages);
    }

    return generatedTitle;
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
