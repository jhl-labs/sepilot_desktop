/**
 * Terminal Tool: explain_error
 *
 * LLM을 사용하여 에러 메시지를 분석하고 해결책을 제안합니다.
 */

import { logger } from '@/lib/utils/logger';
import { LLMService } from '@/lib/llm/service';
import type { Message } from '@/types';

/**
 * explain_error Tool 정의
 */
export const explainErrorTool = {
  name: 'explain_error',
  description: 'Analyze error messages and suggest solutions',
  inputSchema: {
    type: 'object' as const,
    properties: {
      errorMessage: {
        type: 'string',
        description: 'The error message to analyze',
      },
      command: {
        type: 'string',
        description: 'The command that caused the error',
      },
      exitCode: {
        type: 'number',
        description: 'Exit code of the command',
      },
      cwd: {
        type: 'string',
        description: 'Working directory where command was executed',
      },
    },
    required: ['errorMessage', 'command'],
  },
};

/**
 * explain_error Tool 실행 함수
 */
export async function executeExplainError(args: {
  errorMessage: string;
  command: string;
  exitCode?: number;
  cwd?: string;
}): Promise<{
  success: boolean;
  analysis?: {
    cause: string;
    solutions: string[];
    summary: string;
  };
  error?: string;
}> {
  const { errorMessage, command, exitCode, cwd } = args;

  logger.info('[explain_error] Analyzing error for command:', command);

  try {
    // LLM에게 에러 분석 요청
    const systemPrompt = `You are an expert system administrator and developer. Analyze terminal command errors and provide clear, actionable solutions.

Your response should be in JSON format with the following structure:
{
  "cause": "Brief explanation of why the error occurred",
  "solutions": ["Solution 1", "Solution 2", "Solution 3"],
  "summary": "One-sentence summary of the issue"
}`;

    const userPrompt = `Analyze this terminal error:

Command: ${command}
Exit Code: ${exitCode || 'unknown'}
Working Directory: ${cwd || 'unknown'}
Error Message:
${errorMessage}

Provide your analysis in JSON format.`;

    const messages: Message[] = [
      {
        id: 'system',
        role: 'system',
        content: systemPrompt,
        created_at: Date.now(),
      },
      {
        id: 'user',
        role: 'user',
        content: userPrompt,
        created_at: Date.now(),
      },
    ];

    // LLM 호출 (non-streaming)
    const response = await LLMService.chat(messages, {
      temperature: 0.3, // 낮은 temperature로 일관성 있는 응답
      maxTokens: 500,
    });

    // JSON 파싱
    let analysis;
    try {
      // Markdown code block 제거
      const content = response.content.replace(/```json\n?|\n?```/g, '').trim();
      analysis = JSON.parse(content);
    } catch (parseError) {
      // JSON 파싱 실패 시 텍스트로 처리
      logger.warn('[explain_error] Failed to parse JSON, using text response');
      analysis = {
        cause: 'Error analysis',
        solutions: [response.content],
        summary: response.content.substring(0, 100),
      };
    }

    logger.info('[explain_error] Analysis completed');

    return {
      success: true,
      analysis,
    };
  } catch (error: any) {
    logger.error('[explain_error] Failed to analyze error:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}
