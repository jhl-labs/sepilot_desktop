'use client';

/**
 * UnifiedChatInput Component
 *
 * 통합 입력 영역 - 모든 Chat 모드에서 사용
 * Width 기반 자동 Responsive Layout (Ultra-Compact / Compact / Full)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
  ChevronDown,
  Check,
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
import { useFileUpload } from './hooks/useFileUpload';
import { useToolApproval } from './hooks/useToolApproval';
import { useConfigLoader } from './hooks/useConfigLoader';
import { ImageAttachmentPlugin } from './plugins/ImageAttachmentPlugin';
import { PersonaPlugin } from './plugins/PersonaPlugin';
import { ToolApprovalPlugin } from './plugins/ToolApprovalPlugin';
import { LLMStatusBar } from '../LLMStatusBar';
import { ImageGenerationProgressBar } from '../ImageGenerationProgressBar';
import { useChatStore } from '@/lib/store/chat-store';
import { isElectron } from '@/lib/platform';
import type { ImageAttachment, AgentProgress } from '@/types';
import type { Persona } from '@/types/persona';
import type { ChatConfig } from './types';

interface ToolInfo {
  name: string;
  description: string;
  serverName: string;
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
  } = useChatStore();

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

  const { selectedImages, handleImageSelect, handleRemoveImage, handlePaste, clearImages } =
    useImageUpload();

  const { isDragging, setIsDragging, handleFileDrop } = useFileUpload();

  const { handleToolApprove, handleToolReject, handleToolAlwaysApprove } = useToolApproval();

  // Local state
  const [personaAutocompleteIndex, setPersonaAutocompleteIndex] = useState(0);
  const [tools, _setTools] = useState<ToolInfo[]>([]);
  const [toolsLoading, setToolsLoading] = useState(true);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [imageGenConfig, setImageGenConfig] = useState<any>(null);
  const { selectedImageGenProvider, setSelectedImageGenProvider } = useChatStore();
  const dropZoneRef = useRef<HTMLDivElement>(null);

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
        if (result.success && result.data?.imageGen) {
          setImageGenConfig(result.data.imageGen);
          // Set default provider if both are enabled
          if (
            result.data.imageGen.comfyui?.enabled &&
            result.data.imageGen.nanobanana?.enabled &&
            !selectedImageGenProvider
          ) {
            setSelectedImageGenProvider(result.data.imageGen.provider);
          }
        }
      } catch (error) {
        console.error('[UnifiedChatInput] Failed to load imageGen config:', error);
      }
    };

    loadImageGenConfig();
  }, [mode, selectedImageGenProvider, setSelectedImageGenProvider]);

  // Load tools from IPC (all modes, but filtered by mode and thinkingMode)
  useEffect(() => {
    if (!isElectron() || !window.electronAPI?.mcp) {
      setToolsLoading(false);
      return;
    }

    const loadTools = async () => {
      setToolsLoading(true);
      setToolsError(null);
      try {
        const response = await window.electronAPI.mcp.getAllTools();
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
            // Main mode: MCP server tools only (+ Coding Agent tools if thinkingMode === 'coding')
            const codingAgentTools = new Set([
              'file_read',
              'file_write',
              'file_edit',
              'file_list',
              'command_execute',
              'grep_search',
            ]);
            filteredTools = response.data.filter((tool) => {
              // Include all MCP server tools (non-builtin)
              if (tool.serverName !== 'builtin') {
                return true;
              }
              // Include Coding Agent builtin tools only when thinkingMode is 'coding'
              if (thinkingMode === 'coding') {
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
        setToolsError(error.message || 'Failed to load tools');
      } finally {
        setToolsLoading(false);
      }
    };

    loadTools();
  }, [mode, thinkingMode]);

  // Get current conversation's image generation progress
  const currentImageGenProgress = activeConversationId
    ? imageGenerationProgress.get(activeConversationId) || null
    : null;

  // Handle send
  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) {
      return;
    }

    const message = input.trim();
    const images = selectedImages.length > 0 ? selectedImages : undefined;

    clearInput();
    clearImages();

    if (onSendMessage) {
      await onSendMessage(message, images);
    }

    // Auto-focus after send
    setTimeout(() => focusInput(), 100);
  }, [input, isStreaming, selectedImages, clearInput, clearImages, onSendMessage, focusInput]);

  // Handle Quick Input message (auto-send)
  // Only handle in Main Chat mode to prevent duplicate sends
  const lastProcessedMessageRef = useRef<string | null>(null);
  const processingRef = useRef(false);

  useEffect(() => {
    // Only register listener for Main Chat mode
    if (mode !== 'main') {
      return;
    }

    const handleAutoSendMessage = async (e: Event) => {
      const customEvent = e as CustomEvent<{ userMessage: string }>;
      const { userMessage } = customEvent.detail;

      // Prevent duplicate processing
      if (!userMessage || !userMessage.trim()) {
        return;
      }

      // Check if this message was already processed
      if (lastProcessedMessageRef.current === userMessage || processingRef.current) {
        console.warn('[UnifiedChatInput] Message already processed, ignoring:', userMessage);
        return;
      }

      // Mark as processing
      processingRef.current = true;
      lastProcessedMessageRef.current = userMessage;

      console.warn('[UnifiedChatInput] Processing sepilot:auto-send-message event:', userMessage);

      try {
        // Set input and immediately send
        setInput(userMessage);

        // Wait for input to be set, then trigger send
        setTimeout(() => {
          if (onSendMessage) {
            onSendMessage(userMessage, selectedImages)
              .catch((error) => {
                console.error('[UnifiedChatInput] Auto-send failed:', error);
              })
              .finally(() => {
                // Reset processing flag after a delay to allow for rapid successive messages
                setTimeout(() => {
                  processingRef.current = false;
                  // Clear the last processed message after a short delay
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

    console.warn(
      '[UnifiedChatInput] Registering sepilot:auto-send-message listener (Main Chat only)'
    );
    window.addEventListener('sepilot:auto-send-message', handleAutoSendMessage);
    return () => {
      console.warn('[UnifiedChatInput] Removing sepilot:auto-send-message listener');
      window.removeEventListener('sepilot:auto-send-message', handleAutoSendMessage);
    };
  }, [mode, onSendMessage, selectedImages, setInput]);

  // Handle file drop event from ChatArea
  useEffect(() => {
    const handleFileDropEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{
        textContents: string[];
        imageFiles: { filename: string; mimeType: string; base64: string }[];
      }>;
      const { textContents, imageFiles } = customEvent.detail;

      if (textContents.length > 0) {
        const combinedText = textContents.join('\n\n');
        setInput((prev) => (prev ? `${prev}\n\n${combinedText}` : combinedText));
      }

      if (imageFiles.length > 0) {
        const newImages: ImageAttachment[] = imageFiles.map((img, idx) => ({
          id: `drop-${Date.now()}-${idx}`,
          path: '',
          filename: img.filename,
          mimeType: img.mimeType,
          base64: img.base64,
        }));
        // Use imageUpload hook's state
        for (const _img of newImages) {
          handleImageSelect(); // TODO: Fix this - should directly add images
        }
      }
    };

    window.addEventListener('sepilot:file-drop', handleFileDropEvent);
    return () => {
      window.removeEventListener('sepilot:file-drop', handleFileDropEvent);
    };
  }, [setInput, handleImageSelect]);

  // Handle Esc key to stop streaming
  useEffect(() => {
    const handleEscKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && isStreaming && onStopStreaming) {
        onStopStreaming();
      }
    };

    window.addEventListener('keydown', handleEscKey);
    return () => window.removeEventListener('keydown', handleEscKey);
  }, [isStreaming, onStopStreaming]);

  // Handle Persona autocomplete navigation (Main Chat only)
  useEffect(() => {
    if (mode !== 'main') {
      return;
    }

    const handlePersonaKeyDown = (e: globalThis.KeyboardEvent) => {
      const personaCommand = input.match(/^\/persona\s+(.*)$/);
      if (!personaCommand) {
        return;
      }

      const filteredPersonas = personas.filter((p) => {
        const name = getPersonaDisplayText(p, 'name');
        const description = getPersonaDisplayText(p, 'description');
        const searchTerm = personaCommand[1].toLowerCase();
        return (
          name.toLowerCase().includes(searchTerm) || description.toLowerCase().includes(searchTerm)
        );
      });

      if (filteredPersonas.length === 0) {
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setPersonaAutocompleteIndex((prev) => (prev + 1) % filteredPersonas.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setPersonaAutocompleteIndex(
          (prev) => (prev - 1 + filteredPersonas.length) % filteredPersonas.length
        );
      } else if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
        e.preventDefault();
        const selectedPersona = filteredPersonas[personaAutocompleteIndex];
        if (selectedPersona) {
          setActivePersona(selectedPersona.id);
          clearInput();
        }
      }
    };

    window.addEventListener('keydown', handlePersonaKeyDown);
    return () => window.removeEventListener('keydown', handlePersonaKeyDown);
  }, [input, personas, personaAutocompleteIndex, isComposing, clearInput, setActivePersona, mode]);

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
        (textContent) => {
          setInput((prev) => (prev ? `${prev}\n\n${textContent}` : textContent));
        },
        (images) => {
          // Add images to selectedImages
          for (const _img of images) {
            // TODO: Fix this - should directly add to selectedImages
            handleImageSelect();
          }
        }
      );
    },
    [handleFileDrop, handleImageSelect]
  );

  const placeholderText = isStreaming
    ? t('unifiedInput.placeholder.generating')
    : effectiveLayoutMode === 'ultra-compact'
      ? t('unifiedInput.placeholder.ultraCompact')
      : t('unifiedInput.placeholder.default');

  // Thinking mode icon mapping
  const thinkingModeIcon = {
    instant: <Zap className="h-4 w-4" />,
    sequential: <Brain className="h-4 w-4" />,
    'tree-of-thought': <Network className="h-4 w-4" />,
    deep: <Sparkles className="h-4 w-4" />,
    'deep-web-research': <Globe className="h-4 w-4" />,
    coding: <Code className="h-4 w-4" />,
  };

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
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setEnableRAG(!enableRAG)}>
                <BookText className="h-3.5 w-3.5 mr-2" />
                RAG {enableRAG && <Check className="h-3 w-3 ml-auto" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEnableTools(!enableTools)}>
                <Wrench className="h-3.5 w-3.5 mr-2" />
                Tools {enableTools && <Check className="h-3 w-3 ml-auto" />}
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
              </DropdownMenuContent>
            </DropdownMenu>
            <TooltipContent side="top">
              <p className="text-xs">Thinking Mode</p>
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
                      active: enabledTools.size,
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
                  tools.map((tool) => {
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
          >
            <Square className="h-4 w-4 fill-current" />
          </Button>
        ) : (
          <Button
            onClick={handleSend}
            disabled={!input.trim()}
            size="icon"
            className="h-9 w-9 rounded-xl shrink-0"
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

        {/* Persona Autocomplete (Main Chat only) */}
        {mode === 'main' && (
          <PersonaPlugin
            input={input}
            personas={personas}
            activePersonaId={activePersonaId}
            onPersonaSelect={setActivePersona}
            onInputClear={clearInput}
            onClose={() => setPersonaAutocompleteIndex(0)}
            selectedIndex={personaAutocompleteIndex}
            onIndexChange={setPersonaAutocompleteIndex}
          />
        )}

        {/* Image previews */}
        {selectedImages.length > 0 && (
          <div className="mb-2">
            <ImageAttachmentPlugin
              selectedImages={selectedImages}
              onImageSelect={handleImageSelect}
              onImageRemove={handleRemoveImage}
              isStreaming={isStreaming}
              mounted={mounted}
            />
          </div>
        )}

        {/* Input box */}
        <div
          className={`relative flex items-end gap-2 rounded-2xl border border-input bg-background`}
        >
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, handleSend)}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            onPaste={handlePaste}
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
                  disabled={!input.trim() || isStreaming}
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
        />
      )}
    </div>
  );
}
