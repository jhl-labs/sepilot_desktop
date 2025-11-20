import { ChatState, RAGState, AgentState } from '../types';
import { LLMService } from '@/lib/llm/service';
import { Message } from '@/types';
import { MCPServerManager } from '@/lib/mcp/server-manager';
import { isComfyUIEnabled } from '@/lib/comfyui/client';
import { ToolMessage } from '@langchain/core/messages';

/**
 * LLM 생성 노드 - 기본 Chat용 (스트리밍)
 */
export async function* generateNode(state: ChatState): AsyncGenerator<Partial<ChatState>> {
  try {
    // 컨텍스트가 있으면 시스템 메시지에 추가
    const messages = state.context
      ? [
          {
            id: 'system',
            role: 'system' as const,
            content: `다음 컨텍스트를 참고하여 답변하세요:\n\n${state.context}`,
            created_at: Date.now(),
          },
          ...state.messages,
        ]
      : state.messages;

    // LLM 호출 (스트리밍)
    let accumulatedContent = '';

    for await (const chunk of LLMService.streamChat(messages)) {
      accumulatedContent += chunk;

      const assistantMessage: Message = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: accumulatedContent,
        created_at: Date.now(),
      };

      yield {
        messages: [assistantMessage],
      };
    }

    // 최종 메시지 반환 (누적된 전체 내용)
    const finalMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: accumulatedContent,
      created_at: Date.now(),
    };

    yield {
      messages: [finalMessage],
    };
  } catch (error: any) {
    console.error('Generate node error:', error);

    const errorMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: `Error: ${error.message || 'Failed to generate response'}`,
      created_at: Date.now(),
    };

    yield {
      messages: [errorMessage],
    };
  }
}

/**
 * LLM 생성 노드 - RAG용 (문서 컨텍스트 포함, 스트리밍)
 */
export async function* generateWithContextNode(state: RAGState): AsyncGenerator<Partial<RAGState>> {
  try {
    // 검색된 문서를 컨텍스트로 추가
    const context = state.documents.length > 0
      ? state.documents.map((doc, i) => `[문서 ${i + 1}]\n${doc.content}`).join('\n\n')
      : '';

    const messages = context
      ? [
          {
            id: 'system',
            role: 'system' as const,
            content: `다음 문서들을 참고하여 사용자의 질문에 답변하세요. 답변 시 관련 문서 번호를 명시하세요.\n\n${context}`,
            created_at: Date.now(),
          },
          ...state.messages,
        ]
      : state.messages;

    // LLM 호출 (스트리밍)
    let accumulatedContent = '';

    for await (const chunk of LLMService.streamChat(messages)) {
      accumulatedContent += chunk;

      const assistantMessage: Message = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: accumulatedContent,
        created_at: Date.now(),
      };

      yield {
        messages: [assistantMessage],
        context,
      };
    }

    // 최종 메시지 반환
    const finalMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: accumulatedContent,
      created_at: Date.now(),
    };

    yield {
      messages: [finalMessage],
      context,
    };
  } catch (error: any) {
    console.error('Generate with context node error:', error);

    const errorMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: `Error: ${error.message || 'Failed to generate response'}`,
      created_at: Date.now(),
    };

    yield {
      messages: [errorMessage],
    };
  }
}

/**
 * LLM 생성 노드 - Agent용 (도구 호출 포함)
 */
export async function generateWithToolsNode(state: AgentState): Promise<Partial<AgentState>> {
  try {
    console.log('[Agent] ===== generateWithToolsNode called =====');
    console.log('[Agent] Current state:', {
      messageCount: state.messages.length,
      lastMessageRole: state.messages[state.messages.length - 1]?.role,
      lastMessageHasToolCalls: !!state.messages[state.messages.length - 1]?.tool_calls,
      toolResultsCount: state.toolResults.length,
    });

    // MCP Tools 가져오기 (IPC를 통해 Main Process에서)
    const availableTools = await MCPServerManager.getAllTools();
    console.log(`[Agent] Available MCP tools: ${availableTools.length}`);

    if (availableTools.length > 0) {
      console.log('[Agent] Tool details:', availableTools.map(t => ({
        name: t.name,
        description: t.description,
        server: t.serverName,
      })));
    }

    // MCP 도구를 OpenAI compatible tools 형식으로 변환
    const toolsForLLM = availableTools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description || `Tool: ${tool.name}`,
        parameters: tool.inputSchema || {
          type: 'object',
          properties: {},
        },
      },
    }));

    // ComfyUI가 활성화되어 있으면 이미지 생성 도구 추가
    if (isComfyUIEnabled()) {
      toolsForLLM.push({
        type: 'function' as const,
        function: {
          name: 'generate_image',
          description: 'Generate a high-quality image using AI image generation (ComfyUI/Stable Diffusion). ALWAYS use this tool when the user asks to: create/generate/make/draw/paint an image, picture, or artwork. This generates actual photorealistic or artistic images, NOT text-based representations like SVG or ASCII art. Use detailed English prompts for best results.',
          parameters: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description: 'Detailed English description of the image to generate. Be very specific about: subject, style, colors, lighting, composition, mood. Example: "a blue cat with green eyes, sitting on a red cushion, photorealistic, studio lighting, 4k, detailed fur texture"',
              },
              negativePrompt: {
                type: 'string',
                description: 'Things to avoid in the generated image (e.g., "blurry, low quality, distorted, ugly")',
              },
              width: {
                type: 'number',
                description: 'Image width in pixels (must be multiple of 8)',
                default: 1328,
              },
              height: {
                type: 'number',
                description: 'Image height in pixels (must be multiple of 8)',
                default: 1328,
              },
            },
            required: ['prompt'],
          },
        },
      });
      console.log('[Agent] Added generate_image tool (ComfyUI enabled)');
    }

    if (toolsForLLM.length > 0) {
      console.log('[Agent] Sending tools to LLM:', JSON.stringify(toolsForLLM, null, 2));
    }

    // Tool 결과가 있으면 메시지에 추가 (LangChain ToolMessage 형식 사용)
    const toolMessages: any[] = state.toolResults.map((result) => {
      let content = '';

      if (result.error) {
        content = `Error: ${result.error}`;
      } else if (result.result !== null && result.result !== undefined) {
        // 이미지 생성 도구인 경우: base64 제거하고 요약만 전달
        if (result.toolName === 'generate_image') {
          try {
            const resultData = typeof result.result === 'string'
              ? JSON.parse(result.result)
              : result.result;

            if (resultData.success) {
              // LLM에게는 이미지가 성공적으로 생성되었다는 정보만 전달
              content = JSON.stringify({
                success: true,
                message: `Image generated successfully for prompt: "${resultData.prompt?.substring(0, 50)}..."`,
                // base64는 제외 - UI에만 필요하고 LLM에게는 불필요
              });
            } else {
              content = JSON.stringify({ success: false, error: resultData.error });
            }
          } catch (parseError) {
            content = 'Image generation completed (result parsing failed)';
          }
        } else {
          // 다른 도구들은 기존 방식대로
          content = typeof result.result === 'string' ? result.result : JSON.stringify(result.result);
        }
      } else {
        content = 'No result';
      }

      console.log('[Agent] Creating ToolMessage:', {
        toolCallId: result.toolCallId,
        toolName: result.toolName,
        hasError: !!result.error,
        contentPreview: content.substring(0, 100),
        contentLength: content.length,
      });

      // LangChain의 ToolMessage 사용 (tool_call_id 필수)
      return new ToolMessage({
        content,
        tool_call_id: result.toolCallId,
        name: result.toolName,
        status: result.error ? 'error' : 'success',
      });
    });

    // ToolMessage를 일반 메시지 형식으로 변환
    const convertedToolMessages: Message[] = toolMessages.map((toolMsg: ToolMessage) => ({
      id: `tool-${toolMsg.tool_call_id}`,
      role: 'tool' as const,
      content: typeof toolMsg.content === 'string' ? toolMsg.content : JSON.stringify(toolMsg.content),
      created_at: Date.now(),
      tool_call_id: toolMsg.tool_call_id, // OpenAI API 호환성을 위해 추가
      name: toolMsg.name, // OpenAI API 호환성을 위해 추가
    }));

    const messages = [...state.messages, ...convertedToolMessages];

    console.log('[Agent] Messages to LLM:', messages.map(m => ({
      role: m.role,
      hasContent: !!m.content,
      contentPreview: m.content?.substring(0, 50),
      tool_call_id: (m as any).tool_call_id,
    })));

    // LLM 호출 (tools 포함)
    const response = await LLMService.chat(messages, {
      tools: toolsForLLM.length > 0 ? toolsForLLM : undefined,
    });

    console.log('[Agent] LLM raw response:', response);

    if (!response) {
      throw new Error('LLM returned no response');
    }

    console.log('[Agent] LLM response:', {
      hasContent: !!response.content,
      contentLength: response.content?.length,
      hasToolCalls: !!response.toolCalls,
      toolCallsCount: response.toolCalls?.length,
    });

    // Tool calls 파싱
    const toolCalls = response.toolCalls?.map((tc: any) => {
      console.log('[Agent] Tool call:', {
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      });

      return {
        id: tc.id,
        type: tc.type,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      };
    });

    const assistantMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: response.content || '',
      created_at: Date.now(),
      tool_calls: toolCalls,
    };

    console.log('[Agent] Assistant message created:', {
      hasContent: !!assistantMessage.content,
      hasToolCalls: !!assistantMessage.tool_calls,
      toolCallsCount: assistantMessage.tool_calls?.length,
    });

    return {
      messages: [assistantMessage],
      toolResults: [], // 다음 iteration을 위해 초기화
    };
  } catch (error: any) {
    console.error('Generate with tools node error:', error);

    const errorMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: `Error: ${error.message || 'Failed to generate response'}`,
      created_at: Date.now(),
    };

    return {
      messages: [errorMessage],
    };
  }
}
