'use client';

/**
 * UnifiedChatInput Component
 *
 * 통합 입력 영역 - 모든 Chat 모드에서 사용
 * Width 기반 자동 Responsive Layout (Ultra-Compact / Compact / Full)
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Send,
  Square,
  Brain,
  BookText,
  Wrench,
  Sparkles,
  Zap,
  Network,
  Globe,
  Code,
  Users,
  ChevronDown,
  Check,
  Trash2,
  Bot,
  FolderOpen,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useChatInput } from './hooks/useChatInput';
import { useImageUpload } from './hooks/useImageUpload';
import { useFileDragDrop } from './hooks/useFileDragDrop';
import { useTextFileUpload } from './hooks/useTextFileUpload';
import { useToolApproval } from './hooks/useToolApproval';
import { useConfigLoader } from './hooks/useConfigLoader';
import { ImageAttachmentPlugin } from './plugins/ImageAttachmentPlugin';
import { FileAttachmentPlugin } from './plugins/FileAttachmentPlugin';
import { PersonaPlugin } from './plugins/PersonaPlugin';
import { SlashCommandPlugin } from './plugins/SlashCommandPlugin';
import { FileReferencePlugin } from './plugins/FileReferencePlugin';
import { ToolApprovalPlugin } from './plugins/ToolApprovalPlugin';
import { LLMStatusBar } from './components/LLMStatusBar';
import { ImageGenerationProgressBar } from './components/ImageGenerationProgressBar';
import { ApprovalHistoryTimeline } from './components/ApprovalHistoryTimeline';
import { useChatStore } from '@/lib/store/chat-store';
import { isElectron } from '@/lib/platform';
import type { ImageAttachment, AgentProgress } from '@/types';
import type { Persona } from '@/types/persona';
import type { ChatConfig } from './types';
import { useShallow } from 'zustand/react/shallow';

interface ToolInfo {
  name: string;
  description: string;
  serverName: string;
}

interface MCPServerIssue {
  name: string;
  status: 'error' | 'disconnected';
  errorMessage?: string;
}

interface SlashCommand {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  action: () => void;
}

interface FileReferenceQuery {
  start: number;
  end: number;
  query: string;
}

interface PersonaReferenceQuery {
  start: number;
  end: number;
  query: string;
}

function parseFileReferenceQuery(
  inputText: string,
  cursorPosition: number
): FileReferenceQuery | null {
  const beforeCursor = inputText.slice(0, cursorPosition);
  const match = beforeCursor.match(/(^|\s)@([^\s@]*)$/);
  if (!match || match.index === undefined) {
    return null;
  }

  const start = match.index + match[1].length;
  return {
    start,
    end: cursorPosition,
    query: match[2] || '',
  };
}

function parsePersonaReferenceQuery(
  inputText: string,
  cursorPosition: number
): PersonaReferenceQuery | null {
  const beforeCursor = inputText.slice(0, cursorPosition);
  const match = beforeCursor.match(/(^|[\s([{'"`])#([^\s#]*)$/);
  if (!match || match.index === undefined) {
    return null;
  }

  const start = match.index + match[1].length;
  return {
    start,
    end: cursorPosition,
    query: match[2] || '',
  };
}

function removeInlineToken(
  inputText: string,
  start: number,
  end: number
): {
  nextInput: string;
  cursorPosition: number;
} {
  const before = inputText.slice(0, start);
  const after = inputText.slice(end);

  const shouldCollapseJoinSpace = /\s$/.test(before) && /^\s/.test(after);
  const collapsedAfter = shouldCollapseJoinSpace ? after.replace(/^\s+/, ' ') : after;

  return {
    nextInput: `${before}${collapsedAfter}`,
    cursorPosition: before.length,
  };
}

interface UnifiedChatInputProps {
  config: ChatConfig;
  onSendMessage?: (message: string, images?: ImageAttachment[]) => Promise<void>;
  onStopStreaming?: () => void;
  isStreaming: boolean;
  imageGenAvailable?: boolean;
  mounted?: boolean;
  agentProgress?: AgentProgress | null;
}

// Responsive breakpoints
type LayoutMode = 'ultra-compact' | 'compact' | 'full';

function getLayoutMode(width: number): LayoutMode {
  if (width < 500) {
    return 'ultra-compact';
  }
  if (width < 800) {
    return 'compact';
  }
  return 'full';
}

export function UnifiedChatInput({
  config,
  onSendMessage,
  onStopStreaming,
  isStreaming,
  imageGenAvailable = false,
  mounted = true,
  agentProgress = null,
}: UnifiedChatInputProps) {
  const { t } = useTranslation();
  const { mode, features, style } = config;
  const containerRef = useRef<HTMLDivElement>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('full');

  // Load LLM config
  const { llmConfig, updateLLMConfig } = useConfigLoader();

  // Store state (Main Chat only)
  const {
    thinkingMode,
    setThinkingMode,
    inputTrustLevel,
    setInputTrustLevel,
    enableRAG,
    setEnableRAG,
    enableTools,
    setEnableTools,
    enableImageGeneration,
    setEnableImageGeneration,
    enabledTools,
    toggleTool,
    enableAllTools,
    disableAllTools,
    personas,
    activePersonaId,
    setActivePersona,
    pendingToolApproval,
    messages,
    activeConversationId,
    imageGenerationProgress,
    clearMessages,
    workingDirectory,
    setWorkingDirectory,
    selectedImageGenProvider,
    setSelectedImageGenProvider,
  } = useChatStore(
    useShallow((state) => ({
      thinkingMode: state.thinkingMode,
      setThinkingMode: state.setThinkingMode,
      inputTrustLevel: state.inputTrustLevel,
      setInputTrustLevel: state.setInputTrustLevel,
      enableRAG: state.enableRAG,
      setEnableRAG: state.setEnableRAG,
      enableTools: state.enableTools,
      setEnableTools: state.setEnableTools,
      enableImageGeneration: state.enableImageGeneration,
      setEnableImageGeneration: state.setEnableImageGeneration,
      enabledTools: state.enabledTools,
      toggleTool: state.toggleTool,
      enableAllTools: state.enableAllTools,
      disableAllTools: state.disableAllTools,
      personas: state.personas,
      activePersonaId: state.activePersonaId,
      setActivePersona: state.setActivePersona,
      pendingToolApproval: state.pendingToolApproval,
      messages: state.messages,
      activeConversationId: state.activeConversationId,
      imageGenerationProgress: state.imageGenerationProgress,
      clearMessages: state.clearMessages,
      workingDirectory: state.workingDirectory,
      setWorkingDirectory: state.setWorkingDirectory,
      selectedImageGenProvider: state.selectedImageGenProvider,
      setSelectedImageGenProvider: state.setSelectedImageGenProvider,
    }))
  );

  // Input hooks
  const {
    input,
    setInput,
    isComposing,
    setIsComposing,
    textareaRef,
    handleKeyDown,
    clearInput,
    focusInput,
  } = useChatInput();

  const {
    selectedImages,
    addImages,
    handleImageSelect,
    handleRemoveImage,
    handlePaste,
    clearImages,
  } = useImageUpload();

  const { selectedFiles, addFiles, removeFile: handleRemoveFile, clearFiles } = useTextFileUpload();

  const { isDragging, setIsDragging, handleFileDrop } = useFileDragDrop();

  const {
    handleToolApprove,
    handleToolReject,
    handleToolAlwaysApprove,
    isSubmitting: toolApprovalSubmitting,
    errorMessage: toolApprovalError,
    clearError: clearToolApprovalError,
  } = useToolApproval();

  // Local state
  const [personaAutocompleteIndex, setPersonaAutocompleteIndex] = useState(0);
  const [commandAutocompleteIndex, setCommandAutocompleteIndex] = useState(0);
  const [fileAutocompleteIndex, setFileAutocompleteIndex] = useState(0);
  const [workspaceFiles, setWorkspaceFiles] = useState<string[]>([]);

  // Slash Commands Definitions
  const commands = useMemo<SlashCommand[]>(() => {
    if (mode !== 'main') {
      return [];
    }

    return [
      {
        id: 'clear',
        name: '대화 비우기',
        description: '현재 대화의 모든 메시지를 삭제합니다.',
        icon: <Trash2 className="h-4 w-4" />,
        action: () => {
          if (window.confirm('현재 대화의 모든 메시지를 삭제하시겠습니까?')) {
            clearMessages();
          }
        },
      },
      {
        id: 'instant',
        name: 'Instant Mode',
        description: '가장 빠른 응답 속도로 대화합니다.',
        icon: <Zap className="h-4 w-4" />,
        action: () => setThinkingMode('instant'),
      },
      {
        id: 'sequential',
        name: 'Sequential Mode',
        description: '단계별로 차분하게 답변합니다.',
        icon: <Brain className="h-4 w-4" />,
        action: () => setThinkingMode('sequential'),
      },
      {
        id: 'tree-of-thought',
        name: 'Tree of Thought',
        description: '여러 경로를 탐색해 답변 품질을 높입니다.',
        icon: <Network className="h-4 w-4" />,
        action: () => setThinkingMode('tree-of-thought'),
      },
      {
        id: 'deep',
        name: 'Deep Mode',
        description: '더 깊게 생각하고 정확한 답변을 제공합니다.',
        icon: <Sparkles className="h-4 w-4" />,
        action: () => setThinkingMode('deep'),
      },
      {
        id: 'deep-web-research',
        name: 'Deep Web Research',
        description: '웹 기반 탐색을 강화한 심화 모드입니다.',
        icon: <Globe className="h-4 w-4" />,
        action: () => setThinkingMode('deep-web-research'),
      },
      {
        id: 'coding',
        name: 'Coding Mode',
        description: '코딩 및 파일 수정에 특화된 모드입니다.',
        icon: <Code className="h-4 w-4" />,
        action: () => setThinkingMode('coding'),
      },
      {
        id: 'cowork',
        name: 'Cowork Mode',
        description: '도구를 활용해 함께 문제를 해결하는 협업형 모드입니다.',
        icon: <Users className="h-4 w-4" />,
        action: () => setThinkingMode('cowork'),
      },
      {
        id: 'trusted-input',
        name: '신뢰 입력 모드',
        description: '입력을 신뢰된 지시로 처리합니다.',
        icon: <ShieldCheck className="h-4 w-4" />,
        action: () => setInputTrustLevel('trusted'),
      },
      {
        id: 'untrusted-input',
        name: '비신뢰 입력 모드',
        description: '입력을 비신뢰로 간주하여 도구 승인 정책을 강화합니다.',
        icon: <ShieldAlert className="h-4 w-4" />,
        action: () => setInputTrustLevel('untrusted'),
      },
      {
        id: 'rag',
        name: 'RAG 토글',
        description: '문서 참조 기능을 켜거나 끕니다.',
        icon: <BookText className="h-4 w-4" />,
        action: () => setEnableRAG(!enableRAG),
      },
      {
        id: 'tools',
        name: '도구 토글',
        description: 'MCP 도구 사용 기능을 켜거나 끕니다.',
        icon: <Wrench className="h-4 w-4" />,
        action: () => setEnableTools(!enableTools),
      },
      {
        id: 'persona',
        name: '페르소나 선택',
        description: 'AI의 역할(페르소나)을 변경합니다.',
        icon: <Bot className="h-4 w-4" />,
        action: () => setInput('/persona '),
      },
    ];
  }, [
    mode,
    clearMessages,
    setThinkingMode,
    setInputTrustLevel,
    enableRAG,
    setEnableRAG,
    enableTools,
    setEnableTools,
    setInput,
  ]);

  const [tools, _setTools] = useState<ToolInfo[]>([]);
  const [toolsLoading, setToolsLoading] = useState(true);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [mcpServerIssues, setMcpServerIssues] = useState<MCPServerIssue[]>([]);
  const [imageGenConfig, setImageGenConfig] = useState<any>(null);
  const [isSelectingDirectory, setIsSelectingDirectory] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const personasRef = useRef(personas);

  useEffect(() => {
    personasRef.current = personas;
  }, [personas]);

  // Helper function for getting translated persona text (for builtin personas)
  const getPersonaDisplayText = useCallback(
    (persona: Persona, field: 'name' | 'description'): string => {
      if (persona.isBuiltin) {
        const translationKey = `persona.builtin.${persona.id}.${field}`;
        const translated = t(translationKey);
        return translated !== translationKey ? translated : persona[field];
      }
      return persona[field];
    },
    [t]
  );

  // Width-based responsive layout
  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const updateLayout = () => {
      if (containerRef.current) {
        const width = containerRef.current.clientWidth;
        const newMode = getLayoutMode(width);
        setLayoutMode(newMode);
      }
    };

    // Initial measurement
    updateLayout();

    // ResizeObserver for dynamic updates
    const resizeObserver = new ResizeObserver(updateLayout);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Override layoutMode with forced compact mode
  const effectiveLayoutMode = style?.compact === true ? 'ultra-compact' : layoutMode;

  // Load imageGen config from IPC (Main mode only)
  useEffect(() => {
    if (mode !== 'main' || !isElectron() || !window.electronAPI?.config) {
      return;
    }

    const loadImageGenConfig = async () => {
      try {
        const result = await window.electronAPI.config.load();
        if (result.success && result.data) {
          const migratedImageGen =
            result.data.imageGen ||
            (result.data.comfyUI
              ? {
                  provider: 'comfyui' as const,
                  comfyui: result.data.comfyUI,
                }
              : null);

          if (!migratedImageGen) {
            return;
          }

          setImageGenConfig(migratedImageGen);
          // Set default provider if both are enabled
          if (
            migratedImageGen.comfyui?.enabled &&
            migratedImageGen.nanobanana?.enabled &&
            !selectedImageGenProvider
          ) {
            setSelectedImageGenProvider(migratedImageGen.provider);
          }
        }
      } catch (error) {
        console.error('[UnifiedChatInput] Failed to load imageGen config:', error);
      }
    };

    loadImageGenConfig();
  }, [mode, selectedImageGenProvider, setSelectedImageGenProvider]);

  const loadTools = useCallback(async () => {
    if (!isElectron() || !window.electronAPI?.mcp) {
      setToolsLoading(false);
      setMcpServerIssues([]);
      return;
    }

    const loadServerIssues = async (): Promise<MCPServerIssue[]> => {
      if (mode !== 'main') {
        return [];
      }

      try {
        const listResult = await window.electronAPI.mcp.listServers();
        if (!listResult.success || !listResult.data) {
          return [
            {
              name: 'MCP',
              status: 'error',
              errorMessage: listResult.error || 'Failed to load MCP servers',
            },
          ];
        }

        const issues = await Promise.all(
          listResult.data.map(async (server) => {
            try {
              const statusResult = await window.electronAPI.mcp.getServerStatus(server.name);
              if (!statusResult.success || !statusResult.data) {
                return {
                  name: server.name,
                  status: 'error' as const,
                  errorMessage: statusResult.error || 'Failed to load server status',
                };
              }

              if (statusResult.data.status === 'error') {
                return {
                  name: server.name,
                  status: 'error' as const,
                  errorMessage: statusResult.data.errorMessage,
                };
              }

              if (statusResult.data.status === 'disconnected') {
                return {
                  name: server.name,
                  status: 'disconnected' as const,
                  errorMessage: statusResult.data.errorMessage,
                };
              }

              return null;
            } catch (error) {
              return {
                name: server.name,
                status: 'error' as const,
                errorMessage: error instanceof Error ? error.message : String(error),
              };
            }
          })
        );

        return issues.filter((issue) => issue !== null) as MCPServerIssue[];
      } catch (error) {
        return [
          {
            name: 'MCP',
            status: 'error',
            errorMessage: error instanceof Error ? error.message : String(error),
          },
        ];
      }
    };

    setToolsLoading(true);
    setToolsError(null);
    try {
      const [response, serverIssues] = await Promise.all([
        window.electronAPI.mcp.getAllTools(),
        loadServerIssues(),
      ]);
      setMcpServerIssues(serverIssues);

      if (response.success && response.data) {
        // Filter tools based on mode
        let filteredTools = response.data;

        if (mode === 'browser') {
          // Browser mode: only browser* and google* tools
          filteredTools = response.data.filter(
            (tool) =>
              tool.name.startsWith('browser') ||
              tool.name.startsWith('google') ||
              tool.name === 'webSearch' ||
              tool.name === 'webFetch'
          );
        } else if (mode === 'editor') {
          // Editor mode: file*, command*, grep* tools
          filteredTools = response.data.filter(
            (tool) =>
              tool.name.startsWith('file') ||
              tool.name.startsWith('command') ||
              tool.name.startsWith('grep') ||
              tool.name === 'grepSearch'
          );
        } else if (mode === 'main') {
          // Main mode: MCP server tools only (+ coding-backed builtin tools for coding/cowork)
          const codingAgentTools = new Set([
            'file_read',
            'file_write',
            'file_edit',
            'file_list',
            'command_execute',
            'grep_search',
          ]);
          const isCodingBackedMode = thinkingMode === 'coding' || thinkingMode === 'cowork';
          filteredTools = response.data.filter((tool) => {
            // Include all MCP server tools (non-builtin)
            if (tool.serverName !== 'builtin') {
              return true;
            }
            // Include coding-backed builtin tools only for coding/cowork
            if (isCodingBackedMode) {
              return codingAgentTools.has(tool.name);
            }
            // Otherwise, exclude all builtin tools
            return false;
          });
        }

        _setTools(filteredTools);
        setToolsError(null);
      } else {
        setToolsError(response.error || 'Failed to load tools');
      }
    } catch (error) {
      console.error('[UnifiedChatInput] Failed to load tools:', error);
      setToolsError(
        error instanceof Error ? error.message : String(error) || 'Failed to load tools'
      );
      if (mode !== 'main') {
        setMcpServerIssues([]);
      }
    } finally {
      setToolsLoading(false);
    }
  }, [mode, thinkingMode]);

  const activeToolsCount = tools.reduce(
    (count, tool) => count + (enabledTools.has(tool.name) ? 1 : 0),
    0
  );

  // Load tools from IPC (all modes, but filtered by mode and thinkingMode)
  useEffect(() => {
    loadTools();
  }, [loadTools]);

  // MCP 설정 변경 시 도구 목록 즉시 갱신
  useEffect(() => {
    const handleMCPUpdated = () => {
      void loadTools();
    };

    window.addEventListener('sepilot:mcp-updated', handleMCPUpdated as EventListener);
    return () => {
      window.removeEventListener('sepilot:mcp-updated', handleMCPUpdated as EventListener);
    };
  }, [loadTools]);

  // Get current conversation's image generation progress
  const currentImageGenProgress = activeConversationId
    ? imageGenerationProgress.get(activeConversationId) || null
    : null;

  const requiresWorkingDirectory =
    mode === 'main' &&
    (thinkingMode === 'coding' || thinkingMode === 'cowork') &&
    !workingDirectory;
  const isCoworkMode = mode === 'main' && thinkingMode === 'cowork';

  const getShortWorkingDirectory = useCallback((directory: string) => {
    const segments = directory.split(/[/\\]/).filter(Boolean);
    if (segments.length <= 2) {
      return directory;
    }
    return `.../${segments.slice(-2).join('/')}`;
  }, []);

  const handleSelectWorkingDirectory = useCallback(async () => {
    if (!isElectron() || !window.electronAPI?.file?.selectDirectory) {
      return;
    }

    setIsSelectingDirectory(true);
    try {
      const result = await window.electronAPI.file.selectDirectory();
      if (result.success && result.data) {
        setWorkingDirectory(result.data);
      }
    } catch (error) {
      console.error('[UnifiedChatInput] Failed to select working directory:', error);
    } finally {
      setIsSelectingDirectory(false);
    }
  }, [setWorkingDirectory]);

  // Handle send
  const handleSend = useCallback(async () => {
    const hasText = !!input.trim();
    const hasImages = selectedImages.length > 0;
    const hasFiles = selectedFiles.length > 0;

    if ((!hasText && !hasImages && !hasFiles) || isStreaming || requiresWorkingDirectory) {
      return;
    }

    let message = input.trim();

    // Append file contents
    if (hasFiles) {
      const fileContents = selectedFiles
        .map((file) => `📄 **${file.filename}**\n\`\`\`\n${file.content}\n\`\`\``)
        .join('\n\n');

      if (message) {
        message += `\n\n${fileContents}`;
      } else {
        message = fileContents;
      }
    }

    const images = hasImages ? selectedImages : undefined;

    if (onSendMessage) {
      try {
        await onSendMessage(message, images);
        clearInput();
        clearImages();
        clearFiles();
      } catch (error) {
        console.error('[UnifiedChatInput] Send failed:', error);
      }
    }

    // Auto-focus after send
    setTimeout(() => focusInput(), 100);
  }, [
    input,
    isStreaming,
    selectedImages,
    selectedFiles,
    clearInput,
    clearImages,
    clearFiles,
    onSendMessage,
    focusInput,
    requiresWorkingDirectory,
  ]);

  // Handle Quick Input message (auto-send)
  // Only handle in Main Chat mode to prevent duplicate sends
  const lastProcessedMessageRef = useRef<string | null>(null);
  const processingRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || mode !== 'main') {
      return;
    }

    const handleAutoSendMessage = async (e: Event) => {
      if ((thinkingMode === 'coding' || thinkingMode === 'cowork') && !workingDirectory) {
        toast.warning(t('unifiedInput.workingDirectory.autoSendBlocked'), {
          id: 'coding-working-directory-required',
        });
        return;
      }

      const customEvent = e as CustomEvent<{ userMessage: string }>;
      const { userMessage } = customEvent.detail;

      if (!userMessage || !userMessage.trim()) {
        return;
      }
      if (lastProcessedMessageRef.current === userMessage || processingRef.current) {
        return;
      }

      processingRef.current = true;
      lastProcessedMessageRef.current = userMessage;

      try {
        setInput(userMessage);
        setTimeout(() => {
          if (onSendMessage) {
            onSendMessage(userMessage, selectedImages).finally(() => {
              setTimeout(() => {
                processingRef.current = false;
                setTimeout(() => {
                  if (lastProcessedMessageRef.current === userMessage) {
                    lastProcessedMessageRef.current = null;
                  }
                }, 1000);
              }, 500);
            });
          }
        }, 100);
      } catch (error) {
        console.error('[UnifiedChatInput] Error processing auto-send:', error);
        processingRef.current = false;
        lastProcessedMessageRef.current = null;
      }
    };

    window.addEventListener('sepilot:auto-send-message', handleAutoSendMessage);
    return () => {
      window.removeEventListener('sepilot:auto-send-message', handleAutoSendMessage);
    };
  }, [mode, onSendMessage, selectedImages, setInput, thinkingMode, workingDirectory, t]);

  // Handle file drop and quote events
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleFileDropEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{
        textContents: string[];
        imageFiles: { filename: string; mimeType: string; base64: string }[];
      }>;
      const { textContents, imageFiles } = customEvent.detail;

      if (textContents.length > 0) {
        const remainingText: string[] = [];
        const newFiles: any[] = [];

        textContents.forEach((content) => {
          const match = content.match(/^📄 \*\*(.*?)\*\*\n```\n([\s\S]*)\n```$/);
          if (match) {
            newFiles.push({
              id: `dropped-file-${Date.now()}-${match[1]}`,
              filename: match[1],
              content: match[2],
              size: match[2].length,
            });
          } else {
            remainingText.push(content);
          }
        });

        if (newFiles.length > 0) {
          addFiles(newFiles);
        }
        if (remainingText.length > 0) {
          const combinedText = remainingText.join('\n\n');
          setInput((prev) => (prev ? `${prev}\n\n${combinedText}` : combinedText));
        }
      }

      if (imageFiles.length > 0) {
        const newImages: ImageAttachment[] = imageFiles.map((img, idx) => ({
          id: `drop-${Date.now()}-${idx}`,
          path: '',
          filename: img.filename,
          mimeType: img.mimeType,
          base64: img.base64,
        }));
        addImages(newImages);
      }
    };

    const handleQuoteEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ text: string }>;
      const { text } = customEvent.detail;
      setInput((prev) => (prev ? `${text}${prev}` : text));
      focusInput();
    };

    const handleEscKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && isStreaming && onStopStreaming) {
        onStopStreaming();
      }
    };

    window.addEventListener('sepilot:file-drop', handleFileDropEvent);
    window.addEventListener('sepilot:quote-message', handleQuoteEvent);
    window.addEventListener('keydown', handleEscKey);

    return () => {
      window.removeEventListener('sepilot:file-drop', handleFileDropEvent);
      window.removeEventListener('sepilot:quote-message', handleQuoteEvent);
      window.removeEventListener('keydown', handleEscKey);
    };
  }, [setInput, addFiles, addImages, focusInput, isStreaming, onStopStreaming]);

  const getFilteredCommands = useCallback(
    (value: string): SlashCommand[] => {
      if (!value.startsWith('/') || value.includes(' ') || commands.length === 0) {
        return [];
      }

      const filter = value.slice(1).toLowerCase();
      return commands.filter(
        (cmd) => cmd.id.includes(filter) || cmd.name.toLowerCase().includes(filter)
      );
    },
    [commands]
  );

  const personaReferenceQuery = useMemo(() => {
    const cursor = textareaRef.current?.selectionStart ?? input.length;
    return parsePersonaReferenceQuery(input, cursor);
  }, [input, textareaRef]);

  const getFilteredPersonas = useCallback(
    (value: string): Persona[] => {
      if (mode !== 'main') {
        return [];
      }

      const personaCommand = value.match(/^\/persona\s+(.*)$/i);
      if (!personaCommand && !personaReferenceQuery) {
        return [];
      }

      const searchTerm = personaCommand
        ? personaCommand[1].toLowerCase()
        : (personaReferenceQuery?.query || '').toLowerCase();
      return personasRef.current.filter((persona: Persona) => {
        const name = getPersonaDisplayText(persona, 'name');
        const description = getPersonaDisplayText(persona, 'description');
        return (
          name.toLowerCase().includes(searchTerm) || description.toLowerCase().includes(searchTerm)
        );
      });
    },
    [getPersonaDisplayText, mode, personaReferenceQuery]
  );

  const applyPersonaSelection = useCallback(
    (selectedPersona: Persona) => {
      setActivePersona(selectedPersona.id);
      toast.success(
        t('unifiedInput.persona.switched', {
          name: getPersonaDisplayText(selectedPersona, 'name'),
          defaultValue: `Switched persona to ${getPersonaDisplayText(selectedPersona, 'name')}`,
        })
      );

      const isSlashPersonaInput = /^\/persona(\s+.*)?$/i.test(input.trim());
      if (isSlashPersonaInput) {
        clearInput();
        return;
      }

      if (!personaReferenceQuery) {
        return;
      }

      const { nextInput, cursorPosition } = removeInlineToken(
        input,
        personaReferenceQuery.start,
        personaReferenceQuery.end
      );

      setInput(nextInput);
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(cursorPosition, cursorPosition);
      });
    },
    [
      clearInput,
      getPersonaDisplayText,
      input,
      personaReferenceQuery,
      setActivePersona,
      setInput,
      t,
      textareaRef,
    ]
  );

  const activePersona = useMemo(
    () => personas.find((persona) => persona.id === activePersonaId) ?? null,
    [activePersonaId, personas]
  );

  const personaSuggestions = useMemo(
    () => getFilteredPersonas(input),
    [getFilteredPersonas, input]
  );

  const personaListboxId = 'persona-autocomplete-listbox';
  const activePersonaSuggestion =
    personaSuggestions.length > 0
      ? personaSuggestions[
          Math.max(0, Math.min(personaAutocompleteIndex, personaSuggestions.length - 1))
        ]
      : null;
  const activePersonaDescendantId = activePersonaSuggestion
    ? `${personaListboxId}-option-${activePersonaSuggestion.id}`
    : undefined;

  const getExactSlashCommand = useCallback(
    (value: string): SlashCommand | null => {
      if (mode !== 'main') {
        return null;
      }

      const exactCommandMatch = value.match(/^\/([a-z0-9-]+)\s*$/i);
      if (!exactCommandMatch) {
        return null;
      }

      const commandId = exactCommandMatch[1].toLowerCase();
      return commands.find((cmd) => cmd.id.toLowerCase() === commandId) || null;
    },
    [commands, mode]
  );

  const handleCommandSelect = useCallback(
    (commandId: string) => {
      const cmd = commands.find((c) => c.id === commandId);
      if (cmd) {
        cmd.action();
        setCommandAutocompleteIndex(0);
        if (commandId !== 'persona') {
          clearInput();
        }
      }
    },
    [commands, clearInput]
  );

  const handleCommandAutocompleteClose = useCallback(() => {
    setCommandAutocompleteIndex(0);
  }, []);

  const handlePersonaAutocompleteClose = useCallback(() => {
    setPersonaAutocompleteIndex(0);
  }, []);

  const fileReferenceQuery = useMemo(() => {
    const cursor = textareaRef.current?.selectionStart ?? input.length;
    return parseFileReferenceQuery(input, cursor);
  }, [input, textareaRef]);

  const filteredFileSuggestions = useMemo(() => {
    if (!fileReferenceQuery || workspaceFiles.length === 0) {
      return [];
    }

    const normalizedQuery = fileReferenceQuery.query.toLowerCase();
    const startsWith = workspaceFiles.filter((path) =>
      path.toLowerCase().startsWith(normalizedQuery)
    );
    const includes = workspaceFiles.filter(
      (path) =>
        !path.toLowerCase().startsWith(normalizedQuery) &&
        path.toLowerCase().includes(normalizedQuery)
    );

    return [...startsWith, ...includes].slice(0, 30);
  }, [fileReferenceQuery, workspaceFiles]);

  const applyFileReference = useCallback(
    (selectedPath: string) => {
      if (!fileReferenceQuery) {
        return;
      }

      const nextInput = `${input.slice(0, fileReferenceQuery.start)}@${selectedPath} ${input.slice(fileReferenceQuery.end)}`;

      setInput(nextInput);
      setFileAutocompleteIndex(0);

      requestAnimationFrame(() => {
        const targetCursor = fileReferenceQuery.start + selectedPath.length + 2;
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(targetCursor, targetCursor);
      });
    },
    [fileReferenceQuery, input, setInput, textareaRef]
  );

  useEffect(() => {
    let isCancelled = false;

    const loadWorkspaceFiles = async () => {
      if (!workingDirectory || !isElectron() || !window.electronAPI?.fs?.readDirectory) {
        setWorkspaceFiles([]);
        return;
      }

      const maxEntries = 2000;
      const maxDepth = 6;
      let count = 0;

      const walk = async (dirPath: string, depth: number): Promise<string[]> => {
        if (depth > maxDepth || count >= maxEntries) {
          return [];
        }

        const result = await window.electronAPI.fs.readDirectory(dirPath);
        if (!result?.success || !result.data) {
          return [];
        }

        const collected: string[] = [];
        for (const entry of result.data as Array<{
          path: string;
          name: string;
          isDirectory: boolean;
        }>) {
          if (count >= maxEntries) {
            break;
          }

          if (entry.isDirectory) {
            collected.push(...(await walk(entry.path, depth + 1)));
          } else {
            const relative = entry.path.replace(`${workingDirectory}/`, '').replace(/\\/g, '/');
            collected.push(relative);
            count += 1;
          }
        }

        return collected;
      };

      try {
        const files = await walk(workingDirectory, 0);
        if (!isCancelled) {
          setWorkspaceFiles(files);
        }
      } catch {
        if (!isCancelled) {
          setWorkspaceFiles([]);
        }
      }
    };

    loadWorkspaceFiles();

    return () => {
      isCancelled = true;
    };
  }, [workingDirectory]);

  // Keep autocomplete indices within filtered list bounds
  useEffect(() => {
    const filteredCommands = getFilteredCommands(input);
    if (filteredCommands.length === 0) {
      if (commandAutocompleteIndex !== 0) {
        setCommandAutocompleteIndex(0);
      }
      return;
    }

    const safeCommandIndex = Math.max(
      0,
      Math.min(commandAutocompleteIndex, filteredCommands.length - 1)
    );
    if (safeCommandIndex !== commandAutocompleteIndex) {
      setCommandAutocompleteIndex(safeCommandIndex);
    }
  }, [commandAutocompleteIndex, getFilteredCommands, input]);

  useEffect(() => {
    if (personaSuggestions.length === 0) {
      if (personaAutocompleteIndex !== 0) {
        setPersonaAutocompleteIndex(0);
      }
      return;
    }

    const safePersonaIndex = Math.max(
      0,
      Math.min(personaAutocompleteIndex, personaSuggestions.length - 1)
    );
    if (safePersonaIndex !== personaAutocompleteIndex) {
      setPersonaAutocompleteIndex(safePersonaIndex);
    }
  }, [personaAutocompleteIndex, personaSuggestions]);

  useEffect(() => {
    if (filteredFileSuggestions.length === 0) {
      if (fileAutocompleteIndex !== 0) {
        setFileAutocompleteIndex(0);
      }
      return;
    }

    const safeFileIndex = Math.max(
      0,
      Math.min(fileAutocompleteIndex, filteredFileSuggestions.length - 1)
    );
    if (safeFileIndex !== fileAutocompleteIndex) {
      setFileAutocompleteIndex(safeFileIndex);
    }
  }, [fileAutocompleteIndex, filteredFileSuggestions]);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const currentInput = input;
      const canSelectWithEnter = e.key === 'Enter' && !e.shiftKey && !isComposing;

      if (canSelectWithEnter) {
        const exactCommand = getExactSlashCommand(currentInput);
        if (exactCommand) {
          e.preventDefault();
          handleCommandSelect(exactCommand.id);
          return;
        }
      }

      const filteredCommands = getFilteredCommands(currentInput);
      if (filteredFileSuggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setFileAutocompleteIndex((prev) => (prev + 1) % filteredFileSuggestions.length);
          return;
        }

        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setFileAutocompleteIndex(
            (prev) => (prev - 1 + filteredFileSuggestions.length) % filteredFileSuggestions.length
          );
          return;
        }

        if (canSelectWithEnter) {
          e.preventDefault();
          const selectedPath = filteredFileSuggestions[fileAutocompleteIndex];
          if (selectedPath) {
            applyFileReference(selectedPath);
          }
          return;
        }
      }

      if (filteredCommands.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setCommandAutocompleteIndex((prev) => (prev + 1) % filteredCommands.length);
          return;
        }

        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setCommandAutocompleteIndex(
            (prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length
          );
          return;
        }

        if (canSelectWithEnter) {
          e.preventDefault();
          const safeCommandIndex = Math.max(
            0,
            Math.min(commandAutocompleteIndex, filteredCommands.length - 1)
          );
          const selectedCmd = filteredCommands[safeCommandIndex];
          if (selectedCmd) {
            handleCommandSelect(selectedCmd.id);
          }
          return;
        }

        if (e.key === 'Escape') {
          e.preventDefault();
          handleCommandAutocompleteClose();
          return;
        }
      }

      const filteredPersonas = getFilteredPersonas(currentInput);
      if (filteredPersonas.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setPersonaAutocompleteIndex((prev) => (prev + 1) % filteredPersonas.length);
          return;
        }

        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setPersonaAutocompleteIndex(
            (prev) => (prev - 1 + filteredPersonas.length) % filteredPersonas.length
          );
          return;
        }

        if (canSelectWithEnter) {
          e.preventDefault();
          const safePersonaIndex = Math.max(
            0,
            Math.min(personaAutocompleteIndex, filteredPersonas.length - 1)
          );
          const selectedPersona = filteredPersonas[safePersonaIndex];
          if (selectedPersona) {
            applyPersonaSelection(selectedPersona);
          }
          return;
        }

        if (e.key === 'Escape') {
          e.preventDefault();
          handlePersonaAutocompleteClose();
          return;
        }
      }

      const isPersonaCommandInput = /^\/persona(\s+.*)?$/i.test(currentInput.trim());
      if (isPersonaCommandInput && canSelectWithEnter) {
        e.preventDefault();
        return;
      }

      handleKeyDown(e, handleSend);
    },
    [
      input,
      isComposing,
      getExactSlashCommand,
      handleCommandSelect,
      getFilteredCommands,
      commandAutocompleteIndex,
      filteredFileSuggestions,
      fileAutocompleteIndex,
      applyFileReference,
      handleCommandAutocompleteClose,
      getFilteredPersonas,
      personaAutocompleteIndex,
      applyPersonaSelection,
      handlePersonaAutocompleteClose,
      handleKeyDown,
      handleSend,
    ]
  );

  // Handle drag events
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) {
        return;
      }

      await handleFileDrop(
        files,
        (textAttachments) => {
          addFiles(textAttachments);
        },
        (images) => {
          addImages(images);
        }
      );
    },
    [handleFileDrop, addFiles, addImages]
  );

  const placeholderText = isStreaming
    ? t('unifiedInput.placeholder.generating')
    : effectiveLayoutMode === 'ultra-compact'
      ? t('unifiedInput.placeholder.ultraCompact')
      : t('unifiedInput.placeholder.default');
  const hasSendableContent =
    input.trim().length > 0 || selectedImages.length > 0 || selectedFiles.length > 0;

  // Thinking mode icon mapping
  const thinkingModeIcon = {
    instant: <Zap className="h-4 w-4" />,
    sequential: <Brain className="h-4 w-4" />,
    'tree-of-thought': <Network className="h-4 w-4" />,
    deep: <Sparkles className="h-4 w-4" />,
    'deep-web-research': <Globe className="h-4 w-4" />,
    coding: <Code className="h-4 w-4" />,
    cowork: <Users className="h-4 w-4" />,
  };
  const inputTrustIcon =
    inputTrustLevel === 'trusted' ? (
      <ShieldCheck className="h-4 w-4" />
    ) : (
      <ShieldAlert className="h-4 w-4" />
    );

  // Render controls based on layout mode
  const renderControls = () => {
    if (mode !== 'main') {
      return null; // Editor/Browser don't have controls
    }

    if (effectiveLayoutMode === 'ultra-compact') {
      // Ultra-compact: All controls in dropdown menu
      return (
        <div className="flex items-center gap-2 mb-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                <Brain className="h-3 w-3 mr-1" />
                {t('unifiedInput.settings')}
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-56">
              <div className="px-2 py-1.5 text-xs font-semibold">Thinking Mode</div>
              <DropdownMenuItem onClick={() => setThinkingMode('instant')}>
                <Zap className="h-3.5 w-3.5 mr-2" />
                Instant
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setThinkingMode('sequential')}>
                <Brain className="h-3.5 w-3.5 mr-2" />
                Sequential
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setThinkingMode('deep')}>
                <Sparkles className="h-3.5 w-3.5 mr-2" />
                Deep
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleSelectWorkingDirectory}
                disabled={isSelectingDirectory}
              >
                <FolderOpen className="h-3.5 w-3.5 mr-2" />
                <div className="flex min-w-0 flex-col">
                  <span>
                    {workingDirectory
                      ? t('unifiedInput.workingDirectory.change')
                      : t('unifiedInput.workingDirectory.set')}
                  </span>
                  {workingDirectory && (
                    <span className="text-[10px] text-muted-foreground truncate">
                      {getShortWorkingDirectory(workingDirectory)}
                    </span>
                  )}
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setEnableRAG(!enableRAG)}>
                <BookText className="h-3.5 w-3.5 mr-2" />
                RAG {enableRAG && <Check className="h-3 w-3 ml-auto" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEnableTools(!enableTools)}>
                <Wrench className="h-3.5 w-3.5 mr-2" />
                Tools {enableTools && <Check className="h-3 w-3 ml-auto" />}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-xs font-semibold">
                {t('unifiedInput.trust.title')}
              </div>
              <DropdownMenuItem
                onClick={() => setInputTrustLevel('trusted')}
                disabled={isCoworkMode}
              >
                <ShieldCheck className="h-3.5 w-3.5 mr-2" />
                {t('unifiedInput.trust.trusted')}
                {inputTrustLevel === 'trusted' && <Check className="h-3 w-3 ml-auto" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setInputTrustLevel('untrusted')}>
                <ShieldAlert className="h-3.5 w-3.5 mr-2" />
                {t('unifiedInput.trust.untrusted')}
                {inputTrustLevel === 'untrusted' && <Check className="h-3 w-3 ml-auto" />}
              </DropdownMenuItem>
              {mode === 'main' && imageGenAvailable && (
                <DropdownMenuItem onClick={() => setEnableImageGeneration(!enableImageGeneration)}>
                  <Sparkles className="h-3.5 w-3.5 mr-2" />
                  ImageGen {enableImageGeneration && <Check className="h-3 w-3 ml-auto" />}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {features.enableImageUpload && (
            <ImageAttachmentPlugin
              selectedImages={[]}
              onImageSelect={handleImageSelect}
              onImageRemove={handleRemoveImage}
              isStreaming={isStreaming}
              mounted={mounted}
            />
          )}
        </div>
      );
    }

    if (effectiveLayoutMode === 'compact') {
      // Compact: Essential controls visible
      return (
        <div className="flex items-center gap-2 mb-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={thinkingMode === 'instant' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setThinkingMode('instant')}
                  data-testid="thinking-mode-trigger-compact"
                >
                  <Zap className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Instant Mode</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={enableRAG ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setEnableRAG(!enableRAG)}
                  data-testid="rag-toggle-compact"
                >
                  <BookText className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>RAG</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={enableTools ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setEnableTools(!enableTools)}
                >
                  <Wrench className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Tools</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={inputTrustLevel === 'untrusted' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() =>
                    setInputTrustLevel(inputTrustLevel === 'trusted' ? 'untrusted' : 'trusted')
                  }
                  disabled={isCoworkMode}
                >
                  {inputTrustLevel === 'trusted' ? (
                    <ShieldCheck className="h-3.5 w-3.5" />
                  ) : (
                    <ShieldAlert className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {inputTrustLevel === 'trusted'
                  ? t('unifiedInput.trust.trusted')
                  : t('unifiedInput.trust.untrusted')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={requiresWorkingDirectory ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2"
                  onClick={handleSelectWorkingDirectory}
                  disabled={isStreaming || isSelectingDirectory}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {workingDirectory
                  ? `${t('unifiedInput.workingDirectory.tooltip')}: ${getShortWorkingDirectory(workingDirectory)}`
                  : t('unifiedInput.workingDirectory.tooltip')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {features.enableImageUpload && (
            <ImageAttachmentPlugin
              selectedImages={[]}
              onImageSelect={handleImageSelect}
              onImageRemove={handleRemoveImage}
              isStreaming={isStreaming}
              mounted={mounted}
            />
          )}
        </div>
      );
    }

    // Full mode: All controls visible (MainChatInput style)
    return (
      <div className="absolute bottom-2 right-2 flex items-center gap-2">
        {/* Thinking Mode Dropdown */}
        <TooltipProvider>
          <Tooltip>
            <DropdownMenu>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-xl shrink-0 border-2 border-muted-foreground/30"
                    disabled={isStreaming || enableImageGeneration}
                    data-testid="thinking-mode-trigger"
                    aria-label="Thinking Mode"
                  >
                    {thinkingModeIcon[thinkingMode as keyof typeof thinkingModeIcon] || (
                      <Brain className="h-4 w-4" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <DropdownMenuContent align="end" side="top" className="w-64">
                <DropdownMenuItem
                  onClick={() => setThinkingMode('instant')}
                  className="cursor-pointer"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  <div>
                    <div className="font-medium">{t('unifiedInput.thinking.instant')}</div>
                    <div className="text-xs text-muted-foreground">
                      {t('unifiedInput.thinking.instant.desc')}
                    </div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setThinkingMode('sequential')}
                  className="cursor-pointer"
                >
                  <Brain className="h-4 w-4 mr-2" />
                  <div>
                    <div className="font-medium">{t('unifiedInput.thinking.sequential')}</div>
                    <div className="text-xs text-muted-foreground">
                      {t('unifiedInput.thinking.sequential.desc')}
                    </div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setThinkingMode('tree-of-thought')}
                  className="cursor-pointer"
                >
                  <Network className="h-4 w-4 mr-2" />
                  <div>
                    <div className="font-medium">{t('unifiedInput.thinking.treeOfThought')}</div>
                    <div className="text-xs text-muted-foreground">
                      {t('unifiedInput.thinking.treeOfThought.desc')}
                    </div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setThinkingMode('deep')}
                  className="cursor-pointer"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  <div>
                    <div className="font-medium">{t('unifiedInput.thinking.deep')}</div>
                    <div className="text-xs text-muted-foreground">
                      {t('unifiedInput.thinking.deep.desc')}
                    </div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setThinkingMode('deep-web-research')}
                  className="cursor-pointer"
                >
                  <Globe className="h-4 w-4 mr-2" />
                  <div>
                    <div className="font-medium">{t('unifiedInput.thinking.deepWebResearch')}</div>
                    <div className="text-xs text-muted-foreground">
                      {t('unifiedInput.thinking.deepWebResearch.desc')}
                    </div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setThinkingMode('coding')}
                  className="cursor-pointer"
                >
                  <Code className="h-4 w-4 mr-2" />
                  <div>
                    <div className="font-medium">{t('unifiedInput.thinking.coding')}</div>
                    <div className="text-xs text-muted-foreground">
                      {t('unifiedInput.thinking.coding.desc')}
                    </div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setThinkingMode('cowork')}
                  className="cursor-pointer"
                >
                  <Users className="h-4 w-4 mr-2" />
                  <div>
                    <div className="font-medium">{t('unifiedInput.thinking.cowork')}</div>
                    <div className="text-xs text-muted-foreground">
                      {t('unifiedInput.thinking.cowork.desc')}
                    </div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSelectWorkingDirectory}
                  className="cursor-pointer"
                  disabled={isSelectingDirectory}
                >
                  <FolderOpen className="h-4 w-4 mr-2" />
                  <div className="min-w-0">
                    <div className="font-medium">
                      {workingDirectory
                        ? t('unifiedInput.workingDirectory.change')
                        : t('unifiedInput.workingDirectory.set')}
                    </div>
                    {workingDirectory && (
                      <div className="text-xs text-muted-foreground truncate">
                        {getShortWorkingDirectory(workingDirectory)}
                      </div>
                    )}
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <TooltipContent side="top">
              <p className="text-xs">Thinking Mode</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Input Trust Dropdown */}
        <TooltipProvider>
          <Tooltip>
            <DropdownMenu>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={inputTrustLevel === 'untrusted' ? 'default' : 'ghost'}
                    size="icon"
                    className="h-9 w-9 rounded-xl shrink-0 border-2 border-muted-foreground/30"
                    disabled={isStreaming || enableImageGeneration}
                    aria-label="Input Trust Level"
                  >
                    {inputTrustIcon}
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <DropdownMenuContent align="end" side="top" className="w-64">
                <div className="px-2 py-1.5 text-xs font-semibold">
                  {t('unifiedInput.trust.title')}
                </div>
                <DropdownMenuItem
                  onClick={() => setInputTrustLevel('trusted')}
                  className="cursor-pointer"
                  disabled={isCoworkMode}
                >
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  <div>
                    <div className="font-medium">{t('unifiedInput.trust.trusted')}</div>
                    <div className="text-xs text-muted-foreground">
                      {t('unifiedInput.trust.trustedDesc')}
                    </div>
                  </div>
                  {inputTrustLevel === 'trusted' && <Check className="h-3 w-3 ml-auto" />}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setInputTrustLevel('untrusted')}
                  className="cursor-pointer"
                >
                  <ShieldAlert className="h-4 w-4 mr-2" />
                  <div>
                    <div className="font-medium">{t('unifiedInput.trust.untrusted')}</div>
                    <div className="text-xs text-muted-foreground">
                      {t('unifiedInput.trust.untrustedDesc')}
                    </div>
                  </div>
                  {inputTrustLevel === 'untrusted' && <Check className="h-3 w-3 ml-auto" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <TooltipContent side="top">
              <p className="text-xs">
                {inputTrustLevel === 'trusted'
                  ? t('unifiedInput.trust.trusted')
                  : t('unifiedInput.trust.untrusted')}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* RAG Toggle */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={enableRAG ? 'default' : 'ghost'}
                size="icon"
                className="h-9 w-9 rounded-xl shrink-0"
                onClick={() => setEnableRAG(!enableRAG)}
                disabled={isStreaming || enableImageGeneration}
                data-testid="rag-toggle"
                aria-label="RAG Toggle"
              >
                <BookText className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">RAG (Retrieval-Augmented Generation)</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Tools Dropdown */}
        <TooltipProvider>
          <Tooltip>
            <DropdownMenu>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={enableTools ? 'default' : 'ghost'}
                    size="icon"
                    className="h-9 w-9 rounded-xl shrink-0 border-2 border-muted-foreground/30"
                    disabled={isStreaming || enableImageGeneration}
                    aria-label="Tools"
                  >
                    <Wrench className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <DropdownMenuContent
                align="end"
                side="top"
                className="w-72 max-h-[400px] overflow-y-auto"
              >
                {/* Tools header with bulk actions */}
                <div className="px-2 py-2 flex items-center justify-between border-b">
                  <span className="text-xs text-muted-foreground">
                    {t('unifiedInput.tools.status', {
                      active: activeToolsCount,
                      total: tools.length,
                    })}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        enableAllTools(tools.map((t) => t.name));
                        setEnableTools(true);
                      }}
                    >
                      {t('unifiedInput.tools.enableAll')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        disableAllTools();
                      }}
                    >
                      {t('unifiedInput.tools.disableAll')}
                    </Button>
                  </div>
                </div>

                {mode === 'main' && mcpServerIssues.length > 0 && (
                  <div className="px-2 py-2 border-b space-y-1">
                    <div className="text-[10px] font-medium text-destructive">
                      {t('unifiedInput.tools.serverStatusTitle')}
                    </div>
                    {mcpServerIssues.map((issue) => (
                      <div
                        key={`${issue.name}:${issue.status}`}
                        className="rounded border border-destructive/20 bg-destructive/10 px-2 py-1 text-[10px] text-destructive"
                      >
                        <div className="font-medium">
                          {issue.name} · {t(`unifiedInput.tools.serverIssueStatus.${issue.status}`)}
                        </div>
                        {issue.errorMessage && (
                          <div className="mt-0.5 line-clamp-2">{issue.errorMessage}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Individual tool toggles */}
                {toolsLoading ? (
                  <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                    {t('unifiedInput.tools.loading')}
                  </div>
                ) : toolsError ? (
                  <div className="px-2 py-4 space-y-2">
                    <div className="text-center text-xs text-destructive font-medium">
                      {t('unifiedInput.tools.error', { error: toolsError })}
                    </div>
                    {mode === 'main' && (
                      <div className="text-center text-[10px] text-muted-foreground">
                        {t('unifiedInput.tools.errorHint')}
                      </div>
                    )}
                  </div>
                ) : tools.length === 0 ? (
                  <div className="px-2 py-4 space-y-2">
                    <div className="text-center text-xs text-muted-foreground">
                      {t('unifiedInput.tools.noTools')}
                    </div>
                    {mode === 'main' && (
                      <div className="text-center text-[10px] text-muted-foreground">
                        {t('unifiedInput.tools.noToolsHint')}
                      </div>
                    )}
                  </div>
                ) : (
                  tools.map((tool: any) => {
                    const isEnabled = enabledTools.has(tool.name);
                    return (
                      <button
                        key={tool.name}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleTool(tool.name);
                          if (!enableTools && !isEnabled) {
                            setEnableTools(true);
                          }
                        }}
                        className="w-full px-2 py-2 flex items-start gap-2 hover:bg-accent cursor-pointer text-left"
                      >
                        <div className="mt-0.5 shrink-0">
                          {isEnabled ? (
                            <div className="h-4 w-4 rounded-sm border-2 border-primary bg-primary flex items-center justify-center">
                              <Check className="h-3 w-3 text-primary-foreground" />
                            </div>
                          ) : (
                            <div className="h-4 w-4 rounded-sm border-2 border-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{tool.name}</div>
                          <div className="text-xs text-muted-foreground line-clamp-2">
                            {tool.description}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <TooltipContent side="top">
              <p className="text-xs">Tools</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* ImageGen Dropdown */}
        {mode === 'main' && imageGenAvailable && (
          <TooltipProvider>
            <Tooltip>
              <DropdownMenu>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant={enableImageGeneration ? 'default' : 'ghost'}
                      size="icon"
                      className="h-9 w-9 rounded-xl shrink-0 border-2 border-muted-foreground/30"
                      disabled={isStreaming}
                      aria-label="Image Generation"
                    >
                      <Sparkles className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <DropdownMenuContent align="end" side="top" className="w-48">
                  <DropdownMenuItem
                    onClick={() => setEnableImageGeneration(!enableImageGeneration)}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span>{t('unifiedInput.imageGen')}</span>
                      <div
                        className={`h-4 w-4 rounded-sm border-2 ${
                          enableImageGeneration
                            ? 'border-primary bg-primary'
                            : 'border-muted-foreground'
                        } flex items-center justify-center`}
                      >
                        {enableImageGeneration && (
                          <Check className="h-3 w-3 text-primary-foreground" />
                        )}
                      </div>
                    </div>
                  </DropdownMenuItem>

                  {/* Provider selection - only show if both providers are enabled */}
                  {imageGenConfig?.comfyui?.enabled && imageGenConfig?.nanobanana?.enabled && (
                    <>
                      <DropdownMenuSeparator />
                      <div className="px-2 py-1 text-xs text-muted-foreground">Provider</div>
                      <DropdownMenuItem
                        onClick={() => setSelectedImageGenProvider('comfyui')}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center justify-between w-full">
                          <span>ComfyUI</span>
                          {selectedImageGenProvider === 'comfyui' && <Check className="h-4 w-4" />}
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setSelectedImageGenProvider('nanobanana')}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center justify-between w-full">
                          <span>NanoBanana</span>
                          {selectedImageGenProvider === 'nanobanana' && (
                            <Check className="h-4 w-4" />
                          )}
                        </div>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <TooltipContent side="top">
                <p className="text-xs">Image Generation</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Image Upload Button */}
        {features.enableImageUpload && (
          <ImageAttachmentPlugin
            selectedImages={[]}
            onImageSelect={handleImageSelect}
            onImageRemove={handleRemoveImage}
            isStreaming={isStreaming}
            mounted={mounted}
          />
        )}

        {/* Send/Stop Button */}
        {isStreaming ? (
          <Button
            onClick={onStopStreaming}
            variant="destructive"
            size="icon"
            className="h-9 w-9 rounded-xl shrink-0"
            aria-label="Stop Streaming"
          >
            <Square className="h-4 w-4 fill-current" />
          </Button>
        ) : (
          <Button
            onClick={handleSend}
            disabled={!hasSendableContent || requiresWorkingDirectory}
            size="icon"
            className="h-9 w-9 rounded-xl shrink-0"
            aria-label="Send Message"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className={`shrink-0 border-t bg-background ${
        effectiveLayoutMode === 'ultra-compact' ? 'p-1.5' : 'p-2'
      }`}
    >
      {/* Drag overlay */}
      <div
        ref={dropZoneRef}
        className={`relative ${isDragging ? 'bg-primary/5' : ''}`}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="absolute inset-0 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-lg z-10 pointer-events-none">
            <div className="text-center">
              <p className="text-sm font-medium text-primary">{t('unifiedInput.fileDrop.title')}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('unifiedInput.fileDrop.subtitle')}
              </p>
            </div>
          </div>
        )}

        {/* Image Generation Progress Bar (Main Chat only) */}
        {mode === 'main' &&
          currentImageGenProgress &&
          currentImageGenProgress.status !== 'completed' && (
            <div className="mb-2">
              <ImageGenerationProgressBar progress={currentImageGenProgress} />
            </div>
          )}

        {/* Agent Progress Display (Coding Agent, Editor Agent, Browser Agent) */}
        {agentProgress && (
          <div className="mb-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs font-medium text-primary">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  <span>
                    {agentProgress.status === 'thinking' &&
                      t('unifiedInput.agentProgress.thinking')}
                    {agentProgress.status === 'executing' &&
                      t('unifiedInput.agentProgress.executing')}
                    {agentProgress.status !== 'thinking' &&
                      agentProgress.status !== 'executing' &&
                      t('unifiedInput.agentProgress.working')}
                  </span>
                  <span className="text-muted-foreground">
                    ({agentProgress.iteration}/{agentProgress.maxIterations})
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground truncate">
                  {agentProgress.message}
                </p>
                {agentProgress.traceMetrics && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    tools:{' '}
                    {agentProgress.traceMetrics.toolStats.total > 0
                      ? `${agentProgress.traceMetrics.toolStats.success}/${agentProgress.traceMetrics.toolStats.total}`
                      : '0/0'}{' '}
                    | approvals: {agentProgress.traceMetrics.approvalStats.approved}/
                    {agentProgress.traceMetrics.approvalStats.feedback}/
                    {agentProgress.traceMetrics.approvalStats.denied}
                  </p>
                )}
                {agentProgress.approvalHistory && agentProgress.approvalHistory.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                      {t('unifiedInput.agentProgress.approvalHistory', {
                        count: agentProgress.approvalHistory.length,
                      })}
                    </summary>
                    <ApprovalHistoryTimeline entries={agentProgress.approvalHistory} />
                  </details>
                )}
              </div>
              {onStopStreaming && (
                <Button
                  onClick={onStopStreaming}
                  variant="ghost"
                  size="sm"
                  className="h-6 shrink-0 text-xs"
                  title={t('unifiedInput.agentProgress.stop')}
                >
                  {t('unifiedInput.agentProgress.stop')}
                </Button>
              )}
            </div>
            {/* Progress bar */}
            <div className="mt-2 h-1 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{
                  width: `${(agentProgress.iteration / agentProgress.maxIterations) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Top controls for ultra-compact and compact modes */}
        {(effectiveLayoutMode === 'ultra-compact' || effectiveLayoutMode === 'compact') &&
          renderControls()}

        {/* Slash Command Autocomplete */}
        <SlashCommandPlugin
          input={input}
          commands={commands}
          onCommandSelect={handleCommandSelect}
          onClose={handleCommandAutocompleteClose}
          selectedIndex={commandAutocompleteIndex}
          onIndexChange={setCommandAutocompleteIndex}
        />

        {/* Persona Autocomplete (Main Chat only) */}
        {mode === 'main' && (
          <PersonaPlugin
            personas={personaSuggestions}
            listboxId={personaListboxId}
            activePersonaId={activePersonaId}
            onPersonaSelect={applyPersonaSelection}
            onClose={handlePersonaAutocompleteClose}
            selectedIndex={personaAutocompleteIndex}
            onIndexChange={setPersonaAutocompleteIndex}
            getPersonaDisplayText={getPersonaDisplayText}
          />
        )}

        <FileReferencePlugin
          suggestions={filteredFileSuggestions}
          selectedIndex={fileAutocompleteIndex}
          onIndexChange={setFileAutocompleteIndex}
          onSelect={applyFileReference}
        />

        {/* Image previews */}
        {(selectedImages.length > 0 || selectedFiles.length > 0) && (
          <div className="mb-2 space-y-2">
            {selectedFiles.length > 0 && (
              <FileAttachmentPlugin
                selectedFiles={selectedFiles}
                onFileRemove={handleRemoveFile}
                isStreaming={isStreaming}
                mounted={mounted}
              />
            )}
            {selectedImages.length > 0 && (
              <ImageAttachmentPlugin
                selectedImages={selectedImages}
                onImageSelect={handleImageSelect}
                onImageRemove={handleRemoveImage}
                isStreaming={isStreaming}
                mounted={mounted}
              />
            )}
          </div>
        )}

        {requiresWorkingDirectory && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2">
            <span className="text-xs text-orange-700 dark:text-orange-400">
              {t('unifiedInput.workingDirectory.requiredForCoding')}
            </span>
            <Button
              size="sm"
              variant="secondary"
              className="ml-auto h-6 px-2 text-xs"
              onClick={handleSelectWorkingDirectory}
              disabled={isSelectingDirectory}
            >
              {isSelectingDirectory
                ? t('unifiedInput.workingDirectory.selecting')
                : t('unifiedInput.workingDirectory.set')}
            </Button>
          </div>
        )}

        {/* Input box */}
        {mode === 'main' && activePersona && (
          <div className="mb-2 flex items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                  <span className="mr-1">{activePersona.avatar || '🤖'}</span>
                  <span className="max-w-[180px] truncate">
                    {getPersonaDisplayText(activePersona, 'name')}
                  </span>
                  <ChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                side="top"
                className="w-64 max-h-72 overflow-y-auto"
              >
                {personas.map((persona) => (
                  <DropdownMenuItem key={persona.id} onClick={() => setActivePersona(persona.id)}>
                    <span className="mr-2">{persona.avatar || '🤖'}</span>
                    <span className="truncate">{getPersonaDisplayText(persona, 'name')}</span>
                    {activePersonaId === persona.id && <Check className="ml-auto h-4 w-4" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        <div
          className={`relative flex items-end gap-2 rounded-2xl border border-input bg-background`}
        >
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            onPaste={handlePaste}
            aria-autocomplete="list"
            aria-expanded={mode === 'main' && personaSuggestions.length > 0}
            aria-controls={
              mode === 'main' && personaSuggestions.length > 0 ? personaListboxId : undefined
            }
            aria-activedescendant={
              mode === 'main' && personaSuggestions.length > 0
                ? activePersonaDescendantId
                : undefined
            }
            placeholder={placeholderText}
            disabled={isStreaming}
            className={`${
              effectiveLayoutMode === 'full'
                ? 'min-h-[80px] max-h-[200px] pr-2 pb-14'
                : effectiveLayoutMode === 'compact'
                  ? 'min-h-[60px] max-h-[150px] pr-2 pb-2'
                  : 'min-h-[40px] max-h-[100px] pr-2 pb-2'
            } resize-none border-0 focus-visible:ring-0 text-sm`}
            rows={effectiveLayoutMode === 'full' ? 3 : effectiveLayoutMode === 'compact' ? 2 : 1}
          />

          {/* Full mode controls inside input box (bottom right) */}
          {effectiveLayoutMode === 'full' && renderControls()}

          {/* Simple send/stop button for compact modes */}
          {effectiveLayoutMode !== 'full' && (
            <div className="flex items-center pb-1 pr-1">
              {isStreaming ? (
                <Button
                  onClick={onStopStreaming}
                  variant={effectiveLayoutMode === 'ultra-compact' ? 'ghost' : 'destructive'}
                  size="icon"
                  className={`${
                    effectiveLayoutMode === 'ultra-compact'
                      ? 'h-6 w-6 rounded-sm'
                      : 'h-7 w-7 rounded-md'
                  } shrink-0`}
                  title={t('unifiedInput.actions.stop')}
                >
                  <Square
                    className={`${
                      effectiveLayoutMode === 'ultra-compact' ? 'h-3 w-3' : 'h-3.5 w-3.5'
                    } ${effectiveLayoutMode === 'compact' ? 'fill-current' : ''}`}
                  />
                </Button>
              ) : (
                <Button
                  onClick={handleSend}
                  disabled={!hasSendableContent || isStreaming || requiresWorkingDirectory}
                  size="icon"
                  className={`${
                    effectiveLayoutMode === 'ultra-compact'
                      ? 'h-6 w-6 rounded-sm'
                      : 'h-7 w-7 rounded-md'
                  } shrink-0 bg-primary hover:bg-primary/90 disabled:opacity-50`}
                  title={t('unifiedInput.actions.send')}
                >
                  <Send
                    className={`${
                      effectiveLayoutMode === 'ultra-compact' ? 'h-3 w-3' : 'h-3.5 w-3.5'
                    }`}
                  />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* LLM Status Bar (Main Chat, full mode only) */}
      {mode === 'main' && effectiveLayoutMode === 'full' && (
        <div className="mt-2">
          <LLMStatusBar
            isStreaming={isStreaming}
            llmConfig={llmConfig}
            messages={messages}
            input={input}
            mounted={mounted}
            tools={tools}
            onConfigUpdate={updateLLMConfig}
          />
        </div>
      )}

      {/* Tool Approval Dialog (Main Chat only) */}
      {mode === 'main' && pendingToolApproval && (
        <ToolApprovalPlugin
          pendingApproval={pendingToolApproval}
          onApprove={handleToolApprove}
          onReject={handleToolReject}
          onAlwaysApprove={handleToolAlwaysApprove}
          isSubmitting={toolApprovalSubmitting}
          errorMessage={toolApprovalError}
          onClearError={clearToolApprovalError}
        />
      )}
    </div>
  );
}
