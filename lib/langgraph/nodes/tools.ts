import { AgentState } from '../state';
import { ToolResult } from '../types';
import { MCPServerManager } from '@/lib/mcp/server-manager';
import { executeBuiltinTool } from '@/lib/mcp/tools/builtin-tools';
import { generateId } from '@/lib/utils/id-generator';
import {
  emitImageProgress,
  getCurrentNetworkConfig,
  getCurrentImageGenConfig,
  isAborted,
} from '@/lib/llm/streaming-callback';
import type { ComfyUIConfig, NetworkConfig } from '@/types';
import { generateWithNanoBanana } from '@/lib/imagegen/nanobanana-client';
import { httpPost, httpFetch, createWebSocket } from '@/lib/http';

import { logger } from '@/lib/utils/logger';
/**
 * Main Process에서 ComfyUI를 통한 이미지 생성
 * Renderer Process의 ComfyUIClient와 유사하지만 Main Process에서 직접 실행
 */
async function generateImageInMainProcess(
  config: ComfyUIConfig,
  networkConfig: NetworkConfig | null,
  args: {
    prompt: string;
    negativePrompt?: string;
    width?: number;
    height?: number;
  },
  conversationId?: string
): Promise<{ success: boolean; imageBase64?: string; error?: string }> {
  const clientId = generateId('sepilot-main');

  try {
    // Build workflow
    const seedValue =
      config.seed && config.seed >= 0 ? config.seed : Math.floor(Math.random() * 4294967295);

    const workflow = {
      '60': {
        inputs: { filename_prefix: 'sepilot_qwen', images: ['75:8', 0] },
        class_type: 'SaveImage',
        _meta: { title: '이미지 저장' },
      },
      '75:58': {
        inputs: { width: 512, height: 512, batch_size: 1 },
        class_type: 'EmptySD3LatentImage',
        _meta: { title: '빈 잠재 이미지 (SD3)' },
      },
      '75:7': {
        inputs: { text: args.negativePrompt || config.negativePrompt || '', clip: ['75:38', 0] },
        class_type: 'CLIPTextEncode',
        _meta: { title: 'CLIP Text Encode (Negative Prompt)' },
      },
      '75:66': {
        inputs: { shift: 3.1, model: ['75:73', 0] },
        class_type: 'ModelSamplingAuraFlow',
        _meta: { title: '모델 샘플링 (AuraFlow)' },
      },
      '75:8': {
        inputs: { samples: ['75:3', 0], vae: ['75:39', 0] },
        class_type: 'VAEDecode',
        _meta: { title: 'VAE 디코드' },
      },
      '75:37': {
        inputs: { unet_name: 'qwen_image_fp8_e4m3fn.safetensors', weight_dtype: 'default' },
        class_type: 'UNETLoader',
        _meta: { title: '확산 모델 로드' },
      },
      '75:6': {
        inputs: { text: args.prompt, clip: ['75:38', 0] },
        class_type: 'CLIPTextEncode',
        _meta: { title: 'CLIP Text Encode (Positive Prompt)' },
      },
      '75:38': {
        inputs: {
          clip_name: 'qwen_2.5_vl_7b_fp8_scaled.safetensors',
          type: 'qwen_image',
          device: 'default',
        },
        class_type: 'CLIPLoader',
        _meta: { title: 'CLIP 로드' },
      },
      '75:39': {
        inputs: { vae_name: 'qwen_image_vae.safetensors' },
        class_type: 'VAELoader',
        _meta: { title: 'VAE 로드' },
      },
      '75:3': {
        inputs: {
          seed: seedValue,
          steps: config.steps || 4,
          cfg: config.cfgScale || 1,
          sampler_name: 'euler',
          scheduler: 'simple',
          denoise: 1,
          model: ['75:66', 0],
          positive: ['75:6', 0],
          negative: ['75:7', 0],
          latent_image: ['75:58', 0],
        },
        class_type: 'KSampler',
        _meta: { title: 'KSampler' },
      },
      '75:73': {
        inputs: {
          lora_name: 'Qwen-Image-Lightning-4steps-V1.0.safetensors',
          strength_model: 1,
          model: ['75:37', 0],
        },
        class_type: 'LoraLoaderModelOnly',
        _meta: { title: 'LoRA 로드 (모델 전용)' },
      },
    };

    // Prepare headers
    const normalizedUrl = config.httpUrl.replace(/\/$/, '');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }
    if (networkConfig?.customHeaders) {
      Object.entries(networkConfig.customHeaders).forEach(([key, value]) => {
        headers[key] = value;
      });
    }

    // Queue prompt
    emitImageProgress(
      { status: 'executing', message: '🎨 이미지 생성 요청을 전송 중...', progress: 10 },
      conversationId
    );

    const queueResponse = await httpPost(
      `${normalizedUrl}/prompt`,
      { prompt: workflow, client_id: clientId },
      { headers, networkConfig: networkConfig ?? undefined }
    );

    if (!queueResponse.ok) {
      const errorText = await queueResponse.text();
      throw new Error(`Failed to queue prompt: ${queueResponse.status} ${errorText}`);
    }

    const queueResult = await queueResponse.json();
    const promptId = queueResult.prompt_id;

    emitImageProgress(
      { status: 'executing', message: '🖼️ 이미지를 생성하고 있습니다...', progress: 20 },
      conversationId
    );

    // Wait for completion via WebSocket
    const imageData = await waitForCompletionInMainProcess(
      config.wsUrl,
      clientId,
      promptId,
      normalizedUrl,
      headers,
      config.steps || 4,
      networkConfig,
      conversationId
    );

    emitImageProgress(
      { status: 'completed', message: '✅ 이미지 생성 완료!', progress: 100 },
      conversationId
    );

    return { success: true, imageBase64: imageData };
  } catch (error: any) {
    console.error('[Tools] ComfyUI generation error:', error);
    emitImageProgress(
      { status: 'error', message: `❌ 이미지 생성 실패: ${error.message}`, progress: 0 },
      conversationId
    );
    return { success: false, error: error.message };
  }
}

/**
 * WebSocket으로 이미지 생성 완료 대기 (Main Process)
 */
async function waitForCompletionInMainProcess(
  wsUrl: string,
  clientId: string,
  promptId: string,
  httpUrl: string,
  headers: Record<string, string>,
  totalSteps: number,
  networkConfig: NetworkConfig | null,
  conversationId?: string
): Promise<string> {
  // Create WebSocket with NetworkConfig support
  const ws = (await createWebSocket(`${wsUrl}?clientId=${clientId}`, {
    networkConfig: networkConfig ?? undefined,
  })) as any;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Image generation timeout (10m)'));
    }, 600000); // 10분 = 600초 = 600000ms

    // Periodic abort check (every 500ms)
    const abortCheckInterval = setInterval(() => {
      if (isAborted(conversationId)) {
        clearInterval(abortCheckInterval);
        clearTimeout(timeout);
        ws.close();
        reject(new Error('Image generation aborted by user'));
      }
    }, 500);

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'progress' && message.data.prompt_id === promptId) {
          const currentStep = message.data.value || 0;
          const maxSteps = message.data.max || totalSteps;
          const progress = 20 + Math.floor((currentStep / maxSteps) * 70);
          emitImageProgress(
            {
              status: 'executing',
              message: `🎨 이미지 생성 중... (${currentStep}/${maxSteps} 단계)`,
              progress,
              currentStep,
              totalSteps: maxSteps,
            },
            conversationId
          );
        }

        if (message.type === 'executed' && message.data.prompt_id === promptId) {
          clearTimeout(timeout);
          clearInterval(abortCheckInterval);
          emitImageProgress(
            { status: 'executing', message: '📥 생성된 이미지를 다운로드하는 중...', progress: 90 },
            conversationId
          );

          try {
            const images = message.data.output?.images || [];
            if (images.length === 0) {
              throw new Error('No images in output');
            }

            const imageInfo = images[0];
            const imageUrl = `${httpUrl}/view?filename=${imageInfo.filename}&subfolder=${imageInfo.subfolder || ''}&type=${imageInfo.type || 'output'}`;

            const imageResponse = await httpFetch(imageUrl, { headers });
            if (!imageResponse.ok) {
              throw new Error(`Failed to fetch image: ${imageResponse.status}`);
            }

            const buffer = await imageResponse.arrayBuffer();
            const base64 = Buffer.from(buffer).toString('base64');
            const mimeType = imageResponse.headers.get('content-type') || 'image/png';

            ws.close();
            resolve(`data:${mimeType};base64,${base64}`);
          } catch (error: any) {
            ws.close();
            reject(error);
          }
        }

        if (message.type === 'execution_error' && message.data.prompt_id === promptId) {
          clearTimeout(timeout);
          clearInterval(abortCheckInterval);
          ws.close();
          reject(new Error(`Execution error: ${JSON.stringify(message.data)}`));
        }
      } catch {
        // Ignore parse errors for non-JSON messages
      }
    });

    ws.on('error', (error: Error) => {
      clearTimeout(timeout);
      clearInterval(abortCheckInterval);
      reject(new Error(`WebSocket error: ${error.message}`));
    });

    ws.on('close', () => {
      clearTimeout(timeout);
      clearInterval(abortCheckInterval);
    });
  });
}

/**
 * 도구 실행 노드
 *
 * MCP를 통한 실제 도구 실행
 */
export async function toolsNode(state: AgentState): Promise<Partial<AgentState>> {
  try {
    // Check if aborted at the start
    if (isAborted(state.conversationId)) {
      logger.info('[Tools] Aborted before executing tools');
      throw new Error('Operation aborted by user');
    }

    const lastMessage = state.messages[state.messages.length - 1];

    if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
      return {};
    }

    logger.info(
      '[Tools] Executing tools:',
      lastMessage.tool_calls.map((c) => c.name)
    );

    // 각 도구 호출 실행
    const results: ToolResult[] = await Promise.all(
      lastMessage.tool_calls.map(async (call) => {
        try {
          // Check if aborted before each tool call
          if (isAborted(state.conversationId)) {
            logger.info(`[Tools] Aborted before executing ${call.name}`);
            return {
              toolCallId: call.id,
              toolName: call.name,
              result: null,
              error: 'Operation aborted by user',
            };
          }

          logger.info(`[Tools] Calling tool: ${call.name} with args:`, call.arguments);

          // 이미지 생성 tool 처리 (내장 도구) - MCP로 전달하지 않음
          // Main Process에서 직접 ImageGen provider 호출 (Renderer Process의 singleton 사용 불가)
          if (call.name === 'generate_image') {
            const imageGenConfig = getCurrentImageGenConfig();
            const networkConfig = getCurrentNetworkConfig();

            if (!imageGenConfig) {
              console.error('[Tools] ImageGen config not available');
              return {
                toolCallId: call.id,
                toolName: call.name,
                result: null,
                error: 'ImageGen is not configured',
              };
            }

            const args = call.arguments as {
              prompt: string;
              negativePrompt?: string;
              width?: number;
              height?: number;
              aspectRatio?: string;
              numberOfImages?: number;
            };

            // Emit initial progress (conversationId로 격리)
            emitImageProgress(
              {
                status: 'queued',
                message: '🎨 이미지 생성을 시작합니다...',
                progress: 0,
              },
              state.conversationId
            );

            // Provider에 따라 분기
            if (imageGenConfig.provider === 'comfyui') {
              const comfyConfig = imageGenConfig.comfyui;

              if (!comfyConfig || !comfyConfig.enabled) {
                console.error('[Tools] ComfyUI is not enabled');
                return {
                  toolCallId: call.id,
                  toolName: call.name,
                  result: null,
                  error: 'ComfyUI is not enabled',
                };
              }

              logger.info('[Tools] Generating image with ComfyUI (Main Process):', call.arguments);

              const imageResult = await generateImageInMainProcess(
                comfyConfig,
                networkConfig,
                args,
                state.conversationId
              );

              if (imageResult.success && imageResult.imageBase64) {
                const imageObject = {
                  id: `comfyui-${Date.now()}`,
                  base64: imageResult.imageBase64,
                  filename: `comfyui-${Date.now()}.png`,
                  mimeType: 'image/png',
                  provider: 'comfyui' as const,
                };

                return {
                  toolCallId: call.id,
                  toolName: call.name,
                  result: JSON.stringify({
                    success: true,
                    imageCount: 1,
                  }),
                  generatedImages: [imageObject],
                };
              } else {
                return {
                  toolCallId: call.id,
                  toolName: call.name,
                  result: null,
                  error: imageResult.error || 'Image generation failed',
                };
              }
            } else if (imageGenConfig.provider === 'nanobanana') {
              const nanobananaConfig = imageGenConfig.nanobanana;

              if (!nanobananaConfig || !nanobananaConfig.enabled) {
                console.error('[Tools] NanoBanana is not enabled');
                return {
                  toolCallId: call.id,
                  toolName: call.name,
                  result: null,
                  error: 'NanoBanana is not enabled',
                };
              }

              logger.info(
                '[Tools] Generating image with NanoBanana (Main Process):',
                call.arguments
              );

              // Emit progress
              emitImageProgress(
                {
                  status: 'executing',
                  message: '🌟 Google Imagen으로 이미지 생성 중...',
                  progress: 50,
                },
                state.conversationId
              );

              const nanobananaResult = await generateWithNanoBanana(
                nanobananaConfig,
                networkConfig,
                {
                  prompt: args.prompt,
                  negativePrompt: args.negativePrompt,
                  aspectRatio: args.aspectRatio,
                  numberOfImages: args.numberOfImages,
                }
              );

              if (nanobananaResult.success && nanobananaResult.images) {
                // Emit completion progress
                emitImageProgress(
                  {
                    status: 'completed',
                    message: '✅ 이미지 생성 완료!',
                    progress: 100,
                  },
                  state.conversationId
                );

                // Add images to state for later attachment to assistant message
                const imageObjects = nanobananaResult.images.map((img, idx) => ({
                  id: `nanobanana-${Date.now()}-${idx}`,
                  base64: img,
                  filename: `nanobanana-${Date.now()}-${idx}.png`,
                  mimeType: 'image/png',
                  provider: 'nanobanana' as const,
                }));

                logger.info('[Tools] Created image objects:', {
                  count: imageObjects.length,
                  firstImageBase64Length: imageObjects[0]?.base64?.length || 0,
                  firstImageBase64Prefix: imageObjects[0]?.base64?.substring(0, 50),
                });

                // Update state with generated images
                return {
                  toolCallId: call.id,
                  toolName: call.name,
                  result: JSON.stringify({
                    success: true,
                    imageCount: nanobananaResult.images.length,
                    usage: nanobananaResult.usage,
                  }),
                  generatedImages: imageObjects,
                };
              } else {
                // Emit error progress
                emitImageProgress(
                  {
                    status: 'error',
                    message: `❌ 이미지 생성 실패: ${nanobananaResult.error}`,
                  },
                  state.conversationId
                );

                return {
                  toolCallId: call.id,
                  toolName: call.name,
                  result: null,
                  error: nanobananaResult.error || 'NanoBanana image generation failed',
                };
              }
            } else {
              console.error('[Tools] Unknown ImageGen provider:', imageGenConfig.provider);
              return {
                toolCallId: call.id,
                toolName: call.name,
                result: null,
                error: `Unknown ImageGen provider: ${imageGenConfig.provider}`,
              };
            }
          }

          // Built-in tools 먼저 확인 (파일 작업, 브라우저 제어 등)
          try {
            const builtinResult = await executeBuiltinTool(call.name, call.arguments);
            logger.info(`[Tools] Built-in tool result:`, builtinResult);

            return {
              toolCallId: call.id,
              toolName: call.name,
              result: builtinResult,
            };
          } catch (error) {
            // "Unknown builtin tool" 에러면 MCP tool로 넘어감
            // 그 외 에러는 builtin tool 실행 중 발생한 에러이므로 바로 반환
            const errorMessage = error instanceof Error ? error.message : String(error);

            if (errorMessage.includes('Unknown builtin tool')) {
              logger.info(`[Tools] Not a built-in tool (${call.name}), checking MCP tools...`);
            } else {
              // Builtin tool 실행 중 에러 발생
              console.error(`[Tools] Built-in tool error (${call.name}):`, error);
              return {
                toolCallId: call.id,
                toolName: call.name,
                result: null,
                error: errorMessage,
              };
            }
          }

          // Main Process에서 직접 MCP 도구 실행
          // Note: toolsNode는 Electron Main Process에서 실행되므로 직접 메서드 사용
          const allTools = MCPServerManager.getAllToolsInMainProcess();
          const tool = allTools.find((t) => t.name === call.name);

          if (!tool) {
            console.warn(`[Tools] Tool not found in MCP servers: ${call.name}`);
            return {
              toolCallId: call.id,
              toolName: call.name,
              result: null,
              error: `Tool '${call.name}' not found`,
            };
          }

          logger.info(`[Tools] Found tool on server: ${tool.serverName}`);

          // Parameter filtering for tavily_search
          let toolArguments: any = call.arguments;
          if (call.name === 'tavily_search') {
            const params: any = call.arguments || {};

            // Extract and validate query
            let query: string = params.query || params.search_query || '';
            if (typeof query !== 'string') {
              query = String(query);
            }
            query = query.trim();

            // Extract and validate max_results (support multiple field names)
            let maxResults: number =
              params.max_results || params.maxResults || params.top_n || params.topn || 5;
            if (typeof maxResults === 'string') {
              maxResults = parseInt(maxResults, 10) || 5;
            }
            maxResults = Math.max(1, Math.min(maxResults, 10)); // Clamp to 1-10

            // Create cleaned parameters (only query and max_results)
            toolArguments = {};
            if (query) {
              toolArguments.query = query;
            }
            if (maxResults) {
              toolArguments.max_results = maxResults;
            }

            logger.info('[Tools] Tavily search - Original params:', params);
            logger.info('[Tools] Tavily search - Cleaned params:', toolArguments);
          }

          // Main Process에서 직접 MCP 클라이언트를 통해 도구 실행
          const mcpResult = await MCPServerManager.callToolInMainProcess(
            tool.serverName,
            call.name,
            toolArguments
          );

          logger.info(`[Tools] MCP Tool result:`, mcpResult);

          // ⚠️ CRITICAL: Check isError flag first to prevent hallucinations
          if (mcpResult?.isError) {
            // MCP 도구가 에러를 반환한 경우 - 명확하게 에러로 표시
            // Extract error message from content array (support text, image, resource types)
            const errorParts: string[] = [];
            if (mcpResult.content && Array.isArray(mcpResult.content)) {
              for (const item of mcpResult.content) {
                if (item.type === 'text' && item.text) {
                  errorParts.push(item.text);
                } else if (item.type === 'image' || item.type === 'resource') {
                  // Include non-text content description in error
                  errorParts.push(
                    `[${item.type} data: ${item.mimeType || 'unknown'}${item.data ? `, ${item.data.length} bytes` : ''}]`
                  );
                } else {
                  // Unknown content type - log warning for debugging
                  logger.warn(
                    `[Tools] Unknown content type '${item.type}' in error from tool ${call.name}`,
                    {
                      item,
                    }
                  );
                  // Fallback: try to extract any available text, or add placeholder
                  if (item.text) {
                    errorParts.push(item.text);
                  } else {
                    errorParts.push(`[Unknown content type: ${item.type}]`);
                  }
                }
              }
            }

            const errorText =
              errorParts.filter((text) => text).join('\n') ||
              'Tool execution failed with unknown error';

            console.error(`[Tools] MCP tool returned error for ${call.name}:`, errorText);

            return {
              toolCallId: call.id,
              toolName: call.name,
              result: null,
              error: `Tool '${call.name}' failed: ${errorText}`,
            };
          }

          // MCP ToolCallResult 형식에서 텍스트 추출
          let resultText = '';

          if (!mcpResult) {
            console.error(`[Tools] MCP tool returned null/undefined result for ${call.name}`);
            return {
              toolCallId: call.id,
              toolName: call.name,
              result: null,
              error: `Tool '${call.name}' returned no response. The MCP server may be unavailable or the tool may not exist.`,
            };
          } else if (mcpResult.content && Array.isArray(mcpResult.content)) {
            // content 배열에서 모든 타입 처리 (text, image, resource)
            const contentParts: string[] = [];

            for (const item of mcpResult.content) {
              if (item.type === 'text' && item.text) {
                contentParts.push(item.text);
              } else if (item.type === 'image') {
                // Image data: include description for LLM
                const imageDesc = `[Image data: ${item.mimeType || 'unknown type'}${item.data ? `, ${item.data.length} bytes` : ''}]`;
                contentParts.push(imageDesc);
              } else if (item.type === 'resource') {
                // Resource data: include description for LLM
                const resourceDesc = `[Resource data: ${item.mimeType || 'unknown type'}${item.data ? `, ${item.data.length} bytes` : ''}]`;
                contentParts.push(resourceDesc);
              } else {
                // Unknown content type - log warning for debugging
                logger.warn(
                  `[Tools] Unknown content type '${item.type}' in result from tool ${call.name}`,
                  { item }
                );
                // Fallback: try to extract any available text, or add placeholder
                if (item.text) {
                  contentParts.push(item.text);
                } else {
                  contentParts.push(`[Unknown content type: ${item.type}]`);
                }
              }
            }

            resultText = contentParts.filter((text) => text).join('\n');

            if (!resultText) {
              console.error(`[Tools] MCP tool content array is empty for ${call.name}`);
              return {
                toolCallId: call.id,
                toolName: call.name,
                result: null,
                error: `Tool '${call.name}' returned empty content. The tool may not support the given parameters or the requested data may not exist.`,
              };
            }
          } else if (typeof mcpResult === 'string') {
            resultText = mcpResult;
          } else if (typeof mcpResult === 'object') {
            resultText = JSON.stringify(mcpResult);
          } else {
            resultText = String(mcpResult);
          }

          // 추가 검증: 결과 텍스트가 비어있지 않은지 확인
          if (!resultText || resultText.trim().length === 0) {
            console.error(`[Tools] MCP tool returned empty text for ${call.name}`);
            return {
              toolCallId: call.id,
              toolName: call.name,
              result: null,
              error: `Tool '${call.name}' returned empty result. The requested operation may have failed or returned no data.`,
            };
          }

          logger.info(
            `[Tools] Extracted result text (${resultText.length} chars):`,
            resultText.substring(0, 200)
          );

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

    logger.info('[Tools] All tool results:', results);

    // Collect generated images from results
    const generatedImages: Array<{
      id: string;
      base64: string;
      filename: string;
      mimeType: string;
      provider?: 'comfyui' | 'nanobanana';
    }> = [];

    for (const result of results) {
      if ((result as any).generatedImages) {
        generatedImages.push(...(result as any).generatedImages);
      }
    }

    logger.info('[Tools] Generated images count:', generatedImages.length);

    return {
      toolResults: results,
      generatedImages: generatedImages.length > 0 ? generatedImages : undefined,
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
