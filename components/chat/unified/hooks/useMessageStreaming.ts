import { logger } from '@/lib/utils/logger';
/**
 * useMessageStreaming Hook
 *
 * 메시지 스트리밍 로직 관리
 * LangGraph IPC 통신, RAF 기반 UI 업데이트, Tool approval 처리
 */

import { useRef, useCallback } from 'react';
import { useChatStore } from '@/lib/store/chat-store';
import { isElectron } from '@/lib/platform';
import { getWebLLMClient } from '@/lib/llm/web-client';
import type { Message, ImageAttachment, ToolCall } from '@/types';
import { generateId } from '@/lib/utils/id-generator';
import { getVisualizationInstructions } from '@/lib/langgraph/utils/system-message';
import type { ToolResult } from '@/lib/langgraph/types';
import {
  createFlowTracker,
  addFlowNode,
  completeFlow,
  generateMermaidDiagram,
  generateFlowSummary,
  type AgentFlowTracker,
} from '@/lib/utils/agent-flow-visualizer';

interface StreamingOptions {
  conversationId: string;
  userMessage: string;
  images?: ImageAttachment[];
  systemMessage?: string | null;
  personaSystemPrompt?: string | null;
}

import { useLanguage } from '@/components/providers/i18n-provider';

export function useMessageStreaming() {
  const { language } = useLanguage();
  const {
    messages,
    addMessage,
    updateMessage,
    startStreaming,
    stopStreaming,
    getGraphConfig,
    updateConversationTitle,
    conversations,
    setPendingToolApproval,
    clearPendingToolApproval,
    setImageGenerationProgress,
    clearImageGenerationProgress,
    setAgentProgress,
    clearAgentProgress,
    setEnableImageGeneration,
    enableTools,
    enableImageGeneration,
    thinkingMode,
    workingDirectory,
    appMode,
  } = useChatStore();

  const abortControllerRef = useRef<AbortController | null>(null);
  const rafIdRef = useRef<number | null>(null);

  // Execute streaming in background
  const executeStreaming = useCallback(
    async ({
      conversationId,
      userMessage,
      images,
      systemMessage,
      personaSystemPrompt,
    }: StreamingOptions) => {
      // Variables for streaming animation
      let accumulatedContent = '';
      let accumulatedMessage: Partial<Message> = {};
      let pendingUpdate = false;

      // Track cleanup functions
      let cleanupEventHandler: (() => void) | null = null;
      let cleanupDoneHandler: (() => void) | null = null;
      let cleanupErrorHandler: (() => void) | null = null;

      // Agent flow tracker for Coding mode
      let flowTracker: AgentFlowTracker | null = null;
      if (thinkingMode === 'coding') {
        flowTracker = createFlowTracker();
      }

      try {
        // Add user message
        await addMessage(
          {
            role: 'user',
            content: userMessage,
            images,
          },
          conversationId
        );

        // Prepare messages for LLM (include history)
        // 시각화 지침을 페르소나 시스템 프롬프트에 추가
        const visualizationInstructions = getVisualizationInstructions();
        const enhancedPersonaPrompt = personaSystemPrompt
          ? `${personaSystemPrompt}\n\n${visualizationInstructions}`
          : null;

        const allMessages = [
          // Add persona system prompt with visualization instructions (if no Quick Question system message)
          ...(!systemMessage && enhancedPersonaPrompt
            ? [
                {
                  id: 'system-persona',
                  role: 'system' as const,
                  content: enhancedPersonaPrompt,
                  created_at: Date.now(),
                },
              ]
            : []),
          // Add system message from Quick Question if present (overrides persona)
          ...(systemMessage
            ? [
                {
                  id: 'system-quick',
                  role: 'system' as const,
                  content: systemMessage,
                  created_at: Date.now(),
                },
              ]
            : []),
          ...messages,
          {
            id: 'temp',
            role: 'user' as const,
            content: userMessage,
            created_at: Date.now(),
            images,
          },
        ];

        // Create empty assistant message for streaming
        const assistantMessage = await addMessage(
          {
            role: 'assistant',
            content: '',
          },
          conversationId
        );

        const assistantMessageId = assistantMessage.id;
        startStreaming(conversationId, assistantMessageId);

        // Create abort controller
        abortControllerRef.current = new AbortController();

        // RAF-based batching for smooth UI updates
        const scheduleUpdate = (messageUpdates: Partial<Message>, force = false) => {
          accumulatedMessage = { ...accumulatedMessage, ...messageUpdates };

          if (force) {
            if (rafIdRef.current !== null) {
              cancelAnimationFrame(rafIdRef.current);
              rafIdRef.current = null;
            }
            updateMessage(assistantMessageId, accumulatedMessage, conversationId);
            pendingUpdate = false;
            return;
          }

          if (pendingUpdate) {
            return;
          }

          pendingUpdate = true;
          rafIdRef.current = requestAnimationFrame(() => {
            updateMessage(assistantMessageId, accumulatedMessage, conversationId);
            pendingUpdate = false;
            rafIdRef.current = null;
          });
        };

        // Stream response
        if (isElectron() && window.electronAPI?.langgraph) {
          // Electron: Use IPC
          const graphConfig = getGraphConfig();

          // Setup stream event listeners
          cleanupEventHandler = window.electronAPI.langgraph.onStreamEvent((event) => {
            if (!event || abortControllerRef.current?.signal.aborted) {
              return;
            }

            // Filter by conversationId
            if (event.conversationId && event.conversationId !== conversationId) {
              return;
            }

            // Handle streaming chunks
            if (event.type === 'streaming' && event.chunk) {
              accumulatedContent += event.chunk;
              scheduleUpdate({ content: accumulatedContent });
              return;
            }

            // Handle tool approval request
            if (event.type === 'tool_approval_request') {
              const currentStore = useChatStore.getState();
              if (currentStore.alwaysApproveToolsForSession) {
                // Auto-approve
                (async () => {
                  try {
                    if (window.electronAPI?.langgraph && event.conversationId) {
                      await window.electronAPI.langgraph.respondToolApproval(
                        event.conversationId,
                        true
                      );
                    }
                  } catch (error) {
                    console.error('[useMessageStreaming] Failed to auto-approve tools:', error);
                  }
                })();
                return;
              }

              setPendingToolApproval({
                conversationId: event.conversationId!,
                messageId: event.messageId!,
                toolCalls: event.toolCalls!,
                timestamp: Date.now(),
              });

              // Add approval waiting message only if not already present
              const approvalMessage = '🔔 도구 실행 승인을 기다리는 중...';
              if (!accumulatedContent.includes(approvalMessage)) {
                accumulatedContent = `${accumulatedContent || ''}\n\n${approvalMessage}`;
                scheduleUpdate({ content: accumulatedContent });
              }
              return;
            }

            // Handle tool approval result
            if (event.type === 'tool_approval_result') {
              clearPendingToolApproval();
              if (!event.approved) {
                accumulatedContent = `${accumulatedContent || ''}\n\n❌ 도구 실행이 거부되었습니다.`;
                scheduleUpdate({ content: accumulatedContent });
              }
              return;
            }

            // Handle image generation progress
            if (event.type === 'image_progress' && event.progress) {
              setImageGenerationProgress({
                conversationId,
                messageId: assistantMessageId,
                status: event.progress.status,
                message: event.progress.message,
                progress: event.progress.progress || 0,
                currentStep: event.progress.currentStep,
                totalSteps: event.progress.totalSteps,
              });

              if (event.progress.status === 'completed' || event.progress.status === 'error') {
                clearImageGenerationProgress(conversationId);
              }
              return;
            }

            // Handle node execution (for Agent mode)
            if (enableTools && event.type === 'node' && event.data?.messages) {
              let nodeStatusMessage = '';

              if (event.node === 'generate') {
                const hasToolResults = event.data?.messages?.some(
                  (msg: Message) => msg.role === 'tool'
                );
                if (event.data?.messages?.[0]?.tool_calls) {
                  const toolNames = event.data.messages[0].tool_calls
                    .map((tc: ToolCall) => tc.name)
                    .join(', ');
                  nodeStatusMessage = `🤖 AI가 도구 사용을 계획하고 있습니다: ${toolNames}`;
                } else if (!hasToolResults) {
                  nodeStatusMessage = '🤖 AI가 응답을 생성하고 있습니다...';
                }
              } else if (event.node === 'tools') {
                const toolResults = (event.data?.toolResults || []) as ToolResult[];
                if (toolResults.length > 0) {
                  const toolNames = toolResults.map((tr: ToolResult) => tr.toolName).join(', ');
                  const hasError = toolResults.some((tr: ToolResult) => tr.error);
                  const hasImageGen = toolNames.includes('generate_image');

                  if (hasImageGen) {
                    clearImageGenerationProgress(conversationId);
                  }

                  nodeStatusMessage = hasError
                    ? `⚠️ 도구 실행 중 일부 오류 발생: ${toolNames}`
                    : `✅ 도구 실행 완료: ${toolNames}`;
                }
              } else if (event.node === 'reporter') {
                nodeStatusMessage = '📊 최종 결과를 정리하고 있습니다...';
              }

              if (nodeStatusMessage) {
                // For 'generate' status without tool use, only show if we don't have content yet
                // This prevents "AI is generating..." from appearing after the text has started streaming
                if (
                  event.node === 'generate' &&
                  !nodeStatusMessage.includes('tool') &&
                  accumulatedContent.trim()
                ) {
                  // Skip
                } else {
                  accumulatedContent = `${accumulatedContent || ''}\n\n${nodeStatusMessage}`;
                  scheduleUpdate({ content: accumulatedContent });
                }
              }
            }

            // Handle Coding Agent display
            if (thinkingMode === 'coding' && event.type === 'node' && event.data?.messages) {
              const allMsgs = event.data.messages;

              // Update agent progress if available
              const eventData = event.data as any; // Type assertion for dynamic data
              if (eventData?.iterationCount !== undefined && eventData?.maxIterations) {
                const nodeStatus = event.node || 'working';
                const statusMap: Record<string, string> = {
                  agent: 'thinking',
                  tools: 'executing',
                  verifier: 'thinking',
                  reporter: 'executing',
                };

                // Use statusMessage from event if available, otherwise fallback to node name
                const detailedMessage = eventData?.statusMessage
                  ? eventData.statusMessage
                  : `${event.node || 'Processing'}`;

                setAgentProgress(conversationId, {
                  iteration: eventData.iterationCount,
                  maxIterations: eventData.maxIterations,
                  status: statusMap[nodeStatus] || 'working',
                  message: detailedMessage,
                });

                // Track node in flow tracker
                if (flowTracker && event.node) {
                  addFlowNode(
                    flowTracker,
                    event.node,
                    eventData.iterationCount,
                    eventData.statusMessage
                  );
                }
              }

              if (allMsgs && allMsgs.length > 0) {
                let displayContent = '';
                for (const msg of allMsgs) {
                  if (msg.role === 'user') {
                    continue;
                  }

                  if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
                    if (msg.content) {
                      // Show full thinking content with collapsible UI for long content
                      if (msg.content.length > 300) {
                        displayContent += `<details class="thinking-block mb-2">
<summary class="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
💭 <strong>Thinking...</strong> (click to expand)
</summary>
<div class="mt-2 pl-4 border-l-2 border-primary/30">

${msg.content}

</div>
</details>\n\n`;
                      } else {
                        displayContent += `💭 ${msg.content}\n\n`;
                      }
                    }
                    continue;
                  }

                  if (msg.role === 'tool') {
                    continue;
                  }

                  if (
                    msg.role === 'assistant' &&
                    (!msg.tool_calls || msg.tool_calls.length === 0)
                  ) {
                    if (msg.content) {
                      displayContent += `${msg.content}\n\n`;
                    }
                  }
                }

                scheduleUpdate({
                  content: displayContent.trim(),
                  referenced_documents: allMsgs[allMsgs.length - 1]?.referenced_documents,
                });
              }
            }

            // Extract referenced_documents and images for non-coding modes
            if (
              thinkingMode !== 'coding' &&
              event.type === 'node' &&
              event.data?.messages &&
              event.data.messages.length > 0
            ) {
              const lastMessage = event.data.messages[event.data.messages.length - 1];
              const updates: Partial<Message> = {};

              // If this is a final assistant message (no tool_calls), update content
              // This replaces status messages like "🤖 AI가 응답을 생성하고 있습니다..."
              // Thinking Mode, Agent Mode, Tools 사용 시에는 중간 과정(로그)이 중요하므로 덮어쓰지 않음
              const isAdvancedMode =
                [
                  'sequential',
                  'tree_of_thought',
                  'deep',
                  'deep_thinking',
                  'deep-web-research',
                  'coding',
                ].includes(thinkingMode) ||
                appMode === 'browser' ||
                appMode === 'editor' ||
                enableTools;

              if (
                !isAdvancedMode &&
                lastMessage?.role === 'assistant' &&
                (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) &&
                lastMessage.content
              ) {
                accumulatedContent = lastMessage.content;
                updates.content = accumulatedContent;
              }

              if (
                lastMessage?.referenced_documents &&
                lastMessage.referenced_documents.length > 0
              ) {
                updates.referenced_documents = lastMessage.referenced_documents;
              }

              // Extract generated images from assistant message
              if (lastMessage?.images && lastMessage.images.length > 0) {
                updates.images = lastMessage.images;
              }

              if (Object.keys(updates).length > 0) {
                scheduleUpdate(updates);
              }
            }

            // Extract generated images
            if (event.type === 'node' && event.node === 'tools' && event.data?.toolResults) {
              const toolResults = event.data.toolResults;
              const generatedImages: ImageAttachment[] = [];
              let usageInfo: Record<string, unknown> | null = null;

              for (const toolResult of toolResults) {
                if (toolResult.toolName === 'generate_image' && toolResult.result) {
                  try {
                    const resultData =
                      typeof toolResult.result === 'string'
                        ? JSON.parse(toolResult.result)
                        : toolResult.result;

                    if (resultData.success) {
                      // Extract usage info if available
                      if (resultData.usage) {
                        usageInfo = resultData.usage;
                      }

                      if (resultData.imageBase64) {
                        generatedImages.push({
                          id: generateId('generated'),
                          path: '',
                          filename: `Generated: ${resultData.prompt?.substring(0, 30) || 'image'}...`,
                          mimeType: 'image/png',
                          base64: resultData.imageBase64,
                        });
                      } else if (resultData.images && Array.isArray(resultData.images)) {
                        for (const imgData of resultData.images) {
                          if (imgData.imageBase64) {
                            generatedImages.push({
                              id: generateId('generated'),
                              path: '',
                              filename: `Generated #${imgData.index + 1}: ${resultData.prompt?.substring(0, 30) || 'image'}...`,
                              mimeType: 'image/png',
                              base64: imgData.imageBase64,
                            });
                          }
                        }
                      }
                    }
                  } catch (error) {
                    console.error(
                      '[useMessageStreaming] Failed to process image generation:',
                      error
                    );
                  }
                }
              }

              if (generatedImages.length > 0) {
                scheduleUpdate({ images: generatedImages });
                setEnableImageGeneration(false);

                // Append usage info to assistant message if available
                if (usageInfo) {
                  let usageMessage = '\n\n';
                  if (usageInfo.imageCount) {
                    usageMessage += `📊 **이미지 생성 정보**: ${usageInfo.imageCount}개의 이미지 생성됨`;
                  }
                  if (usageInfo.totalTokenCount) {
                    usageMessage += `\n🎫 **토큰 사용량**: ${usageInfo.totalTokenCount.toLocaleString()} 토큰`;
                    if (usageInfo.promptTokenCount) {
                      usageMessage += ` (입력: ${usageInfo.promptTokenCount.toLocaleString()}`;
                    }
                    if (usageInfo.candidatesTokenCount) {
                      usageMessage += `, 출력: ${usageInfo.candidatesTokenCount.toLocaleString()}`;
                    }
                    if (usageInfo.promptTokenCount || usageInfo.candidatesTokenCount) {
                      usageMessage += ')';
                    }
                  }
                  // Append usage info to the accumulated message content
                  scheduleUpdate({ content: accumulatedMessage.content + usageMessage });
                }
              }
            }

            // Handle errors
            if (event.type === 'error') {
              throw new Error(event.error || 'Graph execution failed');
            }
          });

          cleanupDoneHandler = window.electronAPI.langgraph.onStreamDone(
            (data?: { conversationId?: string }) => {
              if (data?.conversationId && data.conversationId !== conversationId) {
                return;
              }
              if (!abortControllerRef.current?.signal.aborted) {
                scheduleUpdate({}, true);

                // Add Mermaid diagram for Coding Agent flow
                if (flowTracker) {
                  completeFlow(flowTracker);
                  const mermaidDiagram = generateMermaidDiagram(flowTracker);
                  const flowSummary = generateFlowSummary(flowTracker);

                  // Append flow visualization to the message
                  const finalContent = `${accumulatedContent}\n\n---\n\n## 🔄 Agent Execution Flow\n\n${flowSummary}\n\n${mermaidDiagram}`;
                  scheduleUpdate({ content: finalContent }, true);
                }

                // 백그라운드 스트리밍 감지 및 알림 (신규 추가)
                const state = useChatStore.getState();
                const isDifferentConversation = state.activeConversationId !== conversationId;
                const isAppUnfocused = !state.isAppFocused;

                if (isDifferentConversation || isAppUnfocused) {
                  logger.info(
                    `[useMessageStreaming] Background streaming completed for ${conversationId}, showing notification`
                  );

                  // 시스템 알림 표시
                  const conversation = conversations.find((c) => c.id === conversationId);
                  const conversationTitle = conversation?.title || '새 대화';

                  if (window.electronAPI?.notification) {
                    window.electronAPI.notification
                      .show({
                        conversationId,
                        title: conversationTitle,
                        body: '응답이 완료되었습니다.',
                      })
                      .catch((error) => {
                        console.error('[useMessageStreaming] Failed to show notification:', error);
                      });
                  }
                }
              }
            }
          );

          cleanupErrorHandler = window.electronAPI.langgraph.onStreamError(
            (data: { error: string; conversationId?: string }) => {
              if (data?.conversationId && data.conversationId !== conversationId) {
                return;
              }
              if (!data || !data.error) {
                return;
              }
              console.error('[useMessageStreaming] Stream error:', data.error);
              updateMessage(
                assistantMessageId,
                { content: `Error: ${data.error}` },
                conversationId
              );
            }
          );

          // Get ImageGen and Network config
          let imageGenConfig = null;
          let networkConfig = null;
          if (enableImageGeneration) {
            try {
              const result = await window.electronAPI.config.load();
              if (result.success && result.data) {
                imageGenConfig = result.data.imageGen || null;

                // Override provider if user selected a specific one
                const selectedProvider = useChatStore.getState().selectedImageGenProvider;
                if (
                  imageGenConfig &&
                  selectedProvider &&
                  imageGenConfig.comfyui?.enabled &&
                  imageGenConfig.nanobanana?.enabled
                ) {
                  imageGenConfig = {
                    ...imageGenConfig,
                    provider: selectedProvider,
                  };
                  logger.info(
                    '[useMessageStreaming] Overriding imageGen provider:',
                    selectedProvider
                  );
                }

                const networkConfigStr = localStorage.getItem('sepilot_network_config');
                networkConfig = networkConfigStr ? JSON.parse(networkConfigStr) : null;
              }
            } catch (e) {
              console.warn('[useMessageStreaming] Failed to load config:', e);
            }
          }

          // Start streaming
          await window.electronAPI.langgraph.stream(
            graphConfig,
            allMessages,
            conversationId,
            enableImageGeneration && imageGenConfig ? imageGenConfig : undefined,
            enableImageGeneration && networkConfig ? networkConfig : undefined,
            workingDirectory || undefined
          );

          // Save final message
          if (window.electronAPI) {
            const finalMessage: Message = {
              id: assistantMessageId,
              conversation_id: conversationId,
              role: 'assistant',
              content: accumulatedMessage.content || accumulatedContent,
              created_at: Date.now(),
              referenced_documents: accumulatedMessage.referenced_documents,
              images: accumulatedMessage.images,
            };
            await window.electronAPI.chat.saveMessage(finalMessage);
          }
        } else {
          // Web: WebLLMClient
          const webClient = getWebLLMClient();
          const historyMessages = allMessages.map((m) => ({
            role: m.role as 'system' | 'user' | 'assistant',
            content: m.content,
          }));

          for await (const chunk of webClient.stream(historyMessages)) {
            if (abortControllerRef.current?.signal.aborted) {
              break;
            }

            if (!chunk.done && chunk.content) {
              accumulatedContent += chunk.content;
              scheduleUpdate({ content: accumulatedContent });
            }
          }

          scheduleUpdate({}, true);
        }

        // Auto-generate title if needed
        const { shouldGenerateTitle, generateConversationTitle } =
          await import('@/lib/chat/title-generator');
        const currentConversation = conversations.find((c) => c.id === conversationId);
        if (currentConversation && shouldGenerateTitle(currentConversation.title)) {
          const allMessagesForTitle = [
            ...messages,
            { role: 'user' as const, content: userMessage },
            { role: 'assistant' as const, content: accumulatedContent },
          ];

          generateConversationTitle(allMessagesForTitle, language)
            .then((title) => {
              updateConversationTitle(conversationId, title);
            })
            .catch((err) => {
              console.error('Failed to auto-generate title:', err);
            });
        }
      } catch (error) {
        console.error('[useMessageStreaming] Error:', error);
        updateMessage(
          accumulatedMessage.content ? '' : 'temp',
          {
            content: `Error: ${error instanceof Error ? error.message : 'Failed to get response'}`,
          },
          conversationId
        );
      } finally {
        // Cleanup
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
        }

        if (cleanupEventHandler) {
          cleanupEventHandler();
        }
        if (cleanupDoneHandler) {
          cleanupDoneHandler();
        }
        if (cleanupErrorHandler) {
          cleanupErrorHandler();
        }

        // Clear agent progress when streaming stops
        clearAgentProgress(conversationId);

        stopStreaming(conversationId);
        abortControllerRef.current = null;
      }
    },
    [
      messages,
      addMessage,
      updateMessage,
      startStreaming,
      stopStreaming,
      getGraphConfig,
      updateConversationTitle,
      conversations,
      setPendingToolApproval,
      clearPendingToolApproval,
      setImageGenerationProgress,
      clearImageGenerationProgress,
      setAgentProgress,
      clearAgentProgress,
      setEnableImageGeneration,
      enableTools,
      enableImageGeneration,
      thinkingMode,
      workingDirectory,
      appMode,
    ]
  );

  const stopCurrentStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  return {
    executeStreaming,
    stopCurrentStreaming,
  };
}
