'use client';

import { useState, KeyboardEvent, useRef, useEffect, useCallback } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send, Square, MessageSquare, Database, Wrench, ChevronDown, ImagePlus, X, Sparkles } from 'lucide-react';
import { useChatStore } from '@/lib/store/chat-store';
import { GraphFactory } from '@/lib/langgraph';
import { initializeLLMClient } from '@/lib/llm/client';
import { initializeComfyUIClient } from '@/lib/comfyui/client';
import { generateConversationTitle, shouldGenerateTitle } from '@/lib/chat/title-generator';
import { isElectron } from '@/lib/platform';
import { getWebLLMClient, configureWebLLMClient } from '@/lib/llm/web-client';
import { ImageAttachment, Message } from '@/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function InputBox() {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedImages, setSelectedImages] = useState<ImageAttachment[]>([]);
  const [imageGenerationEnabled, setImageGenerationEnabled] = useState(false);
  const [comfyUIAvailable, setComfyUIAvailable] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [imageGenProgress, setImageGenProgress] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const {
    addMessage,
    updateMessage,
    activeConversationId,
    createConversation,
    streamingConversations,
    startStreaming,
    stopStreaming,
    messages,
    graphType,
    setGraphType,
    conversations,
    updateConversationTitle,
  } = useChatStore();

  // Determine if any conversation is currently streaming
  const isStreaming = activeConversationId ? streamingConversations.has(activeConversationId) : false;

  // Set mounted state to avoid hydration mismatch with Tooltip
  useEffect(() => {
    setMounted(true);
  }, []);

  // Listen for file drop events from ChatArea
  useEffect(() => {
    const handleFileDrop = (e: CustomEvent<{ textContents: string[]; imageFiles: { filename: string; mimeType: string; base64: string }[] }>) => {
      const { textContents, imageFiles } = e.detail;

      if (textContents.length > 0) {
        const combinedText = textContents.join('\n\n');
        setInput((prev) => (prev ? `${prev}\n\n${combinedText}` : combinedText));
      }

      if (imageFiles.length > 0) {
        const newImages: ImageAttachment[] = imageFiles.map((img) => ({
          id: `drop-${Date.now()}-${Math.random()}`,
          path: '',
          filename: img.filename,
          mimeType: img.mimeType,
          base64: img.base64,
        }));
        setSelectedImages((prev) => [...prev, ...newImages]);
      }
    };

    window.addEventListener('sepilot:file-drop', handleFileDrop as EventListener);
    return () => {
      window.removeEventListener('sepilot:file-drop', handleFileDrop as EventListener);
    };
  }, []);

  // Load LLM and ComfyUI config on mount
  useEffect(() => {
    const loadConfig = async () => {
      if (typeof window === 'undefined') {
        return;
      }

      try {
        if (isElectron() && window.electronAPI) {
          // Electron: SQLite에서 로드
          const result = await window.electronAPI.config.load();
          if (result.success && result.data) {
            // Initialize LLM client
            if (result.data.llm) {
              initializeLLMClient(result.data.llm);
            }

            // Initialize ComfyUI client
            if (result.data.comfyUI) {
              initializeComfyUIClient(result.data.comfyUI);
              // Check if ComfyUI is enabled and has httpUrl configured
              const isAvailable = result.data.comfyUI.enabled && !!result.data.comfyUI.httpUrl;
              setComfyUIAvailable(isAvailable);
              console.log('[InputBox] ComfyUI client initialized:', {
                enabled: result.data.comfyUI.enabled,
                httpUrl: result.data.comfyUI.httpUrl,
                available: isAvailable,
              });
            } else {
              setComfyUIAvailable(false);
            }
          }
        } else {
          // Web: localStorage에서 로드
          const savedConfig = localStorage.getItem('sepilot_llm_config');
          if (savedConfig) {
            const config = JSON.parse(savedConfig);
            configureWebLLMClient(config);
          }

          // Also try to load ComfyUI config from localStorage
          const savedComfyConfig = localStorage.getItem('sepilot_comfyui_config');
          if (savedComfyConfig) {
            const config = JSON.parse(savedComfyConfig);
            initializeComfyUIClient(config);
            const isAvailable = config.enabled && !!config.httpUrl;
            setComfyUIAvailable(isAvailable);
          } else {
            setComfyUIAvailable(false);
          }
        }
      } catch (error) {
        console.error('Failed to load config:', error);
      }
    };

    loadConfig();

    // Listen for storage changes (when settings are updated)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'sepilot_comfyui_config' && e.newValue) {
        try {
          const config = JSON.parse(e.newValue);
          initializeComfyUIClient(config);
          const isAvailable = config.enabled && !!config.httpUrl;
          setComfyUIAvailable(isAvailable);
          console.log('[InputBox] ComfyUI config updated from storage:', {
            enabled: config.enabled,
            httpUrl: config.httpUrl,
            available: isAvailable,
          });
        } catch (error) {
          console.error('Failed to parse ComfyUI config from storage:', error);
        }
      }
    };

    // Custom event listener for config updates (Electron environment)
    const handleConfigUpdate = ((e: CustomEvent) => {
      const { comfyUI, llm } = e.detail || {};

      // LLM 설정 업데이트
      if (llm) {
        if (isElectron() && window.electronAPI) {
          // Electron: IPC를 통해 LLM 클라이언트 재초기화
          initializeLLMClient(llm);
          console.log('[InputBox] LLM config updated from event (Electron):', {
            provider: llm.provider,
            model: llm.model,
          });
        } else {
          // Web: WebLLMClient 재초기화
          configureWebLLMClient(llm);
          console.log('[InputBox] LLM config updated from event (Web):', {
            provider: llm.provider,
            model: llm.model,
          });
        }
      }

      // ComfyUI 설정 업데이트
      if (comfyUI) {
        initializeComfyUIClient(comfyUI);
        const isAvailable = comfyUI.enabled && !!comfyUI.httpUrl;
        setComfyUIAvailable(isAvailable);
        console.log('[InputBox] ComfyUI config updated from event:', {
          enabled: comfyUI.enabled,
          httpUrl: comfyUI.httpUrl,
          available: isAvailable,
        });
      }
    }) as EventListener;

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('sepilot:config-updated', handleConfigUpdate);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('sepilot:config-updated', handleConfigUpdate);
    };
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  // Stop streaming handler
  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  // Handle Esc key to stop streaming
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && isStreaming) {
        handleStop();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isStreaming, handleStop]);

  // Handle image selection
  const handleImageSelect = async () => {
    if (!isElectron() || !window.electronAPI) {
      setError('Image upload is only available in the desktop app');
      return;
    }

    try {
      const result = await window.electronAPI.file.selectImages();
      if (result.success && result.data && result.data.length > 0) {
        setSelectedImages((prev) => [...prev, ...(result.data || [])]);
      }
    } catch (error: any) {
      console.error('Failed to select images:', error);
      setError(error.message || 'Failed to select images');
    }
  };

  // Remove selected image
  const handleRemoveImage = (imageId: string) => {
    setSelectedImages((prev) => prev.filter((img) => img.id !== imageId));
  };

  // Handle clipboard paste
  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];

    // 클립보드 아이템에서 이미지 찾기
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          imageFiles.push(file);
        }
      }
    }

    if (imageFiles.length === 0) return;

    // 이미지가 있으면 텍스트 붙여넣기 방지
    e.preventDefault();

    // 이미지를 base64로 변환하여 추가
    for (const file of imageFiles) {
      try {
        const reader = new FileReader();
        reader.onload = (event) => {
          const base64 = event.target?.result as string;
          const newImage: ImageAttachment = {
            id: `clipboard-${Date.now()}-${Math.random()}`,
            path: '',
            filename: file.name || `clipboard-image-${Date.now()}.${file.type.split('/')[1]}`,
            mimeType: file.type,
            base64,
          };
          setSelectedImages((prev) => [...prev, newImage]);
        };
        reader.onerror = () => {
          setError('클립보드 이미지를 읽는 중 오류가 발생했습니다');
        };
        reader.readAsDataURL(file);
      } catch (error: any) {
        console.error('Failed to read clipboard image:', error);
        setError(error.message || '클립보드 이미지를 처리하는 중 오류가 발생했습니다');
      }
    }
  };

  // Handle drag events for text files
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // dropZone 바깥으로 나갈 때만 isDragging을 false로 설정
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const textContents: string[] = [];

    for (const file of files) {
      // 텍스트 파일인지 확인
      const isTextFile =
        file.type.startsWith('text/') ||
        file.name.endsWith('.txt') ||
        file.name.endsWith('.md') ||
        file.name.endsWith('.json') ||
        file.name.endsWith('.js') ||
        file.name.endsWith('.ts') ||
        file.name.endsWith('.tsx') ||
        file.name.endsWith('.jsx') ||
        file.name.endsWith('.css') ||
        file.name.endsWith('.html') ||
        file.name.endsWith('.xml') ||
        file.name.endsWith('.yaml') ||
        file.name.endsWith('.yml') ||
        file.name.endsWith('.py') ||
        file.name.endsWith('.java') ||
        file.name.endsWith('.c') ||
        file.name.endsWith('.cpp') ||
        file.name.endsWith('.h') ||
        file.name.endsWith('.sh') ||
        file.name.endsWith('.sql') ||
        file.name.endsWith('.csv');

      if (isTextFile) {
        try {
          const text = await file.text();
          textContents.push(`📄 **${file.name}**\n\`\`\`\n${text}\n\`\`\``);
        } catch (error) {
          console.error(`Failed to read file ${file.name}:`, error);
          setError(`파일을 읽는 중 오류가 발생했습니다: ${file.name}`);
        }
      } else if (file.type.startsWith('image/')) {
        // 이미지 파일 처리
        try {
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = event.target?.result as string;
            const newImage: ImageAttachment = {
              id: `drop-${Date.now()}-${Math.random()}`,
              path: '',
              filename: file.name,
              mimeType: file.type,
              base64,
            };
            setSelectedImages((prev) => [...prev, newImage]);
          };
          reader.readAsDataURL(file);
        } catch (error) {
          console.error(`Failed to read image ${file.name}:`, error);
        }
      } else {
        setError(`지원하지 않는 파일 형식입니다: ${file.name}`);
      }
    }

    if (textContents.length > 0) {
      const combinedText = textContents.join('\n\n');
      setInput((prev) => (prev ? `${prev}\n\n${combinedText}` : combinedText));
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && selectedImages.length === 0) || isStreaming) {
      return;
    }

    setError(null);

    // Create conversation if none exists
    if (!activeConversationId) {
      await createConversation();
    }

    // Capture conversation ID for background execution
    const targetConversationId = activeConversationId!;

    const userMessage = input.trim();
    const messagImages = selectedImages.length > 0 ? [...selectedImages] : undefined;
    setInput('');
    setSelectedImages([]);

    // Execute streaming in background (don't await - allows user to switch conversations)
    executeStreamingInBackground(targetConversationId, userMessage, messagImages);
  };

  const executeStreamingInBackground = async (
    conversationId: string,
    userMessage: string,
    messagImages?: ImageAttachment[]
  ) => {

    // Variables for streaming animation
    let accumulatedContent = '';
    let accumulatedMessage: Partial<Message> = {};
    let pendingUpdate = false;
    let rafId: number | null = null;

    try {
      // Add user message with images if present (specify conversation ID)
      await addMessage({
        role: 'user',
        content: userMessage,
        images: messagImages,
      }, conversationId);

      // Prepare messages for LLM (include history)
      const allMessages = [
        ...messages,
        {
          id: 'temp',
          role: 'user' as const,
          content: userMessage,
          created_at: Date.now(),
          images: messagImages, // 이미지 포함!
        },
      ];

      // Create empty assistant message for streaming (specify conversation ID)
      const assistantMessage = await addMessage({
        role: 'assistant',
        content: '',
      }, conversationId);

      const assistantMessageId = assistantMessage.id;

      // Use conversation-specific streaming state
      startStreaming(conversationId, assistantMessageId);

      // Create abort controller for cancellation
      abortControllerRef.current = new AbortController();

      // requestAnimationFrame을 사용한 부드러운 UI 업데이트
      const scheduleUpdate = (messageUpdates: Partial<Message>, force = false) => {
        accumulatedMessage = { ...accumulatedMessage, ...messageUpdates };

        if (force) {
          // 강제 업데이트 (스트리밍 완료 시)
          if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          updateMessage(assistantMessageId, accumulatedMessage, conversationId);
          pendingUpdate = false;
          return;
        }

        // 이미 예약된 업데이트가 있으면 스킵 (다음 프레임에서 처리됨)
        if (pendingUpdate) {
          return;
        }

        pendingUpdate = true;
        rafId = requestAnimationFrame(() => {
          updateMessage(assistantMessageId, accumulatedMessage, conversationId);
          pendingUpdate = false;
          rafId = null;
        });
      };

      // Stream response from LangGraph (Electron) or WebLLMClient (Web)
      try {
        if (isElectron()) {
          // Electron: LangGraph 사용
          for await (const event of GraphFactory.stream(graphType, allMessages)) {
            if (abortControllerRef.current?.signal.aborted) {
              break;
            }

            // Show graph node execution status for Agent mode
            if (graphType === 'agent' && event.type === 'node') {
              let nodeStatusMessage = '';

              // Generate node: Show AI thinking
              if (event.node === 'generate') {
                nodeStatusMessage = '🤖 AI가 응답을 생성하고 있습니다...';

                // If there are tool calls, show them
                if (event.data?.messages?.[0]?.tool_calls) {
                  const toolNames = event.data.messages[0].tool_calls
                    .map((tc: any) => tc.name)
                    .join(', ');
                  nodeStatusMessage = `🤖 AI가 도구 사용을 계획하고 있습니다: ${toolNames}`;
                }
              }

              // Tools node: Show tool execution
              else if (event.node === 'tools') {
                const toolResults = event.data?.toolResults || [];
                if (toolResults.length > 0) {
                  const toolNames = toolResults.map((tr: any) => tr.toolName).join(', ');
                  const hasError = toolResults.some((tr: any) => tr.error);
                  const hasImageGen = toolNames.includes('generate_image');

                  if (hasImageGen) {
                    // 이미지 생성 완료 또는 오류
                    setImageGenProgress(null);
                  }

                  if (hasError) {
                    nodeStatusMessage = `⚠️ 도구 실행 중 일부 오류 발생: ${toolNames}`;
                  } else {
                    nodeStatusMessage = `✅ 도구 실행 완료: ${toolNames}`;
                  }
                } else {
                  // 도구 실행 시작 - 메시지에서 이미지 생성 여부 확인
                  const recentMessages = event.data?.messages || [];
                  const hasImageGenCall = recentMessages.some((msg: any) =>
                    msg.tool_calls?.some((tc: any) => tc.name === 'generate_image')
                  );

                  if (hasImageGenCall) {
                    nodeStatusMessage = '🎨 이미지를 생성하고 있습니다...';
                    setImageGenProgress('🎨 이미지 생성 요청을 준비하는 중...');
                  } else {
                    nodeStatusMessage = '🔧 도구를 실행하고 있습니다...';
                  }
                }
              }

              // Reporter node: Final summary
              else if (event.node === 'reporter') {
                nodeStatusMessage = '📊 최종 결과를 정리하고 있습니다...';
              }

              if (nodeStatusMessage) {
                console.log(`[InputBox] Node execution: ${event.node} - ${nodeStatusMessage}`);
                scheduleUpdate({ content: nodeStatusMessage });
              }
            }

            // 각 노드의 실행 결과에서 메시지 업데이트
            if (event.type === 'node' && event.data?.messages) {
              const newMessages = event.data.messages;
              if (newMessages && newMessages.length > 0) {
                const lastMessage = newMessages[newMessages.length - 1];
                if (lastMessage.role === 'assistant') {
                  // Only show actual content (node status already shown above)
                  if (lastMessage.content && !lastMessage.tool_calls) {
                    const { content, referenced_documents } = lastMessage;
                    scheduleUpdate({ content, referenced_documents });
                  }
                }
              }
            }

            // Reporter node: Handle final status messages (error, max iterations, etc.)
            if (event.type === 'node' && event.node === 'reporter' && event.data?.messages) {
              const reporterMessages = event.data.messages;
              if (reporterMessages && reporterMessages.length > 0) {
                const reportMessage = reporterMessages[reporterMessages.length - 1];
                if (reportMessage.content) {
                  // Append reporter message to existing content
                  const existingContent = accumulatedMessage.content || '';
                  const newContent = existingContent
                    ? `${existingContent}\n\n${reportMessage.content}`
                    : reportMessage.content;
                  scheduleUpdate({ content: newContent });
                }
              }
            }

            // Extract generated images from tool results
            if (event.type === 'node' && event.node === 'tools' && event.data?.toolResults) {
              const toolResults = event.data.toolResults;
              const generatedImages: ImageAttachment[] = [];

              console.log('[InputBox] Processing tool results:', toolResults);

              // Show tool completion status
              const toolNames = toolResults.map((tr: any) => tr.toolName).join(', ');
              const hasImageGeneration = toolResults.some((tr: any) => tr.toolName === 'generate_image');

              // 이미지 생성 진행 상황 초기화
              if (hasImageGeneration) {
                setImageGenProgress(null);
              }

              const statusMessage = `✅ 도구 실행 완료: ${toolNames}\n\n답변을 생성하고 있습니다...`;
              scheduleUpdate({ content: statusMessage });

              for (const toolResult of toolResults) {
                if (toolResult.toolName === 'generate_image' && toolResult.result) {
                  try {
                    let resultData;

                    // Safe JSON parsing with better error handling
                    if (typeof toolResult.result === 'string') {
                      try {
                        // Try to parse as JSON
                        resultData = JSON.parse(toolResult.result);
                      } catch (parseError) {
                        // If parsing fails, log and skip
                        console.error('[InputBox] JSON parse error for tool result:', parseError);
                        console.error('[InputBox] Raw result:', toolResult.result.substring(0, 200));
                        continue;
                      }
                    } else {
                      // Already an object
                      resultData = toolResult.result;
                    }

                    console.log('[InputBox] Parsed image generation result:', resultData);

                    if (resultData.success && resultData.imageBase64) {
                      generatedImages.push({
                        id: `generated-${Date.now()}-${Math.random()}`,
                        path: '',
                        filename: `Generated: ${resultData.prompt?.substring(0, 30) || 'image'}...`,
                        mimeType: 'image/png',
                        base64: resultData.imageBase64,
                      });
                      console.log('[InputBox] Added generated image to message');
                    }
                  } catch (error) {
                    console.error('[InputBox] Failed to process image generation result:', error);
                  }
                }
              }

              if (generatedImages.length > 0) {
                scheduleUpdate({ images: generatedImages });
              }
            }

            // 에러 처리
            if (event.type === 'error') {
              throw new Error(event.error || 'Graph execution failed');
            }
          }

          // Final update to ensure all content is displayed
          scheduleUpdate({}, true);

          // Save final message to database (use captured conversationId, not activeConversationId)
          if (window.electronAPI && conversationId) {
            const finalMessage: Message = {
              id: assistantMessageId,
              conversation_id: conversationId,
              role: 'assistant',
              content: accumulatedMessage.content || accumulatedContent,
              created_at: Date.now(),
              referenced_documents: accumulatedMessage.referenced_documents,
              images: accumulatedMessage.images, // 생성된 이미지 포함
            };
            await window.electronAPI.chat.saveMessage(finalMessage);
          }
        } else {
          // Web: WebLLMClient 직접 사용
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

          // Final update to ensure all content is displayed
          scheduleUpdate({}, true);
        }

        // Auto-generate title if needed (after first successful response)
        if (conversationId) {
          const currentConversation = conversations.find((c) => c.id === conversationId);
          if (currentConversation && shouldGenerateTitle(currentConversation.title)) {
            // Get all messages including the ones we just added
            const allMessagesForTitle = [
              ...messages,
              { role: 'user' as const, content: userMessage },
              { role: 'assistant' as const, content: accumulatedContent },
            ];

            // Generate title in background (don't await)
            generateConversationTitle(allMessagesForTitle)
              .then((title) => {
                updateConversationTitle(conversationId, title);
              })
              .catch((err) => {
                console.error('Failed to auto-generate title:', err);
              });
          }
        }
      } catch (streamError: any) {
        console.error('Streaming error:', streamError);
        setError(streamError.message || 'Failed to get response from LLM');

        // Update message with error (specify conversation ID)
        updateMessage(assistantMessageId, {
          content: `Error: ${streamError.message || 'Failed to get response'}`,
        }, conversationId);
      }
    } catch (error: any) {
      console.error('Send message error:', error);
      setError(error.message || 'Failed to send message');
    } finally {
      // Cleanup: cancel any pending animation frame
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      // Stop streaming for this conversation
      stopStreaming(conversationId);
      abortControllerRef.current = null;

      // Only restore focus if still on the same conversation
      // (user might have switched to another conversation)
      setTimeout(() => {
        const currentStore = useChatStore.getState();
        if (currentStore.activeConversationId === conversationId) {
          textareaRef.current?.focus();
        }
      }, 0);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      ref={dropZoneRef}
      className={`shrink-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 transition-colors ${
        isDragging ? 'bg-primary/10 border-primary' : ''
      }`}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="mx-auto max-w-3xl px-4 py-4 relative">
        {isDragging && (
          <div className="absolute inset-0 flex items-center justify-center bg-primary/5 border-2 border-dashed border-primary rounded-lg z-10 pointer-events-none">
            <div className="text-center">
              <p className="text-sm font-medium text-primary">텍스트 파일을 여기에 드롭하세요</p>
              <p className="text-xs text-muted-foreground mt-1">.txt, .md, .json, .js, .ts 등</p>
            </div>
          </div>
        )}
        {error && (
          <div className="mb-3 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive border border-destructive/20">
            {error}
          </div>
        )}
        {/* Selected Images Preview */}
        {selectedImages.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {mounted ? (
              <TooltipProvider>
                {selectedImages.map((image, index) => (
                  <Tooltip key={image.id}>
                    <TooltipTrigger asChild>
                      <div className="relative inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm group hover:bg-accent/80 transition-colors">
                        <ImagePlus className="h-3.5 w-3.5" />
                        <span className="font-medium">이미지 #{index + 1}</span>
                        <button
                          onClick={() => handleRemoveImage(image.id)}
                          className="ml-1 rounded-sm opacity-70 hover:opacity-100 transition-opacity"
                          disabled={isStreaming}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="p-0 border-0 shadow-lg">
                      <div className="max-w-xs">
                        <img
                          src={image.base64}
                          alt={image.filename}
                          className="rounded-md max-h-48 w-auto"
                        />
                        <div className="p-2 text-xs text-muted-foreground bg-background/95 backdrop-blur">
                          {image.filename}
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </TooltipProvider>
            ) : (
              // Fallback for SSR - no tooltip
              selectedImages.map((image, index) => (
                <div key={image.id} className="relative inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm group hover:bg-accent/80 transition-colors">
                  <ImagePlus className="h-3.5 w-3.5" />
                  <span className="font-medium">이미지 #{index + 1}</span>
                  <button
                    onClick={() => handleRemoveImage(image.id)}
                    className="ml-1 rounded-sm opacity-70 hover:opacity-100 transition-opacity"
                    disabled={isStreaming}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
        <div className="relative flex items-end gap-2 rounded-2xl border border-input bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 transition-all">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={selectedImages.length > 0 ? '이미지에 대한 질문을 입력하세요...' : '메시지를 입력하세요...'}
            className="flex-1 min-h-[52px] max-h-[200px] resize-none border-0 bg-transparent px-4 py-3 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60"
            disabled={isStreaming}
            rows={1}
          />
          <div className="flex items-center gap-1 pb-2 pr-2">
            {/* Image Upload Button */}
            {mounted && isElectron() && (
              <Button
                onClick={handleImageSelect}
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl shrink-0"
                title="이미지 추가"
                disabled={isStreaming}
              >
                <ImagePlus className="h-4 w-4" />
              </Button>
            )}
            {/* Image Generation Toggle - Only show if ComfyUI is available */}
            {mounted && isElectron() && comfyUIAvailable && (
              <Button
                onClick={() => setImageGenerationEnabled(!imageGenerationEnabled)}
                variant="ghost"
                size="icon"
                className={`h-9 w-9 rounded-xl shrink-0 transition-colors ${
                  imageGenerationEnabled
                    ? 'bg-primary/10 text-primary hover:bg-primary/20'
                    : ''
                }`}
                title={imageGenerationEnabled ? '이미지 생성 비활성화' : '이미지 생성 활성화'}
                disabled={isStreaming}
              >
                <Sparkles className="h-4 w-4" />
              </Button>
            )}
            {/* Graph Type Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-xl shrink-0"
                  title={`모드: ${graphType === 'chat' ? '기본 채팅' : graphType === 'rag' ? 'RAG' : 'Agent'}`}
                >
                  {graphType === 'chat' && <MessageSquare className="h-4 w-4" />}
                  {graphType === 'rag' && <Database className="h-4 w-4" />}
                  {graphType === 'agent' && <Wrench className="h-4 w-4" />}
                  <ChevronDown className="h-3 w-3 ml-0.5 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-48">
                <DropdownMenuItem
                  onClick={() => setGraphType('chat')}
                  className={graphType === 'chat' ? 'bg-accent' : ''}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  <div className="flex flex-col">
                    <span className="font-medium">기본 채팅</span>
                    <span className="text-xs text-muted-foreground">일반 LLM 대화</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setGraphType('rag')}
                  className={graphType === 'rag' ? 'bg-accent' : ''}
                >
                  <Database className="mr-2 h-4 w-4" />
                  <div className="flex flex-col">
                    <span className="font-medium">RAG</span>
                    <span className="text-xs text-muted-foreground">문서 기반 대화</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setGraphType('agent')}
                  className={graphType === 'agent' ? 'bg-accent' : ''}
                >
                  <Wrench className="mr-2 h-4 w-4" />
                  <div className="flex flex-col">
                    <span className="font-medium">Agent</span>
                    <span className="text-xs text-muted-foreground">MCP 도구 사용</span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Send/Stop Button */}
            {isStreaming ? (
              <Button
                onClick={handleStop}
                variant="destructive"
                size="icon"
                className="h-9 w-9 rounded-xl shrink-0"
                title="중지 (Esc)"
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSend}
                disabled={!input.trim() && selectedImages.length === 0}
                size="icon"
                className="h-9 w-9 rounded-xl shrink-0 bg-primary hover:bg-primary/90 disabled:opacity-50"
                title="전송 (Enter)"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        {/* Image Generation Progress */}
        {imageGenProgress && (
          <div className="mt-2 flex items-center justify-center gap-2 text-xs text-primary">
            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
            <span>{imageGenProgress}</span>
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground/70 text-center">
          {isStreaming
            ? '응답 생성 중... Esc 키를 눌러 중지할 수 있습니다'
            : 'Enter로 전송 · Shift+Enter로 줄바꿈 · Ctrl+V로 이미지 붙여넣기'}
        </p>
      </div>
    </div>
  );
}
