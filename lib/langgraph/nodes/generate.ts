import { ChatState, RAGState, AgentState } from '../state';
import { LLMService } from '@/lib/llm/service';
import { Message } from '@/types';
import { MCPServerManager } from '@/lib/mcp/server-manager';
import {
  getCurrentGraphConfig,
  emitStreamingChunk,
  getCurrentImageGenConfig,
} from '@/lib/llm/streaming-callback';

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
    const context =
      state.documents.length > 0
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

    // GraphConfig에서 enableTools 설정 확인
    const graphConfig = getCurrentGraphConfig();
    const toolsEnabled = graphConfig?.enableTools ?? true; // Default to true for backward compatibility

    console.log(`[Agent] Tools enabled in config: ${toolsEnabled}`);

    // MCP 도구 가져오기 (Built-in tools는 Coding Agent에서만 사용)
    // Note: generateWithToolsNode는 Electron Main Process에서 실행되므로
    // IPC가 아닌 직접 메서드를 사용해야 함
    const availableTools = toolsEnabled ? MCPServerManager.getAllToolsInMainProcess() : [];
    console.log(`[Agent] Available MCP tools: ${availableTools.length}`);

    if (availableTools.length > 0) {
      console.log(
        '[Agent] Tool details:',
        availableTools.map((t) => ({
          name: t.name,
          description: t.description,
          server: t.serverName,
        }))
      );
    }

    // MCP 도구를 OpenAI compatible tools 형식으로 변환
    const toolsForLLM = availableTools.map((tool) => ({
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

    // 이미지 생성 도구 추가 (GraphConfig 설정 확인)
    // Note: isComfyUIEnabled()는 Renderer Process에서만 동작하므로,
    // Main Process에서는 GraphConfig를 통해 전달된 값을 사용
    if (toolsEnabled && graphConfig?.enableImageGeneration) {
      toolsForLLM.push({
        type: 'function' as const,
        function: {
          name: 'generate_image',
          description:
            'Generate a high-quality image using AI image generation (ComfyUI/Stable Diffusion/Google Imagen). ALWAYS use this tool when the user asks to: create/generate/make/draw/paint an image, picture, or artwork. This generates actual photorealistic or artistic images, NOT text-based representations like SVG or ASCII art. Use detailed English prompts for best results.',
          parameters: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description:
                  'Detailed English description of the image to generate. Be very specific about: subject, style, colors, lighting, composition, mood. Example: "a blue cat with green eyes, sitting on a red cushion, photorealistic, studio lighting, 4k, detailed fur texture"',
              },
              negativePrompt: {
                type: 'string',
                description:
                  'Things to avoid in the generated image (e.g., "blurry, low quality, distorted, ugly")',
              },
              width: {
                type: 'number',
                description:
                  'Image width in pixels (must be multiple of 8). Only used for ComfyUI.',
                default: 1328,
              },
              height: {
                type: 'number',
                description:
                  'Image height in pixels (must be multiple of 8). Only used for ComfyUI.',
                default: 1328,
              },
              aspectRatio: {
                type: 'string',
                description:
                  'Aspect ratio for the image. Only used for NanoBanana (Google Imagen). Options: "1:1" (square), "16:9" (landscape), "9:16" (portrait), "4:3", "3:4". Default: "1:1"',
                enum: ['1:1', '16:9', '9:16', '4:3', '3:4'],
              },
              numberOfImages: {
                type: 'number',
                description:
                  'Number of images to generate. Only used for NanoBanana (Google Imagen). Fast model: 1-4, Standard model: 1-8. Default: 1',
                minimum: 1,
                maximum: 8,
              },
            },
            required: ['prompt'],
          },
        },
      });
      console.log('[Agent] Added generate_image tool (ImageGen enabled)');
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
            const resultData =
              typeof result.result === 'string' ? JSON.parse(result.result) : result.result;

            if (resultData.success) {
              // LLM에게는 이미지가 성공적으로 생성되었다는 정보만 전달
              const summary: any = {
                success: true,
                message: `Image generated successfully for prompt: "${resultData.prompt?.substring(0, 50)}..."`,
                // base64는 제외 - UI에만 필요하고 LLM에게는 불필요
              };

              // Include usage/credit information if available
              if (resultData.usage) {
                summary.usage = resultData.usage;
                // Add human-readable usage message
                if (resultData.usage.imageCount) {
                  summary.message += ` (${resultData.usage.imageCount} image${resultData.usage.imageCount > 1 ? 's' : ''} generated)`;
                }
                if (resultData.usage.totalTokenCount) {
                  summary.message += ` [Token usage: ${resultData.usage.totalTokenCount}]`;
                }
              }

              content = JSON.stringify(summary);
            } else {
              content = JSON.stringify({ success: false, error: resultData.error });
            }
          } catch {
            content = 'Image generation completed (result parsing failed)';
          }
        } else {
          // 다른 도구들은 기존 방식대로
          content =
            typeof result.result === 'string' ? result.result : JSON.stringify(result.result);
        }
      } else {
        content = 'No result';
      }

      // 긴 결과 제한 (Truncation) - 50000자로 증가하여 더 많은 컨텍스트 제공
      const MAX_TOOL_RESULT_LENGTH = 50000;
      if (content.length > MAX_TOOL_RESULT_LENGTH) {
        content = `${content.substring(
          0,
          MAX_TOOL_RESULT_LENGTH
        )}\n\n... (Result truncated. Total length: ${content.length} chars. The available ${MAX_TOOL_RESULT_LENGTH} characters should be sufficient for analysis. Please work with this information rather than requesting additional searches.)`;
      }

      console.log('[Agent] Creating tool result message:', {
        toolCallId: result.toolCallId,
        toolName: result.toolName,
        hasError: !!result.error,
        contentPreview: content.substring(0, 100),
        contentLength: content.length,
      });

      // Create plain tool message object (OpenAI compatible)
      return {
        content,
        tool_call_id: result.toolCallId,
        name: result.toolName,
        status: result.error ? 'error' : 'success',
      };
    });

    // Convert tool messages to Message format
    const convertedToolMessages: Message[] = toolMessages.map((toolMsg: any) => ({
      id: `tool-${toolMsg.tool_call_id}`,
      role: 'tool' as const,
      content:
        typeof toolMsg.content === 'string' ? toolMsg.content : JSON.stringify(toolMsg.content),
      created_at: Date.now(),
      tool_call_id: toolMsg.tool_call_id, // OpenAI API 호환성을 위해 추가
      name: toolMsg.name, // OpenAI API 호환성을 위해 추가
    }));

    // Add system prompt to guide LLM behavior with tools
    // Check if NanoBanana askOptionsOnGenerate is enabled
    const imageGenConfig = getCurrentImageGenConfig();
    const nanobananaAskOptions =
      imageGenConfig?.provider === 'nanobanana' &&
      imageGenConfig?.nanobanana?.askOptionsOnGenerate === true;

    let systemContent = `You are a helpful assistant with access to tools. Follow these guidelines:
1. Use tools when necessary to answer user questions accurately
2. Avoid redundant or repeated tool calls - one tool call per task is usually sufficient
3. After receiving a tool result, analyze it thoroughly and provide a complete answer
4. Don't call the same tool multiple times with similar parameters unless explicitly needed
5. For search queries, one comprehensive search is typically enough
6. If a tool result is truncated, work with the available information rather than searching again
7. Always prioritize providing a final answer over making additional tool calls`;

    // Add NanoBanana interactive options guidance
    if (nanobananaAskOptions) {
      systemContent += `

**IMPORTANT - Image Generation with NanoBanana (Google Imagen):**
Before calling the generate_image tool, you MUST ask the user for the following options:
- Aspect ratio: "1:1" (square), "16:9" (landscape), "9:16" (portrait), "4:3", or "3:4"
- Number of images: 1-4 for Fast model, 1-8 for Standard model (default: 1)

Present these options clearly and wait for the user's response before generating the image.
Example: "이미지를 생성하기 전에 몇 가지 옵션을 선택해주세요:
1. 화면 비율 (aspect ratio): 1:1 (정사각형), 16:9 (가로형), 9:16 (세로형), 4:3, 3:4
2. 생성할 이미지 개수: 1-4개 (Fast 모델) 또는 1-8개 (Standard 모델)

선택해주세요!"`;
    }

    const systemMessage: Message = {
      id: 'system-tool-guidance',
      role: 'system',
      content: systemContent,
      created_at: Date.now(),
    };

    const messages = [systemMessage, ...state.messages, ...convertedToolMessages];

    console.log(
      '[Agent] Messages to LLM:',
      messages.map((m) => ({
        role: m.role,
        hasContent: !!m.content,
        contentPreview: m.content?.substring(0, 50),
        tool_call_id: (m as any).tool_call_id,
      }))
    );

    // LLM 호출 (스트리밍, tools 포함)
    let accumulatedContent = '';
    let finalToolCalls: any[] | undefined = undefined;

    console.log('[Agent] Starting streaming with tools...');

    for await (const chunk of LLMService.streamChatWithChunks(messages, {
      tools: toolsForLLM.length > 0 ? toolsForLLM : undefined,
    })) {
      // Accumulate content and emit to renderer
      if (!chunk.done && chunk.content) {
        accumulatedContent += chunk.content;
        // Send each chunk to renderer via callback (conversationId로 격리)
        emitStreamingChunk(chunk.content, state.conversationId);
      }

      // Last chunk contains tool calls (if any)
      if (chunk.done && chunk.toolCalls) {
        finalToolCalls = chunk.toolCalls;
        console.log('[Agent] Received tool calls from stream:', finalToolCalls);
      }
    }

    console.log('[Agent] Streaming complete. Content length:', accumulatedContent.length);

    // Tool calls 파싱
    const toolCalls = finalToolCalls?.map((tc: any, index: number) => {
      // LLM이 id를 제공하지 않을 경우 자동 생성
      const toolCallId = tc.id || `call_${Date.now()}_${index}`;

      console.log('[Agent] Tool call:', {
        id: toolCallId,
        originalId: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      });

      return {
        id: toolCallId,
        type: tc.type || 'function',
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      };
    });

    const assistantMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: accumulatedContent || '',
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
