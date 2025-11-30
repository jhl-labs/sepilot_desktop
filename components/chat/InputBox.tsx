'use client';

import { useState, KeyboardEvent, useRef, useEffect, useCallback } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Send,
  Square,
  ImagePlus,
  X,
  Sparkles,
  ChevronDown,
  Zap,
  Brain,
  Network,
  Database,
  Wrench,
  Code,
  Check,
} from 'lucide-react';
import { useChatStore } from '@/lib/store/chat-store';
import { initializeLLMClient } from '@/lib/llm/client';
import { initializeComfyUIClient } from '@/lib/comfyui/client';
import { generateConversationTitle, shouldGenerateTitle } from '@/lib/chat/title-generator';
import { isElectron } from '@/lib/platform';
import { getWebLLMClient, configureWebLLMClient } from '@/lib/llm/web-client';
import { isTextFile } from '@/lib/utils';
import {
  ImageAttachment,
  Message,
  ToolCall,
  ComfyUIConfig,
  NetworkConfig,
  LLMConfig,
  QuickInputMessageData,
} from '@/types';
import { ToolApprovalDialog } from './ToolApprovalDialog';
import { ImageGenerationProgressBar } from './ImageGenerationProgressBar';
import { LLMStatusBar, type ToolInfo } from './LLMStatusBar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function InputBox() {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedImages, setSelectedImages] = useState<ImageAttachment[]>([]);
  const [comfyUIAvailable, setComfyUIAvailable] = useState(false);
  const [comfyUIConfig, setComfyUIConfig] = useState<ComfyUIConfig | null>(null);
  const [llmConfig, setLlmConfig] = useState<LLMConfig | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [quickSystemMessage, setQuickSystemMessage] = useState<string | null>(null);
  const [showPersonaAutocomplete, setShowPersonaAutocomplete] = useState(false);
  const [personaAutocompleteIndex, setPersonaAutocompleteIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);

  const {
    addMessage,
    updateMessage,
    activeConversationId,
    createConversation,
    streamingConversations,
    startStreaming,
    stopStreaming,
    messages,
    thinkingMode,
    enableRAG,
    enableTools,
    setThinkingMode,
    setEnableRAG,
    setEnableTools,
    getGraphConfig,
    conversations,
    updateConversationTitle,
    pendingToolApproval,
    setPendingToolApproval,
    clearPendingToolApproval,
    setAlwaysApproveToolsForSession,
    imageGenerationProgress,
    setImageGenerationProgress,
    clearImageGenerationProgress,
    enableImageGeneration,
    setEnableImageGeneration,
    personas,
    activePersonaId,
    setActivePersona,
  } = useChatStore();

  // Get current conversation's persona (conversation-specific persona takes precedence)
  const currentConversation = activeConversationId
    ? conversations.find((c) => c.id === activeConversationId)
    : null;
  const conversationPersonaId = currentConversation?.personaId;
  const effectivePersonaId = conversationPersonaId || activePersonaId;
  const activePersona = personas.find((p) => p.id === effectivePersonaId);
  const personaSystemPrompt = activePersona?.systemPrompt || null;

  // Detect slash command for persona switching
  const personaCommand = input.match(/^\/persona\s+(.*)$/);
  const filteredPersonas = personaCommand
    ? personas.filter(
        (p) =>
          p.name.toLowerCase().includes(personaCommand[1].toLowerCase()) ||
          p.description.toLowerCase().includes(personaCommand[1].toLowerCase())
      )
    : [];

  // Determine if any conversation is currently streaming
  const isStreaming = activeConversationId
    ? streamingConversations.has(activeConversationId)
    : false;

  // Get image generation progress for current conversation
  const currentImageGenProgress = activeConversationId
    ? imageGenerationProgress.get(activeConversationId)
    : undefined;

  // Handle LLM config update from LLMStatusBar
  const handleConfigUpdate = async (updatedConfig: LLMConfig) => {
    setLlmConfig(updatedConfig);

    // Save to storage
    try {
      if (isElectron() && window.electronAPI) {
        // Load current config and update only llm
        const currentConfig = await window.electronAPI.config.load();
        if (currentConfig.success && currentConfig.data) {
          const mergedConfig = { ...currentConfig.data, llm: updatedConfig };
          await window.electronAPI.config.save(mergedConfig);
        }
        initializeLLMClient(updatedConfig);
      } else {
        localStorage.setItem('sepilot_llm_config', JSON.stringify(updatedConfig));
        configureWebLLMClient(updatedConfig);
      }
      // Dispatch event to notify other components
      window.dispatchEvent(
        new CustomEvent('sepilot:config-updated', { detail: { llm: updatedConfig } })
      );
    } catch (error) {
      console.error('Failed to save LLM config:', error);
    }
  };

  // Handle compact conversation (summarize older messages)
  const handleCompact = async () => {
    // TODO: Implement context compaction/summarization
  };

  // Set mounted state to avoid hydration mismatch with Tooltip
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load available tools (MCP + Chat-specific builtin tools only)
  useEffect(() => {
    const loadTools = async () => {
      if (!isElectron() || !window.electronAPI) {
        return;
      }

      try {
        // Get all tools from ToolRegistry
        const allToolsResult = await window.electronAPI.mcp.getAllTools();
        const allTools: ToolInfo[] =
          allToolsResult.success && allToolsResult.data
            ? allToolsResult.data.map((tool: any) => ({
                name: tool.name,
                description: tool.description,
                serverName: tool.serverName,
              }))
            : [];

        // Chat-specific tool names (Coding Agent only)
        const chatToolNames = new Set([
          'file_read',
          'file_write',
          'file_edit',
          'file_list',
          'command_execute',
          'grep_search',
        ]);

        // Filter: MCP tools + Chat-specific builtin tools only
        // Exclude Browser Agent tools (browser_*) and Editor Agent tools
        const filteredTools = allTools.filter((tool) => {
          // Include all MCP tools (non-builtin)
          if (tool.serverName !== 'builtin') {
            return true;
          }
          // Include only Chat-specific builtin tools
          return chatToolNames.has(tool.name);
        });

        setTools(filteredTools);
      } catch (error) {
        console.error('[InputBox] Failed to load tools:', error);
      }
    };

    loadTools();
  }, []);

  // Listen for file drop events from ChatArea
  useEffect(() => {
    const handleFileDrop = (
      e: CustomEvent<{
        textContents: string[];
        imageFiles: { filename: string; mimeType: string; base64: string }[];
      }>
    ) => {
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
              setLlmConfig(result.data.llm);
            }

            // Initialize ComfyUI client
            if (result.data.comfyUI) {
              initializeComfyUIClient(result.data.comfyUI);
              // Store ComfyUI config for IPC
              setComfyUIConfig(result.data.comfyUI);
              // Check if ComfyUI is enabled and has httpUrl configured
              const isAvailable = result.data.comfyUI.enabled && !!result.data.comfyUI.httpUrl;
              setComfyUIAvailable(isAvailable);
            } else {
              setComfyUIAvailable(false);
              setComfyUIConfig(null);
            }
          }
        } else {
          // Web: localStorage에서 로드
          const savedConfig = localStorage.getItem('sepilot_llm_config');
          if (savedConfig) {
            const config = JSON.parse(savedConfig);
            configureWebLLMClient(config);
            setLlmConfig(config);
          }

          // Also try to load ComfyUI config from localStorage
          const savedComfyConfig = localStorage.getItem('sepilot_comfyui_config');
          if (savedComfyConfig) {
            const config = JSON.parse(savedComfyConfig);
            initializeComfyUIClient(config);
            setComfyUIConfig(config);
            const isAvailable = config.enabled && !!config.httpUrl;
            setComfyUIAvailable(isAvailable);
          } else {
            setComfyUIAvailable(false);
            setComfyUIConfig(null);
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
          setComfyUIConfig(config);
          const isAvailable = config.enabled && !!config.httpUrl;
          setComfyUIAvailable(isAvailable);
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
        setLlmConfig(llm);
        if (isElectron() && window.electronAPI) {
          // Electron: IPC를 통해 LLM 클라이언트 재초기화
          initializeLLMClient(llm);
        } else {
          // Web: WebLLMClient 재초기화
          configureWebLLMClient(llm);
        }
      }

      // ComfyUI 설정 업데이트
      if (comfyUI) {
        initializeComfyUIClient(comfyUI);
        setComfyUIConfig(comfyUI);
        const isAvailable = comfyUI.enabled && !!comfyUI.httpUrl;
        setComfyUIAvailable(isAvailable);
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

  // Show/hide persona autocomplete based on input
  useEffect(() => {
    if (personaCommand && filteredPersonas.length > 0) {
      setShowPersonaAutocomplete(true);
      setPersonaAutocompleteIndex(0);
    } else {
      setShowPersonaAutocomplete(false);
    }
  }, [input, personaCommand, filteredPersonas.length]);

  // Auto-switch to Instant mode when images are selected or image generation is enabled
  // (Multimodal models and image generation require using agent.ts which works best with Instant mode)
  useEffect(() => {
    if ((selectedImages.length > 0 || enableImageGeneration) && thinkingMode !== 'instant') {
      setThinkingMode('instant');
    }
  }, [selectedImages, enableImageGeneration, thinkingMode, setThinkingMode]);

  // Stop streaming handler
  const handleStop = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Use activeConversationId - store's streamingConversations tracks which conversations are streaming
    const conversationId = activeConversationId;

    if (conversationId) {
      // Abort streaming in Main Process
      if (isElectron() && typeof window !== 'undefined' && window.electronAPI?.langgraph) {
        try {
          await window.electronAPI.langgraph.abort(conversationId);
        } catch (error) {
          console.error('[InputBox] Failed to abort stream:', error);
        }
        window.electronAPI.langgraph.removeAllStreamListeners();
      }

      // Stop streaming UI state
      stopStreaming(conversationId);

      // Reset abort controller
      abortControllerRef.current = null;
    } else {
      console.warn('[InputBox] No active conversationId found for abort');
    }
  }, [stopStreaming, activeConversationId]);

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

  // Handle Quick Input message (from global shortcut)
  useEffect(() => {
    const handleQuickInputMessage = async (e: Event) => {
      const customEvent = e as CustomEvent<QuickInputMessageData>;
      const messageData = customEvent.detail;

      if (messageData && messageData.userMessage.trim()) {
        // Save system message if present (for Quick Question)
        if (messageData.systemMessage) {
          setQuickSystemMessage(messageData.systemMessage);
        }

        // 입력창에 사용자 메시지 설정
        setInput(messageData.userMessage);

        // 상태 업데이트 대기 후 send 버튼 클릭
        setTimeout(() => {
          const sendButton = document.querySelector('[data-send-button]') as HTMLButtonElement;
          if (sendButton && !sendButton.disabled) {
            sendButton.click();
          }
        }, 200);
      }
    };

    window.addEventListener('sepilot:quick-input-message', handleQuickInputMessage);

    return () => {
      window.removeEventListener('sepilot:quick-input-message', handleQuickInputMessage);
    };
  }, []);

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
    if (!items) {
      return;
    }

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

    if (imageFiles.length === 0) {
      return;
    }

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
    if (files.length === 0) {
      return;
    }

    const textContents: string[] = [];

    for (const file of files) {
      // 텍스트 파일인지 확인
      if (isTextFile(file)) {
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

    // Create conversation if none exists and get the ID
    let targetConversationId = activeConversationId;
    if (!targetConversationId) {
      targetConversationId = await createConversation();
    }

    const userMessage = input.trim();
    const messagImages = selectedImages.length > 0 ? [...selectedImages] : undefined;
    const systemMessage = quickSystemMessage; // Capture current system message
    setInput('');
    setSelectedImages([]);
    // NOTE: Don't clear quickSystemMessage here - it will be cleared in executeStreamingInBackground's finally block
    // This prevents clearing it too early when user sends multiple messages quickly

    // Execute streaming in background (don't await - allows user to switch conversations)
    executeStreamingInBackground(targetConversationId, userMessage, messagImages, systemMessage);
  };

  const executeStreamingInBackground = async (
    conversationId: string,
    userMessage: string,
    messagImages?: ImageAttachment[],
    systemMessage?: string | null
  ) => {
    // Note: Don't validate conversation existence here as it may not be in the store yet
    // due to async state updates. The conversationId is already validated in handleSend.

    // Variables for streaming animation
    let accumulatedContent = '';
    let accumulatedMessage: Partial<Message> = {};
    let rafId: number | null = null;

    // Track cleanup functions for proper memory management
    let cleanupEventHandler: (() => void) | null = null;
    let cleanupDoneHandler: (() => void) | null = null;
    let cleanupErrorHandler: (() => void) | null = null;

    try {
      // Add user message with images if present (specify conversation ID)
      await addMessage(
        {
          role: 'user',
          content: userMessage,
          images: messagImages,
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
          images: messagImages, // 이미지 포함!
        },
      ];

      // Debug: Log messages being sent to LLM
      if (systemMessage) {
        console.log('[Quick Question] System message:', systemMessage);
        console.log('[Quick Question] Total messages:', allMessages.length);
        console.log('[Quick Question] First message role:', allMessages[0]?.role);
      }

      // Create empty assistant message for streaming (specify conversation ID)
      const assistantMessage = await addMessage(
        {
          role: 'assistant',
          content: '',
        },
        conversationId
      );

      const assistantMessageId = assistantMessage.id;

      // Use conversation-specific streaming state
      startStreaming(conversationId, assistantMessageId);

      // Create abort controller for cancellation
      abortControllerRef.current = new AbortController();

      // 부드러운 UI 업데이트를 위한 RAF 기반 배칭
      // 모든 청크를 즉시 누적하고, RAF로 렌더링을 배칭
      let updateScheduled = false;

      const scheduleUpdate = (messageUpdates: Partial<Message>, force = false) => {
        accumulatedMessage = { ...accumulatedMessage, ...messageUpdates };

        if (force) {
          // 강제 업데이트 (스트리밍 완료 시)
          if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          updateMessage(assistantMessageId, accumulatedMessage, conversationId);
          updateScheduled = false;
          return;
        }

        // RAF가 이미 예약되어 있으면, 다음 프레임에서 최신 상태로 업데이트됨
        if (updateScheduled) {
          return;
        }

        updateScheduled = true;
        rafId = requestAnimationFrame(() => {
          updateMessage(assistantMessageId, accumulatedMessage, conversationId);
          updateScheduled = false;
          rafId = null;
        });
      };

      // Stream response from IPC (Electron) or Web
      try {
        if (isElectron() && typeof window !== 'undefined' && window.electronAPI?.langgraph) {
          // Electron: Use IPC to stream LangGraph responses (CORS 없음)
          const graphConfig = getGraphConfig();

          // Setup stream event listeners
          // 이벤트에 포함된 conversationId로 필터링하여 다른 대화의 이벤트 무시
          cleanupEventHandler = window.electronAPI.langgraph.onStreamEvent((event) => {
            try {
              // Guard: Check if event exists (stream may send null on completion)
              if (!event) {
                // Silently ignore null events - this is expected at stream end
                return;
              }

              // Filter events by conversationId - ignore events from other conversations
              if (event.conversationId && event.conversationId !== conversationId) {
                return;
              }

              if (abortControllerRef.current?.signal.aborted) {
                return;
              }

              // Handle real-time streaming chunks from LLM
              if (event.type === 'streaming' && event.chunk) {
                accumulatedContent += event.chunk;
                scheduleUpdate({ content: accumulatedContent });
                return;
              }

              // Handle image generation progress
              if (event.type === 'image_progress' && event.progress) {
                const progress = event.progress;

                // Update store with image generation progress
                setImageGenerationProgress({
                  conversationId,
                  messageId: assistantMessageId,
                  status: progress.status,
                  message: progress.message,
                  progress: progress.progress || 0,
                  currentStep: progress.currentStep,
                  totalSteps: progress.totalSteps,
                });

                // Update UI with progress status
                if (progress.status === 'executing' || progress.status === 'queued') {
                  // Append progress message to existing content
                  scheduleUpdate({
                    content: `${accumulatedMessage.content || ''}\n\n${progress.message}`,
                  });
                } else if (progress.status === 'completed') {
                  clearImageGenerationProgress(conversationId);
                } else if (progress.status === 'error') {
                  clearImageGenerationProgress(conversationId);
                  // Append error message to existing content
                  scheduleUpdate({
                    content: `${accumulatedMessage.content || ''}\n\n❌ 이미지 생성 오류: ${progress.message}`,
                  });
                }
                return;
              }

              // Handle tool approval request (Human-in-the-loop)
              if (event.type === 'tool_approval_request') {
                console.log('[InputBox] Tool approval request received:', event.toolCalls);

                // Type guard - ensure required fields exist
                if (!event.conversationId || !event.messageId || !event.toolCalls) {
                  console.error('[InputBox] Invalid tool approval request event');
                  return;
                }

                // Auto-approve if session-wide approval is enabled (Claude Code style)
                const currentStore = useChatStore.getState();
                if (currentStore.alwaysApproveToolsForSession) {
                  console.log('[InputBox] Auto-approving tools (session-wide approval enabled)');
                  (async () => {
                    try {
                      if (isElectron() && window.electronAPI?.langgraph && event.conversationId) {
                        await window.electronAPI.langgraph.respondToolApproval(
                          event.conversationId,
                          true
                        );
                      }
                    } catch (error) {
                      console.error('[InputBox] Failed to auto-approve tools:', error);
                    }
                  })();
                  return;
                }

                setPendingToolApproval({
                  conversationId: event.conversationId,
                  messageId: event.messageId,
                  toolCalls: event.toolCalls,
                  timestamp: Date.now(),
                });
                // Append approval waiting message to existing content
                scheduleUpdate({
                  content: `${accumulatedMessage.content || ''}\n\n🔔 도구 실행 승인을 기다리는 중...`,
                });
                return;
              }

              // Handle tool approval result
              if (event.type === 'tool_approval_result') {
                console.log('[InputBox] Tool approval result:', event.approved);
                clearPendingToolApproval();
                if (!event.approved) {
                  scheduleUpdate({ content: '❌ 도구 실행이 거부되었습니다.' });
                }
                return;
              }

              // Show graph node execution status for Agent mode (when tools are enabled)
              if (enableTools && event.type === 'node') {
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
                      clearImageGenerationProgress(conversationId);
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
                      setImageGenerationProgress({
                        conversationId,
                        messageId: assistantMessageId,
                        status: 'queued',
                        message: '🎨 이미지 생성 요청을 준비하는 중...',
                        progress: 0,
                      });
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
                  // Append to existing content instead of replacing it
                  scheduleUpdate({
                    content: `${accumulatedMessage.content || ''}\n\n${nodeStatusMessage}`,
                  });
                }
              }

              // 각 노드의 실행 결과에서 메시지 업데이트
              // Coding Agent의 모든 과정을 Claude Code 스타일로 표시
              if (event.type === 'node' && event.data?.messages) {
                const allMessages = event.data.messages;
                if (allMessages && allMessages.length > 0) {
                  // Convert all messages to a single display content (Claude Code style)
                  let displayContent = '';

                  for (let i = 0; i < allMessages.length; i++) {
                    const msg = allMessages[i];

                    // Skip user messages (already displayed separately)
                    if (msg.role === 'user') {
                      continue;
                    }

                    // Assistant message with tool calls - Only show thinking, not tool names
                    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
                      if (msg.content) {
                        // Truncate long thinking content
                        const thinkingContent =
                          msg.content.length > 300
                            ? `${msg.content.substring(0, 300)}...`
                            : msg.content;
                        displayContent += `💭 ${thinkingContent}\n\n`;
                      }
                      // Don't show tool calls here - they'll be shown with results
                      continue;
                    }

                    // Tool result messages - Show tool call + result together
                    if (msg.role === 'tool' && msg.tool_call_id) {
                      const toolName = msg.name || 'tool';

                      // Find the corresponding tool call to get arguments
                      let toolArgs: any = null;
                      for (let j = i - 1; j >= 0; j--) {
                        const prevMsg = allMessages[j];
                        if (prevMsg.role === 'assistant' && prevMsg.tool_calls) {
                          const toolCall = prevMsg.tool_calls.find(
                            (tc: any) => tc.id === msg.tool_call_id
                          );
                          if (toolCall) {
                            toolArgs = toolCall.arguments;
                            break;
                          }
                        }
                      }

                      // Check if there's an error in the content
                      const hasError =
                        msg.content &&
                        (msg.content.toLowerCase().includes('error:') ||
                          msg.content.toLowerCase().includes('failed to') ||
                          msg.content.toLowerCase().includes('enoent') ||
                          msg.content.toLowerCase().includes('eacces'));

                      // Start with tool name and args
                      displayContent += `🔧 ${toolName}`;
                      if (toolArgs) {
                        if (toolArgs.command) {
                          displayContent += ` \`${toolArgs.command}\``;
                        } else if (toolArgs.path) {
                          displayContent += ` \`${toolArgs.path}\``;
                        } else if (toolArgs.pattern) {
                          displayContent += ` \`${toolArgs.pattern}\``;
                        }
                      }
                      displayContent += '\n';

                      if (hasError) {
                        // Show error details
                        const errorLines = msg.content.split('\n');
                        const linesToShow = errorLines.slice(0, 10);
                        let errorMsg = linesToShow.join('\n');

                        if (errorMsg.length > 800) {
                          errorMsg = `${errorMsg.substring(0, 800)}\n... (truncated)`;
                        }

                        const indentedError = errorMsg
                          .split('\n')
                          .map((line: string) => `   ❌ ${line}`)
                          .join('\n');
                        displayContent += `${indentedError}\n\n`;
                      } else {
                        // Show success with summary
                        let summary = '';

                        if (toolName === 'file_write' || toolName === 'file_edit') {
                          // Show file modification summary
                          if (toolArgs?.path) {
                            summary = `Modified ${toolArgs.path}`;
                            if (msg.content.includes('lines changed')) {
                              const match = msg.content.match(/(\d+)\s+lines?\s+changed/);
                              if (match) {
                                summary = `${match[1]} lines changed`;
                              }
                            }
                          } else {
                            summary = msg.content.split('\n')[0].substring(0, 60);
                          }
                        } else if (toolName === 'file_read') {
                          const lines = msg.content.split('\n').length;
                          summary = `Read ${lines} lines`;
                        } else if (toolName === 'file_list') {
                          const files = msg.content
                            .split('\n')
                            .filter((l: string) => l.trim()).length;
                          summary = `Found ${files} items`;
                        } else if (toolName === 'command_execute') {
                          // Show stdout (first few lines)
                          const lines = msg.content.split('\n').slice(0, 5);
                          let output = lines.join('\n');
                          if (output.length > 200) {
                            output = `${output.substring(0, 200)}...`;
                          }
                          if (output.trim()) {
                            summary = output;
                          } else {
                            summary = 'Success (no output)';
                          }
                        } else if (toolName === 'grep_search') {
                          const matches = msg.content
                            .split('\n')
                            .filter((l: string) => l.trim()).length;
                          summary = `Found ${matches} matches`;
                        } else {
                          // Generic summary - first line
                          summary = msg.content.split('\n')[0].substring(0, 60);
                        }

                        displayContent += `   ✅ ${summary}\n\n`;
                      }
                      continue;
                    }

                    // Final assistant message (no tool calls)
                    if (
                      msg.role === 'assistant' &&
                      (!msg.tool_calls || msg.tool_calls.length === 0)
                    ) {
                      if (msg.content) {
                        displayContent += `${msg.content}\n\n`;
                      }
                    }
                  }

                  // Update with formatted content
                  scheduleUpdate({
                    content: displayContent.trim(),
                    referenced_documents: allMessages[allMessages.length - 1]?.referenced_documents,
                  });
                }
              }

              // Extract generated images from tool results
              if (event.type === 'node' && event.node === 'tools' && event.data?.toolResults) {
                const toolResults = event.data.toolResults;
                const generatedImages: ImageAttachment[] = [];

                console.log('[InputBox] Processing tool results:', toolResults);

                // Show tool completion status
                const toolNames = toolResults.map((tr: any) => tr.toolName).join(', ');
                const hasImageGeneration = toolResults.some(
                  (tr: any) => tr.toolName === 'generate_image'
                );

                // 이미지 생성 진행 상황 초기화
                if (hasImageGeneration) {
                  clearImageGenerationProgress(conversationId);
                }

                const statusMessage = `✅ 도구 실행 완료: ${toolNames}\n\n답변을 생성하고 있습니다...`;
                // Append to existing content instead of replacing it
                scheduleUpdate({
                  content: `${accumulatedMessage.content || ''}\n\n${statusMessage}`,
                });

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
                          console.error(
                            '[InputBox] Raw result:',
                            toolResult.result.substring(0, 200)
                          );
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
                  // 이미지 생성 완료 후 토글 자동 비활성화
                  setEnableImageGeneration(false);
                  console.log('[InputBox] Image generation completed, disabling toggle');
                }
              }

              // 에러 처리
              if (event.type === 'error') {
                throw new Error(event.error || 'Graph execution failed');
              }
            } catch (parseError) {
              console.error('[InputBox] Failed to parse stream event:', parseError);
            }
          });

          cleanupDoneHandler = window.electronAPI.langgraph.onStreamDone(
            (data?: { conversationId?: string }) => {
              try {
                // Filter by conversationId - ignore done events from other conversations
                if (data?.conversationId && data.conversationId !== conversationId) {
                  return;
                }

                if (abortControllerRef.current?.signal.aborted) {
                  return;
                }

                // Final update to ensure all content is displayed
                scheduleUpdate({}, true);
              } catch (error) {
                console.error('[InputBox] Failed to handle stream done:', error);
              }
            }
          );

          cleanupErrorHandler = window.electronAPI.langgraph.onStreamError(
            (data: { error: string; conversationId?: string }) => {
              // Filter by conversationId - ignore error events from other conversations
              if (data?.conversationId && data.conversationId !== conversationId) {
                return;
              }

              // Guard: Ignore empty error events (may occur after normal stream completion)
              if (!data || !data.error) {
                console.warn('[InputBox] Received empty error event, ignoring');
                return;
              }

              const errorMsg = data.error;
              console.error('[InputBox] Stream error:', errorMsg);
              setError(errorMsg);

              // Update message with error
              updateMessage(
                assistantMessageId,
                {
                  content: `Error: ${errorMsg}`,
                },
                conversationId
              );
            }
          );

          // Start streaming via IPC with conversationId for isolation
          // Pass ComfyUI config and network config for image generation in Main Process
          let networkConfig: NetworkConfig | null = null;
          if (enableImageGeneration && comfyUIConfig) {
            try {
              const networkConfigStr = localStorage.getItem('sepilot_network_config');
              networkConfig = networkConfigStr ? JSON.parse(networkConfigStr) : null;
            } catch (e) {
              console.warn('[InputBox] Failed to parse network config:', e);
            }
          }
          // Get working directory from store for Coding Agent
          const currentStore = useChatStore.getState();
          const workingDirectory = currentStore.workingDirectory;
          await window.electronAPI.langgraph.stream(
            graphConfig,
            allMessages,
            conversationId,
            enableImageGeneration && comfyUIConfig ? comfyUIConfig : undefined,
            enableImageGeneration && networkConfig ? networkConfig : undefined,
            workingDirectory || undefined
          );

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
        updateMessage(
          assistantMessageId,
          {
            content: `Error: ${streamError.message || 'Failed to get response'}`,
          },
          conversationId
        );
      }
    } catch (error: any) {
      console.error('Send message error:', error);
      setError(error.message || 'Failed to send message');
    } finally {
      // Cleanup: cancel any pending animation frame
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      // Cleanup: remove IPC event listeners individually for this conversation
      if (cleanupEventHandler) {
        cleanupEventHandler();
      }
      if (cleanupDoneHandler) {
        cleanupDoneHandler();
      }
      if (cleanupErrorHandler) {
        cleanupErrorHandler();
      }

      // Stop streaming for this conversation
      stopStreaming(conversationId);
      abortControllerRef.current = null;

      // Clear Quick Question system message
      setQuickSystemMessage(null);

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
    // Handle persona autocomplete navigation
    if (showPersonaAutocomplete && filteredPersonas.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setPersonaAutocompleteIndex((prev) => (prev < filteredPersonas.length - 1 ? prev + 1 : 0));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setPersonaAutocompleteIndex((prev) => (prev > 0 ? prev - 1 : filteredPersonas.length - 1));
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const selectedPersona = filteredPersonas[personaAutocompleteIndex];
        if (selectedPersona) {
          setActivePersona(selectedPersona.id);
          setInput('');
          setShowPersonaAutocomplete(false);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowPersonaAutocomplete(false);
        setInput('');
        return;
      }
    }

    // IME composition 중일 때는 Enter 키를 무시 (Mac 한글 입력 문제 해결)
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle tool approval
  const handleToolApprove = useCallback(
    async (toolCalls: ToolCall[]) => {
      if (!pendingToolApproval) {
        return;
      }

      console.log(
        '[InputBox] Approving tools:',
        toolCalls.map((tc) => tc.name)
      );

      try {
        if (isElectron() && window.electronAPI?.langgraph) {
          await window.electronAPI.langgraph.respondToolApproval(
            pendingToolApproval.conversationId,
            true
          );
        }
      } catch (error) {
        console.error('[InputBox] Failed to respond to tool approval:', error);
      }

      clearPendingToolApproval();
    },
    [pendingToolApproval, clearPendingToolApproval]
  );

  // Handle tool rejection
  const handleToolReject = useCallback(async () => {
    if (!pendingToolApproval) {
      return;
    }

    console.log('[InputBox] Rejecting tools');

    try {
      if (isElectron() && window.electronAPI?.langgraph) {
        await window.electronAPI.langgraph.respondToolApproval(
          pendingToolApproval.conversationId,
          false
        );
      }
    } catch (error) {
      console.error('[InputBox] Failed to respond to tool rejection:', error);
    }

    clearPendingToolApproval();
  }, [pendingToolApproval, clearPendingToolApproval]);

  // Handle always approve (session-wide)
  const handleToolAlwaysApprove = useCallback(
    async (_toolCalls: ToolCall[]) => {
      if (!pendingToolApproval) {
        return;
      }

      console.log('[InputBox] Always approving tools for session');

      // Set session-wide auto-approval
      setAlwaysApproveToolsForSession(true);

      // Approve current tools
      try {
        if (isElectron() && window.electronAPI?.langgraph) {
          await window.electronAPI.langgraph.respondToolApproval(
            pendingToolApproval.conversationId,
            true
          );
        }
      } catch (error) {
        console.error('[InputBox] Failed to respond to tool approval:', error);
      }

      clearPendingToolApproval();
    },
    [pendingToolApproval, clearPendingToolApproval, setAlwaysApproveToolsForSession]
  );

  return (
    <>
      {/* Tool Approval Dialog */}
      {pendingToolApproval && (
        <ToolApprovalDialog
          onApprove={handleToolApprove}
          onReject={handleToolReject}
          onAlwaysApprove={handleToolAlwaysApprove}
        />
      )}

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
                            title="이미지 제거"
                            aria-label="이미지 제거"
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
                  <div
                    key={image.id}
                    className="relative inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm group hover:bg-accent/80 transition-colors"
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    <span className="font-medium">이미지 #{index + 1}</span>
                    <button
                      onClick={() => handleRemoveImage(image.id)}
                      className="ml-1 rounded-sm opacity-70 hover:opacity-100 transition-opacity"
                      disabled={isStreaming}
                      title="이미지 제거"
                      aria-label="이미지 제거"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
          <div className="relative flex items-end gap-2 rounded-2xl border border-input bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 transition-all">
            {/* Persona Autocomplete Dropdown */}
            {showPersonaAutocomplete && filteredPersonas.length > 0 && (
              <div
                ref={autocompleteRef}
                className="absolute bottom-full left-0 right-0 mb-2 max-h-[300px] overflow-y-auto rounded-lg border border-input bg-popover shadow-lg z-50"
              >
                <div className="p-2 space-y-1">
                  {filteredPersonas.map((persona, index) => (
                    <button
                      key={persona.id}
                      onClick={() => {
                        setActivePersona(persona.id);
                        setInput('');
                        setShowPersonaAutocomplete(false);
                      }}
                      className={`w-full flex items-center gap-3 p-3 rounded-md text-left transition-colors ${
                        index === personaAutocompleteIndex ? 'bg-accent' : 'hover:bg-accent/50'
                      }`}
                    >
                      <span className="text-2xl flex-shrink-0">{persona.avatar || '🤖'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{persona.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {persona.description}
                        </div>
                      </div>
                      {activePersonaId === persona.id && (
                        <Check className="h-4 w-4 text-primary flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              placeholder={
                selectedImages.length > 0
                  ? '이미지에 대한 질문을 입력하세요...'
                  : '메시지를 입력하세요...'
              }
              className="flex-1 min-h-[52px] max-h-[200px] resize-none border-0 bg-transparent px-4 py-3 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60"
              disabled={isStreaming}
              rows={1}
              aria-label="메시지 입력"
              aria-disabled={isStreaming}
            />
            <div className="flex items-center gap-1 pb-2 pr-2">
              {/* Thinking Mode Selector */}
              {mounted && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-xl shrink-0"
                      title={
                        enableImageGeneration
                          ? '이미지 생성 모드에서는 Instant 모드만 사용 가능합니다'
                          : `사고 모드: ${
                              thinkingMode === 'instant'
                                ? 'Instant'
                                : thinkingMode === 'sequential'
                                  ? 'Sequential'
                                  : thinkingMode === 'tree-of-thought'
                                    ? 'Tree of Thought'
                                    : thinkingMode === 'deep'
                                      ? 'Deep Thinking'
                                      : 'Coding (beta)'
                            }`
                      }
                      disabled={isStreaming || enableImageGeneration}
                    >
                      {thinkingMode === 'instant' && <Zap className="h-4 w-4" />}
                      {thinkingMode === 'sequential' && <Brain className="h-4 w-4" />}
                      {thinkingMode === 'tree-of-thought' && <Network className="h-4 w-4" />}
                      {thinkingMode === 'deep' && <Sparkles className="h-4 w-4" />}
                      {thinkingMode === 'coding' && <Code className="h-4 w-4" />}
                      <ChevronDown className="h-3 w-3 ml-0.5 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" side="top" className="w-56">
                    <DropdownMenuItem
                      onClick={() => setThinkingMode('instant')}
                      className={thinkingMode === 'instant' ? 'bg-accent' : ''}
                    >
                      <Zap className="mr-2 h-4 w-4 text-yellow-500" />
                      <div className="flex flex-col">
                        <span className="font-medium">Instant</span>
                        <span className="text-xs text-muted-foreground">즉시 응답 - 빠른 대화</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setThinkingMode('sequential')}
                      className={thinkingMode === 'sequential' ? 'bg-accent' : ''}
                    >
                      <Brain className="mr-2 h-4 w-4 text-blue-500" />
                      <div className="flex flex-col">
                        <span className="font-medium">Sequential Thinking</span>
                        <span className="text-xs text-muted-foreground">
                          순차적 사고 - 단계별 추론
                        </span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setThinkingMode('tree-of-thought')}
                      className={thinkingMode === 'tree-of-thought' ? 'bg-accent' : ''}
                    >
                      <Network className="mr-2 h-4 w-4 text-purple-500" />
                      <div className="flex flex-col">
                        <span className="font-medium">Tree of Thought</span>
                        <span className="text-xs text-muted-foreground">다중 경로 탐색</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setThinkingMode('deep')}
                      className={thinkingMode === 'deep' ? 'bg-accent' : ''}
                    >
                      <Sparkles className="mr-2 h-4 w-4 text-pink-500" />
                      <div className="flex flex-col">
                        <span className="font-medium">Deep Thinking</span>
                        <span className="text-xs text-muted-foreground">
                          깊은 사고 - 최고 품질 (느림)
                        </span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setThinkingMode('coding');
                        // Coding 모드는 자동으로 Tools를 활성화
                        setEnableTools(true);
                      }}
                      className={thinkingMode === 'coding' ? 'bg-accent' : ''}
                    >
                      <Code className="mr-2 h-4 w-4 text-green-500" />
                      <div className="flex flex-col">
                        <span className="font-medium">Coding (beta)</span>
                        <span className="text-xs text-muted-foreground">
                          복잡한 코딩 작업 - ReAct Agent
                        </span>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* RAG Toggle */}
              {mounted && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => setEnableRAG(!enableRAG)}
                        variant="ghost"
                        size="icon"
                        className={`h-9 w-9 rounded-xl shrink-0 transition-colors ${
                          enableRAG ? 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20' : ''
                        }`}
                        title={enableRAG ? 'RAG 비활성화' : 'RAG 활성화'}
                        aria-label={enableRAG ? 'RAG 비활성화' : 'RAG 활성화'}
                        disabled={isStreaming}
                      >
                        <Database className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="font-medium">RAG 검색</p>
                      <p className="text-xs text-muted-foreground">
                        문서 데이터베이스에서 관련 정보를 검색합니다
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {/* Tools Toggle */}
              {mounted && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => setEnableTools(!enableTools)}
                        variant="ghost"
                        size="icon"
                        className={`h-9 w-9 rounded-xl shrink-0 transition-colors ${
                          enableTools
                            ? 'bg-orange-500/10 text-orange-500 hover:bg-orange-500/20'
                            : ''
                        }`}
                        title={enableTools ? 'Tools 비활성화' : 'Tools 활성화'}
                        aria-label={enableTools ? 'Tools 비활성화' : 'Tools 활성화'}
                        disabled={isStreaming}
                      >
                        <Wrench className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="font-medium">MCP Tools</p>
                      <p className="text-xs text-muted-foreground">
                        AI가 외부 도구를 사용할 수 있습니다
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {/* Image Upload Button */}
              {mounted && isElectron() && (
                <Button
                  onClick={handleImageSelect}
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-xl shrink-0"
                  title="이미지 추가"
                  aria-label="이미지 파일 선택"
                  disabled={isStreaming}
                >
                  <ImagePlus className="h-4 w-4" />
                </Button>
              )}
              {/* Image Generation Toggle - Only show if ComfyUI is available */}
              {mounted && isElectron() && comfyUIAvailable && (
                <Button
                  onClick={() => {
                    const newValue = !enableImageGeneration;
                    setEnableImageGeneration(newValue);
                    // 이미지 생성 활성화 시 자동으로 Tools도 활성화 (Agent 그래프 사용)
                    if (newValue && !enableTools) {
                      setEnableTools(true);
                    }
                  }}
                  variant="ghost"
                  size="icon"
                  className={`h-9 w-9 rounded-xl shrink-0 transition-colors ${
                    enableImageGeneration ? 'bg-primary/10 text-primary hover:bg-primary/20' : ''
                  }`}
                  title={
                    enableImageGeneration
                      ? '이미지 생성 비활성화'
                      : '이미지 생성 활성화 (Tools 자동 활성화)'
                  }
                  aria-label={enableImageGeneration ? '이미지 생성 비활성화' : '이미지 생성 활성화'}
                  aria-pressed={enableImageGeneration}
                  disabled={isStreaming}
                >
                  <Sparkles className="h-4 w-4" />
                </Button>
              )}

              {/* Send/Stop Button */}
              {isStreaming ? (
                <Button
                  onClick={handleStop}
                  variant="destructive"
                  size="icon"
                  className="h-9 w-9 rounded-xl shrink-0"
                  title="중지 (Esc)"
                  aria-label="스트리밍 중지"
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
                  aria-label="메시지 전송"
                  data-send-button
                >
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          {/* Image Generation Progress */}
          {currentImageGenProgress && currentImageGenProgress.status !== 'completed' && (
            <ImageGenerationProgressBar progress={currentImageGenProgress} className="mt-3" />
          )}
          <LLMStatusBar
            isStreaming={isStreaming}
            llmConfig={llmConfig}
            messages={messages}
            input={input}
            mounted={mounted}
            tools={tools}
            onCompact={handleCompact}
            onConfigUpdate={handleConfigUpdate}
          />
        </div>
      </div>
    </>
  );
}
