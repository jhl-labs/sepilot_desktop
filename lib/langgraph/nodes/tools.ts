import { AgentState, ToolResult } from '../types';
import { MCPServerManager } from '@/lib/mcp/server-manager';
import { getComfyUIClient } from '@/lib/comfyui/client';

/**
 * 도구 실행 노드
 *
 * MCP를 통한 실제 도구 실행
 */
export async function toolsNode(state: AgentState): Promise<Partial<AgentState>> {
  try {
    const lastMessage = state.messages[state.messages.length - 1];

    if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
      return {};
    }

    console.log('[Tools] Executing tools:', lastMessage.tool_calls.map(c => c.name));

    // 각 도구 호출 실행
    const results: ToolResult[] = await Promise.all(
      lastMessage.tool_calls.map(async (call) => {
        try {
          console.log(`[Tools] Calling tool: ${call.name} with args:`, call.arguments);

          // 이미지 생성 tool 처리 (내장 도구) - MCP로 전달하지 않음
          if (call.name === 'generate_image') {
            const comfyClient = getComfyUIClient();
            if (!comfyClient) {
              return {
                toolCallId: call.id,
                toolName: call.name,
                result: null,
                error: 'ComfyUI is not configured or enabled',
              };
            }

            console.log('[Tools] Generating image with ComfyUI:', call.arguments);
            const args = call.arguments as {
              prompt: string;
              negativePrompt?: string;
              width?: number;
              height?: number;
            };
            const imageResult = await comfyClient.generateImage({
              prompt: args.prompt,
              negativePrompt: args.negativePrompt,
              width: args.width,
              height: args.height,
            });

            if (imageResult.success && imageResult.imageBase64) {
              return {
                toolCallId: call.id,
                toolName: call.name,
                result: JSON.stringify({
                  success: true,
                  imageBase64: imageResult.imageBase64,
                  prompt: call.arguments.prompt,
                }),
              };
            } else {
              return {
                toolCallId: call.id,
                toolName: call.name,
                result: null,
                error: imageResult.error || 'Image generation failed',
              };
            }
          }

          // IPC를 통해 MCP 도구 실행 (generate_image는 이미 위에서 처리했으므로 여기 도달하지 않음)
          // MCPServerManager.callTool은 내부적으로 도구를 찾고 실행함
          const allTools = await MCPServerManager.getAllTools();
          const tool = allTools.find(t => t.name === call.name);

          if (!tool) {
            console.warn(`[Tools] Tool not found: ${call.name}`);
            return {
              toolCallId: call.id,
              toolName: call.name,
              result: null,
              error: `Tool '${call.name}' not found`,
            };
          }

          console.log(`[Tools] Found tool on server: ${tool.serverName}`);

          // MCP를 통해 실제 도구 실행
          const mcpResult = await MCPServerManager.callTool(
            tool.serverName,
            call.name,
            call.arguments
          );

          console.log(`[Tools] MCP Tool result:`, mcpResult);

          // MCP ToolCallResult 형식에서 텍스트 추출
          let resultText = '';

          if (!mcpResult) {
            console.warn(`[Tools] MCP tool returned null/undefined result for ${call.name}`);
            resultText = 'Tool returned no result';
          } else if (mcpResult.content && Array.isArray(mcpResult.content)) {
            // content 배열에서 텍스트 추출
            resultText = mcpResult.content
              .map((item: any) => item.text || '')
              .filter((text: string) => text)
              .join('\n');

            if (!resultText) {
              console.warn(`[Tools] MCP tool content array is empty for ${call.name}`);
              resultText = 'Tool returned empty content';
            }
          } else if (typeof mcpResult === 'string') {
            resultText = mcpResult;
          } else if (typeof mcpResult === 'object') {
            resultText = JSON.stringify(mcpResult);
          } else {
            resultText = String(mcpResult);
          }

          console.log(`[Tools] Extracted result text (${resultText.length} chars):`, resultText.substring(0, 200));

          return {
            toolCallId: call.id,
            toolName: call.name,
            result: resultText,
          };
        } catch (error: any) {
          console.error(`[Tools] Error executing ${call.name}:`, error);
          return {
            toolCallId: call.id,
            toolName: call.name,
            result: null,
            error: error.message || 'Tool execution failed',
          };
        }
      })
    );

    console.log('[Tools] All tool results:', results);

    return {
      toolResults: results,
    };
  } catch (error: any) {
    console.error('Tools node error:', error);
    return {};
  }
}

/**
 * 도구 사용 여부 판단 함수 (조건부 엣지용)
 */
export function shouldUseTool(state: AgentState): string {
  const lastMessage = state.messages[state.messages.length - 1];

  if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    return 'tools';
  }

  return 'end';
}
