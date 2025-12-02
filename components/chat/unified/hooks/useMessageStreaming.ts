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
import type { Message, ImageAttachment } from '@/types';

interface StreamingOptions {
  conversationId: string;
  userMessage: string;
  images?: ImageAttachment[];
  systemMessage?: string | null;
  personaSystemPrompt?: string | null;
}

export function useMessageStreaming() {
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
    setEnableImageGeneration,
    enableTools,
    enableImageGeneration,
    thinkingMode,
    workingDirectory,
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
        const allMessages = [
          // Add persona system prompt (if no Quick Question system message)
          ...(!systemMessage && personaSystemPrompt
            ? [
                {
                  id: 'system-persona',
                  role: 'system' as const,
                  content: personaSystemPrompt,
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
              accumulatedContent = `${accumulatedContent || ''}\n\n🔔 도구 실행 승인을 기다리는 중...`;
              scheduleUpdate({ content: accumulatedContent });
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
                  (msg: any) => msg.role === 'tool'
                );
                if (event.data?.messages?.[0]?.tool_calls) {
                  const toolNames = event.data.messages[0].tool_calls
                    .map((tc: any) => tc.name)
                    .join(', ');
                  nodeStatusMessage = `🤖 AI가 도구 사용을 계획하고 있습니다: ${toolNames}`;
                } else if (!hasToolResults) {
                  nodeStatusMessage = '🤖 AI가 응답을 생성하고 있습니다...';
                }
              } else if (event.node === 'tools') {
                const toolResults = event.data?.toolResults || [];
                if (toolResults.length > 0) {
                  const toolNames = toolResults.map((tr: any) => tr.toolName).join(', ');
                  const hasError = toolResults.some((tr: any) => tr.error);
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
                accumulatedContent = `${accumulatedContent || ''}\n\n${nodeStatusMessage}`;
                scheduleUpdate({ content: accumulatedContent });
              }
            }

            // Handle Coding Agent display
            if (thinkingMode === 'coding' && event.type === 'node' && event.data?.messages) {
              const allMsgs = event.data.messages;
              if (allMsgs && allMsgs.length > 0) {
                let displayContent = '';
                for (const msg of allMsgs) {
                  if (msg.role === 'user') {
                    continue;
                  }

                  if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
                    if (msg.content) {
                      const thinkingContent =
                        msg.content.length > 300
                          ? `${msg.content.substring(0, 300)}...`
                          : msg.content;
                      displayContent += `💭 ${thinkingContent}\n\n`;
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

            // Extract referenced_documents for non-coding modes
            if (
              thinkingMode !== 'coding' &&
              event.type === 'node' &&
              event.data?.messages &&
              event.data.messages.length > 0
            ) {
              const lastMessage = event.data.messages[event.data.messages.length - 1];
              if (
                lastMessage?.referenced_documents &&
                lastMessage.referenced_documents.length > 0
              ) {
                scheduleUpdate({
                  referenced_documents: lastMessage.referenced_documents,
                });
              }
            }

            // Extract generated images
            if (event.type === 'node' && event.node === 'tools' && event.data?.toolResults) {
              const toolResults = event.data.toolResults;
              const generatedImages: ImageAttachment[] = [];
              let usageInfo: any = null;

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
                          id: `generated-${Date.now()}-${Math.random()}`,
                          path: '',
                          filename: `Generated: ${resultData.prompt?.substring(0, 30) || 'image'}...`,
                          mimeType: 'image/png',
                          base64: resultData.imageBase64,
                        });
                      } else if (resultData.images && Array.isArray(resultData.images)) {
                        for (const imgData of resultData.images) {
                          if (imgData.imageBase64) {
                            generatedImages.push({
                              id: `generated-${Date.now()}-${Math.random()}`,
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

          generateConversationTitle(allMessagesForTitle)
            .then((title) => {
              updateConversationTitle(conversationId, title);
            })
            .catch((err) => {
              console.error('Failed to auto-generate title:', err);
            });
        }
      } catch (error: any) {
        console.error('[useMessageStreaming] Error:', error);
        updateMessage(
          accumulatedMessage.content ? '' : 'temp',
          {
            content: `Error: ${error.message || 'Failed to get response'}`,
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
      setEnableImageGeneration,
      enableTools,
      enableImageGeneration,
      thinkingMode,
      workingDirectory,
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
