import { encoding_for_model, Tiktoken, type TiktokenModel } from 'tiktoken';
import type { Message } from '@/types';

// 인코더 캐시 (모델별로 재사용)
const encoderCache = new Map<string, Tiktoken>();

/**
 * 모델에 맞는 tiktoken 인코더를 가져옵니다.
 * 인코더는 캐시되어 재사용됩니다.
 *
 * @param modelName - LLM 모델 이름 (예: 'gpt-4', 'gpt-3.5-turbo', 'claude-3-opus')
 * @returns Tiktoken 인코더
 */
function getEncoderForModel(modelName: string): Tiktoken {
  // 이미 캐시된 인코더가 있으면 반환
  const cachedEncoder = encoderCache.get(modelName);
  if (cachedEncoder) {
    return cachedEncoder;
  }

  let encoder: Tiktoken;

  try {
    // OpenAI 모델은 직접 인코더 가져오기
    if (modelName.startsWith('gpt-')) {
      // tiktoken이 지원하는 모델인지 확인
      encoder = encoding_for_model(modelName as TiktokenModel);
    } else {
      // 기타 모델(Claude, Ollama 등)은 cl100k_base 인코더 사용
      // cl100k_base는 GPT-4, GPT-3.5-turbo에서 사용하는 인코더
      encoder = encoding_for_model('gpt-4' as TiktokenModel);
    }
  } catch {
    // 지원하지 않는 모델명이면 기본 인코더 사용
    encoder = encoding_for_model('gpt-4' as TiktokenModel);
  }

  // 캐시에 저장
  encoderCache.set(modelName, encoder);
  return encoder;
}

/**
 * 문자열의 토큰 수를 계산합니다.
 *
 * @param text - 토큰을 계산할 텍스트
 * @param modelName - LLM 모델 이름 (기본값: 'gpt-4')
 * @returns 토큰 수
 */
export function countTokens(text: string, modelName: string = 'gpt-4'): number {
  if (!text) {
    return 0;
  }

  try {
    const encoder = getEncoderForModel(modelName);
    const tokens = encoder.encode(text);
    return tokens.length;
  } catch (error) {
    console.error('[TokenCounter] Failed to count tokens:', error);
    // Fallback: 대략적인 추정 (평균 3자당 1토큰)
    return Math.ceil(text.length / 3);
  }
}

/**
 * 메시지 배열의 총 토큰 수를 계산합니다.
 * OpenAI Chat API 형식에 따라 메시지당 오버헤드를 포함합니다.
 *
 * @param messages - 메시지 배열
 * @param modelName - LLM 모델 이름 (기본값: 'gpt-4')
 * @returns 총 토큰 수
 */
export function countMessagesTokens(messages: Message[], modelName: string = 'gpt-4'): number {
  if (!messages || messages.length === 0) {
    return 0;
  }

  try {
    const encoder = getEncoderForModel(modelName);
    let totalTokens = 0;

    // 메시지 형식에 따른 오버헤드
    // OpenAI Chat API는 메시지당 추가 토큰을 사용합니다
    const tokensPerMessage = 3; // <|start|>role<|message|>content<|end|>
    const tokensPerName = 1; // name이 있으면 추가 토큰

    for (const message of messages) {
      totalTokens += tokensPerMessage;

      // role 토큰
      if (message.role) {
        totalTokens += encoder.encode(message.role).length;
      }

      // content 토큰
      if (message.content) {
        totalTokens += encoder.encode(message.content).length;
      }

      // 이미지 첨부가 있으면 추가 토큰 (각 이미지당 약 85~170 토큰)
      if (message.images && message.images.length > 0) {
        totalTokens += message.images.length * 85; // 저해상도 이미지 기준
      }

      // name이 있으면 추가 토큰
      if ('name' in message && message.name) {
        totalTokens += tokensPerName;
      }
    }

    // 프라이머 토큰 (응답 시작을 위한 토큰)
    totalTokens += 3;

    return totalTokens;
  } catch (error) {
    console.error('[TokenCounter] Failed to count messages tokens:', error);
    // Fallback: 대략적인 추정
    const totalChars = messages.reduce((sum, msg) => {
      if (typeof msg.content === 'string') {
        return sum + msg.content.length;
      }
      return sum;
    }, 0);
    return Math.ceil(totalChars / 3);
  }
}

/**
 * 컨텍스트 사용률을 계산합니다.
 *
 * @param messages - 메시지 배열
 * @param input - 현재 입력 텍스트
 * @param modelName - LLM 모델 이름 (기본값: 'gpt-4')
 * @param maxContextTokens - 모델의 최대 컨텍스트 토큰 수 (기본값: 128000)
 * @returns 사용된 토큰 수, 최대 토큰 수, 사용률(%)
 */

/**
 * Common model context limits
 */
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // OpenAI
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4': 8192,
  'gpt-4-turbo': 128000,
  'gpt-4-32k': 32768,
  'gpt-3.5-turbo': 16385,
  'gpt-3.5-turbo-16k': 16385,

  // Anthropic
  'claude-3-opus-20240229': 200000,
  'claude-3-sonnet-20240229': 200000,
  'claude-3-haiku-20240307': 200000,
  'claude-3-5-sonnet-20240620': 200000,
  'claude-2.1': 200000,
  'claude-2.0': 100000,

  // Google
  'gemini-1.5-pro': 2000000, // Up to 2M
  'gemini-1.5-flash': 1000000,
};

/**
 * 컨텍스트 사용률을 계산합니다.
 *
 * @param messages - 메시지 배열
 * @param input - 현재 입력 텍스트
 * @param modelName - LLM 모델 이름 (기본값: 'gpt-4')
 * @param customMaxTokens - (선택) 명시적인 최대 토큰 수. 지정하지 않으면 모델별 기본값 사용
 * @returns 사용된 토큰 수, 최대 토큰 수, 사용률(%)
 */
export function calculateContextUsage(
  messages: Message[],
  input: string = '',
  modelName: string = 'gpt-4',
  customMaxTokens?: number
): {
  used: number;
  max: number;
  percentage: number;
} {
  const messagesTokens = countMessagesTokens(messages, modelName);
  const inputTokens = countTokens(input, modelName);
  const usedTokens = messagesTokens + inputTokens;

  // 모델별 컨텍스트 제한 가져오기 (기본값: GPT-4o 수준인 128k)
  // 정확히 일치하는 모델명이 없으면 가장 근접한 모델(접두사 일치)을 찾거나 기본값 사용
  let maxContext = customMaxTokens;

  if (!maxContext) {
    if (MODEL_CONTEXT_LIMITS[modelName]) {
      maxContext = MODEL_CONTEXT_LIMITS[modelName];
    } else {
      // 접두사 매칭 시도 (e.g. "gpt-4-0613" -> "gpt-4")
      const knownModelKey = Object.keys(MODEL_CONTEXT_LIMITS).find((key) =>
        modelName.startsWith(key)
      );
      maxContext = knownModelKey ? MODEL_CONTEXT_LIMITS[knownModelKey] : 128000;
    }
  }

  return {
    used: usedTokens,
    max: maxContext,
    percentage: Math.min(100, (usedTokens / maxContext) * 100),
  };
}

/**
 * 토큰 수를 읽기 쉬운 형식으로 포맷합니다.
 *
 * @param tokens - 토큰 수
 * @returns 포맷된 문자열 (예: "1.2K", "45K", "128")
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

/**
 * 모든 캐시된 인코더를 해제합니다.
 * 메모리 정리가 필요할 때 사용합니다.
 */
export function clearEncoderCache(): void {
  for (const encoder of encoderCache.values()) {
    encoder.free();
  }
  encoderCache.clear();
}
