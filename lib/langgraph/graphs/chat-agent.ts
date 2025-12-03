import { StateGraph, END } from '@langchain/langgraph';
import { AgentStateAnnotation, AgentState } from '../state';
import { generateWithToolsNode } from '../nodes/generate';
import { toolsNode, shouldUseTool } from '../nodes/tools';
import type { Message } from '@/types';
import type { ToolApprovalCallback } from '../types';
import { emitStreamingChunk } from '@/lib/llm/streaming-callback';

/**
 * Chat Agent 그래프 - MCP Tools와 이미지 생성 도구 지원
 *
 * Built-in Browser Control Tools나 Editor Tools는 사용하지 않음
 * - MCP 서버의 도구들만 사용
 * - ComfyUI 이미지 생성 도구 (enableImageGeneration 플래그로 제어)
 */
export class ChatAgentGraph {
  async invoke(initialState: AgentState, maxIterations = 50): Promise<AgentState> {
    const actualMaxIterations = Math.max(maxIterations, 50);
    let state = { ...initialState };
    let iterations = 0;
    let imageGenerationCompleted = false;

    while (iterations < actualMaxIterations) {
      // 이미지 생성이 완료되고 다음 iteration이면 종료
      if (imageGenerationCompleted && iterations > 0) {
        console.log(
          '[AgentGraph.invoke] Image generation completed and final response generated, ending loop'
        );
        break;
      }

      // 1. generate 노드 실행
      const generateResult = await generateWithToolsNode(state);
      state = {
        ...state,
        messages: [...state.messages, ...(generateResult.messages || [])],
      };

      // 2. 도구 사용 여부 판단
      const decision = shouldUseTool(state);
      if (decision === 'end') {
        break;
      }

      // 3. tools 노드 실행
      const toolsResult = await toolsNode(state);
      state = {
        ...state,
        toolResults: [...state.toolResults, ...(toolsResult.toolResults || [])],
        generatedImages:
          toolsResult.generatedImages !== undefined
            ? [...(state.generatedImages || []), ...(toolsResult.generatedImages || [])]
            : state.generatedImages,
      };

      // 이미지 생성 도구가 성공적으로 실행되었으면 플래그 설정
      const hasSuccessfulImageGeneration = toolsResult.toolResults?.some(
        (result) => result.toolName === 'generate_image' && !result.error
      );
      if (hasSuccessfulImageGeneration) {
        console.log(
          '[AgentGraph.invoke] Image generation completed, will generate final response and end'
        );
        imageGenerationCompleted = true;
      }

      iterations++;
    }

    return state;
  }

  async *stream(
    initialState: AgentState,
    maxIterations = 50,
    toolApprovalCallback?: ToolApprovalCallback
  ): AsyncGenerator<any> {
    // Force minimum 50 iterations to prevent premature stopping
    const actualMaxIterations = Math.max(maxIterations, 50);
    let state = { ...initialState };
    let iterations = 0;

    console.log(
      `[AgentGraph] Starting stream with initial state (Max iterations: ${actualMaxIterations})`
    );
    console.log(
      '[AgentGraph] Tool approval callback:',
      toolApprovalCallback ? 'provided' : 'not provided'
    );

    let hasError = false;
    let errorMessage = '';

    // Track tool usage count to detect repetitive behavior
    const toolUsageCount = new Map<string, number>();
    let previousToolNames: string[] = [];
    let imageGenerationCompleted = false; // Track if image generation is done

    while (iterations < actualMaxIterations) {
      console.log(`[AgentGraph] ===== Iteration ${iterations + 1}/${actualMaxIterations} =====`);
      console.log('[AgentGraph] Current state before generate:', {
        messageCount: state.messages.length,
        lastMessageRole: state.messages[state.messages.length - 1]?.role,
        toolResultsCount: state.toolResults.length,
        imageGenerationCompleted,
      });

      // 이미지 생성이 완료되고 다음 iteration이면 종료
      if (imageGenerationCompleted && iterations > 0) {
        console.log(
          '[AgentGraph] Image generation completed and final response generated, ending loop'
        );
        break;
      }

      // 1. generate with tools (non-streaming for now)
      // TODO: Implement proper streaming with tool calls support
      let generateResult;
      try {
        console.log('[AgentGraph] Calling generateWithToolsNode...');
        generateResult = await generateWithToolsNode(state);
        console.log('[AgentGraph] generateWithToolsNode completed');
      } catch (error: any) {
        console.error('[AgentGraph] Generate node error:', error);
        console.error('[AgentGraph] Error stack:', error.stack);
        hasError = true;
        errorMessage = error.message || 'Failed to generate response';
        break; // Exit loop on error
      }

      if (generateResult.messages && generateResult.messages.length > 0) {
        const newMessage = generateResult.messages[0];

        console.log('[AgentGraph] Generated message:', {
          content: newMessage.content?.substring(0, 100),
          hasToolCalls: !!newMessage.tool_calls,
          toolCallsCount: newMessage.tool_calls?.length,
        });

        state = {
          ...state,
          messages: [...state.messages, newMessage],
          toolResults: generateResult.toolResults || state.toolResults,
          generatedImages:
            generateResult.generatedImages !== undefined
              ? generateResult.generatedImages
              : state.generatedImages,
        };

        // Yield the message
        yield {
          generate: {
            messages: [newMessage],
          },
        };
      }

      // 2. 도구 사용 여부 판단
      const decision = shouldUseTool(state);
      console.log('[AgentGraph] Decision:', decision);

      if (decision === 'end') {
        console.log('[AgentGraph] Ending - no more tools to call');
        break;
      }

      // 3. Human-in-the-loop: Tool approval
      const lastMessage = state.messages[state.messages.length - 1];
      if (toolApprovalCallback && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
        console.log(
          '[AgentGraph] Requesting tool approval for:',
          lastMessage.tool_calls.map((tc) => tc.name)
        );

        // Yield tool approval request event
        yield {
          type: 'tool_approval_request',
          messageId: lastMessage.id,
          toolCalls: lastMessage.tool_calls,
        };

        try {
          // Wait for user approval
          const approved = await toolApprovalCallback(lastMessage.tool_calls);

          // Yield approval result
          yield {
            type: 'tool_approval_result',
            approved,
          };

          if (!approved) {
            console.log('[AgentGraph] Tools rejected by user');
            // Add a message indicating tools were rejected
            const rejectionMessage: Message = {
              id: `msg-${Date.now()}`,
              role: 'assistant',
              content: '도구 실행이 사용자에 의해 거부되었습니다.',
              created_at: Date.now(),
            };
            state = {
              ...state,
              messages: [...state.messages, rejectionMessage],
            };
            yield {
              generate: {
                messages: [rejectionMessage],
              },
            };
            break; // End the loop
          }

          console.log('[AgentGraph] Tools approved by user');
        } catch (approvalError: any) {
          console.error('[AgentGraph] Tool approval error:', approvalError);
          hasError = true;
          errorMessage = approvalError.message || 'Tool approval failed';
          break;
        }
      }

      // 4. tools 노드 실행
      console.log('[AgentGraph] Executing tools node');

      // Log tool execution start (Detailed)
      if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
        let logMessage = `\n\n---\n🔄 **Iteration ${iterations + 1}/${actualMaxIterations}**\n`;

        for (const toolCall of lastMessage.tool_calls) {
          logMessage += `\n🛠️ **Call:** \`${toolCall.name}\`\n`;
          try {
            const args =
              typeof toolCall.arguments === 'string'
                ? toolCall.arguments
                : JSON.stringify(toolCall.arguments, null, 2);
            logMessage += `📂 **Args:**\n\`\`\`json\n${args}\n\`\`\`\n`;
          } catch {
            logMessage += `📂 **Args:** (parsing failed)\n`;
          }
        }
        emitStreamingChunk(logMessage, state.conversationId);
      }

      const toolsResult = await toolsNode(state);

      // Log tool execution end (Detailed)
      if (toolsResult.toolResults && toolsResult.toolResults.length > 0) {
        let logMessage = `\n<small>\n`;

        for (const result of toolsResult.toolResults) {
          const status = result.error ? '❌ Error' : '✅ Result';
          logMessage += `${status}: \`${result.toolName}\`\n\n`;

          let output = result.error || result.result || '(no output)';
          if (typeof output !== 'string') {
            output = JSON.stringify(output, null, 2);
          }

          // Shorten output for better UX (300 chars instead of 1000)
          if (output.length > 300) {
            output = `${output.substring(0, 300)}\n... (output truncated for readability)`;
          }

          // Use inline code instead of code block for shorter output
          if (output.length < 100 && !output.includes('\n')) {
            logMessage += `📄 Output: \`${output}\`\n\n`;
          } else {
            logMessage += `📄 Output:\n\`\`\`\n${output}\n\`\`\`\n\n`;
          }
        }
        logMessage += `</small>`;
        emitStreamingChunk(`${logMessage}---\n\n`, state.conversationId);
      }

      // tool_calls를 유지하여 히스토리 무결성 보장 (이전에는 삭제했었음)
      // LLM은 tool_calls가 있는 메시지 뒤에 tool 메시지가 오기를 기대함

      state = {
        ...state,
        messages: state.messages, // 메시지 변경 없음 (tool_calls 유지)
        toolResults: toolsResult.toolResults || [],
        generatedImages:
          toolsResult.generatedImages !== undefined
            ? [...(state.generatedImages || []), ...(toolsResult.generatedImages || [])]
            : state.generatedImages,
      };

      console.log('[AgentGraph] Tool results:', toolsResult.toolResults);
      console.log('[AgentGraph] Generated images in toolsResult:', toolsResult.generatedImages);
      console.log('[AgentGraph] State generatedImages after merge:', {
        count: state.generatedImages?.length || 0,
        images: state.generatedImages?.map((img) => ({
          id: img.id,
          base64Length: img.base64?.length || 0,
        })),
      });

      yield { tools: toolsResult };

      // 이미지 생성 도구가 성공적으로 실행되었는지 체크
      const hasSuccessfulImageGeneration = toolsResult.toolResults?.some(
        (result) => result.toolName === 'generate_image' && !result.error
      );

      // Track tool usage and check for excessive repetition
      if (toolsResult.toolResults && toolsResult.toolResults.length > 0) {
        const currentToolNames = toolsResult.toolResults.map((r) => r.toolName);

        // Check for consecutive duplicate tool calls
        if (iterations > 0 && previousToolNames.length > 0) {
          const duplicates = currentToolNames.filter((name) => previousToolNames.includes(name));
          if (duplicates.length > 0 && duplicates.length === currentToolNames.length) {
            console.warn(
              `[AgentGraph] ⚠️ Detected consecutive duplicate tool calls: ${duplicates.join(', ')}`
            );
            emitStreamingChunk(
              `\n\n⚠️ **중복 감지**: 이전 iteration과 동일한 도구(${duplicates.join(', ')})가 연속으로 호출되었습니다.\n\n`,
              state.conversationId
            );
          }
        }

        // Update previous tool names for next iteration
        previousToolNames = currentToolNames;

        // Track cumulative usage count
        for (const result of toolsResult.toolResults) {
          const currentCount = toolUsageCount.get(result.toolName) || 0;
          const newCount = currentCount + 1;
          toolUsageCount.set(result.toolName, newCount);

          console.log(`[AgentGraph] Tool usage: ${result.toolName} = ${newCount} times`);

          // Warning if same tool used more than 3 times
          if (newCount >= 3) {
            console.warn(
              `[AgentGraph] ⚠️ Tool "${result.toolName}" has been called ${newCount} times. This may indicate repetitive behavior.`
            );
            emitStreamingChunk(
              `\n\n⚠️ **경고**: \`${result.toolName}\` 도구가 ${newCount}번 호출되었습니다. 반복적인 동작이 감지되었습니다.\n\n`,
              state.conversationId
            );

            // Stop if same tool called 5+ times
            if (newCount >= 5) {
              console.error(
                `[AgentGraph] 🛑 Tool "${result.toolName}" called ${newCount} times. Stopping to prevent infinite loop.`
              );
              emitStreamingChunk(
                `\n\n🛑 **중단**: \`${result.toolName}\` 도구가 ${newCount}번 호출되어 무한 루프를 방지하기 위해 작업을 중단합니다.\n\n`,
                state.conversationId
              );
              iterations = actualMaxIterations; // Force exit
              break;
            }
          }
        }
      }

      iterations++;

      // 이미지 생성 도구가 성공적으로 실행되었으면 플래그 설정
      // (다음 iteration에서 이미지를 포함한 최종 응답을 생성한 후 종료)
      if (hasSuccessfulImageGeneration) {
        console.log(
          '[AgentGraph] Image generation completed, will generate final response and end'
        );
        imageGenerationCompleted = true;
      }
    }

    console.log('[AgentGraph] Stream completed, total iterations:', iterations);

    // Reporter node
    if (hasError) {
      const errorReportMessage: Message = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `❌ 작업 중 오류가 발생했습니다: ${errorMessage}`,
        created_at: Date.now(),
      };
      yield {
        reporter: {
          messages: [errorReportMessage],
        },
      };
    } else if (iterations >= actualMaxIterations) {
      console.log('[AgentGraph] Max iterations reached, requesting summary from LLM...');

      // Add summary request system message
      const summarySystemMessage: Message = {
        id: `system-summary-${Date.now()}`,
        role: 'system',
        content: `최대 반복 횟수(${actualMaxIterations})에 도달하여 작업을 중단합니다.
지금까지 수행한 도구 실행 결과와 내용을 바탕으로, 현재까지의 진행 상황을 요약하고 완료된 부분과 남은 작업을 명확히 정리해서 답변하세요.
마지막에는 사용자가 이어서 작업을 요청할 수 있도록 안내하세요.`,
        created_at: Date.now(),
      };

      // Update state
      state = {
        ...state,
        messages: [...state.messages, summarySystemMessage],
      };

      // Generate summary using the same node (will stream automatically)
      try {
        const generateResult = await generateWithToolsNode(state);
        if (generateResult.messages && generateResult.messages.length > 0) {
          yield {
            generate: {
              messages: generateResult.messages,
            },
          };
        }
      } catch (summaryError: any) {
        console.error('[AgentGraph] Summary generation failed:', summaryError);
        // Fallback message
        const fallbackMessage: Message = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ 최대 반복 횟수(${actualMaxIterations})에 도달했습니다. 작업이 복잡하여 완료하지 못했을 수 있습니다. (요약 생성 실패)`,
          created_at: Date.now(),
        };
        yield {
          reporter: {
            messages: [fallbackMessage],
          },
        };
      }
    } else {
      // Normal completion - yield completion event to clear UI loading state
      yield {
        type: 'completion',
        iterations,
      };
    }
  }
}

export function createChatAgentGraph() {
  // StateGraph 생성
  const workflow = new StateGraph(AgentStateAnnotation)
    // 노드 추가
    .addNode('generate', generateWithToolsNode)
    .addNode('tools', toolsNode)
    // 엔트리 포인트 설정
    .addEdge('__start__', 'generate')
    // 조건부 엣지: generate 후 도구 사용 여부 결정
    .addConditionalEdges('generate', shouldUseTool, {
      tools: 'tools',
      end: END,
    })
    // tools 실행 후 다시 generate로 (순환)
    .addEdge('tools', 'generate');

  // 컴파일된 그래프 반환
  return workflow.compile();
}
