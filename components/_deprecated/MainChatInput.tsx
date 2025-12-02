'use client';

/**
 * MainChatInput Component
 *
 * Main Chat 전용 입력 컴포넌트
 * _deprecated/InputBox.tsx 스타일 완전 복원
 */

import { useState, useEffect, useRef, useCallback } from 'react';
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
import { useChatInput } from './unified/hooks/useChatInput';
import { useImageUpload } from './unified/hooks/useImageUpload';
import { useFileUpload } from './unified/hooks/useFileUpload';
import { ImageAttachmentPlugin } from './unified/plugins/ImageAttachmentPlugin';
import { PersonaPlugin } from './unified/plugins/PersonaPlugin';
import { ToolApprovalPlugin } from './unified/plugins/ToolApprovalPlugin';
import { LLMStatusBar } from './LLMStatusBar';
import { ImageGenerationProgressBar } from './ImageGenerationProgressBar';
import { useChatStore } from '@/lib/store/chat-store';
import { isElectron } from '@/lib/platform';
import type { ImageAttachment } from '@/types';

interface ToolInfo {
  name: string;
  description: string;
  serverName: string;
}

interface MainChatInputProps {
  onSendMessage: (message: string, images?: ImageAttachment[]) => Promise<void>;
  onStopStreaming?: () => void;
  isStreaming: boolean;
  imageGenAvailable: boolean;
  mounted: boolean;
}

export function MainChatInput({
  onSendMessage,
  onStopStreaming,
  isStreaming,
  imageGenAvailable,
  mounted,
}: MainChatInputProps) {
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

  const [personaAutocompleteIndex, setPersonaAutocompleteIndex] = useState(0);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [selectedImageGenProvider, setSelectedImageGenProvider] = useState<
    'comfyui' | 'nanobanana'
  >('comfyui');
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Load tools from IPC (MCP servers)
  useEffect(() => {
    if (!isElectron() || !window.electronAPI?.mcp) {
      return;
    }

    const loadTools = async () => {
      try {
        const response = await window.electronAPI.mcp.getAllTools();
        if (response.success && response.data) {
          setTools(response.data);
        }
      } catch (error) {
        console.error('[MainChatInput] Failed to load tools:', error);
      }
    };

    loadTools();
  }, []);

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

    await onSendMessage(message, images);

    // Auto-focus after send
    setTimeout(() => focusInput(), 100);
  }, [input, isStreaming, selectedImages, clearInput, clearImages, onSendMessage, focusInput]);

  // Handle Quick Input message (auto-send)
  useEffect(() => {
    const handleAutoSendMessage = async (e: Event) => {
      const customEvent = e as CustomEvent<{
        message: string;
        systemMessage?: string;
      }>;
      const { message, systemMessage } = customEvent.detail;

      if (message.trim()) {
        setInput(message);
        // Store system message in sessionStorage for streaming hook to pick up
        if (systemMessage) {
          sessionStorage.setItem('sepilot_quick_system_message', systemMessage);
        }
        // Auto-send
        setTimeout(() => {
          handleSend();
        }, 100);
      }
    };

    window.addEventListener('sepilot:auto-send-message', handleAutoSendMessage);
    return () => {
      window.removeEventListener('sepilot:auto-send-message', handleAutoSendMessage);
    };
  }, [handleSend, setInput]);

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

  // Handle Persona autocomplete navigation
  useEffect(() => {
    const handlePersonaKeyDown = (e: globalThis.KeyboardEvent) => {
      const personaCommand = input.match(/^\/persona\s+(.*)$/);
      if (!personaCommand) {
        return;
      }

      const filteredPersonas = personas.filter(
        (p) =>
          p.name.toLowerCase().includes(personaCommand[1].toLowerCase()) ||
          p.description.toLowerCase().includes(personaCommand[1].toLowerCase())
      );

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
  }, [input, personas, personaAutocompleteIndex, isComposing, clearInput, setActivePersona]);

  // Handle drag events
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
  };

  const placeholderText = isStreaming
    ? '응답 생성 중... (ESC로 중단 가능)'
    : '메시지를 입력하세요... (Shift+Enter로 줄바꿈)';

  // Thinking mode icon mapping
  const thinkingModeIcon = {
    instant: <Zap className="h-4 w-4" />,
    sequential: <Brain className="h-4 w-4" />,
    'tree-of-thought': <Network className="h-4 w-4" />,
    deep: <Sparkles className="h-4 w-4" />,
    'deep-web-research': <Globe className="h-4 w-4" />,
    coding: <Code className="h-4 w-4" />,
  };

  return (
    <div
      ref={dropZoneRef}
      className={`shrink-0 border-t bg-background p-2 transition-colors ${isDragging ? 'bg-primary/5' : ''}`}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-lg z-10 pointer-events-none m-2">
          <div className="text-center">
            <p className="text-sm font-medium text-primary">파일을 여기에 드롭하세요</p>
            <p className="text-xs text-muted-foreground mt-1">텍스트 파일 또는 이미지</p>
          </div>
        </div>
      )}

      {/* Image Generation Progress Bar */}
      {currentImageGenProgress && currentImageGenProgress.status !== 'completed' && (
        <div className="mb-2">
          <ImageGenerationProgressBar progress={currentImageGenProgress} />
        </div>
      )}

      {/* Main input area */}
      <div className="relative">
        {/* Persona Autocomplete */}
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

        {/* Input box with controls inside */}
        <div className="relative flex items-end gap-2 rounded-2xl border border-input bg-background">
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
            className="min-h-[80px] max-h-[200px] resize-none border-0 focus-visible:ring-0 text-sm pr-2 pb-14"
            rows={3}
          />

          {/* Control buttons at bottom inside border */}
          <div className="absolute bottom-2 right-2 flex items-center gap-1">
            {/* Thinking Mode Dropdown */}
            <TooltipProvider>
              <Tooltip>
                <DropdownMenu>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-xl shrink-0"
                        disabled={isStreaming}
                      >
                        {thinkingModeIcon[thinkingMode as keyof typeof thinkingModeIcon] || (
                          <Brain className="h-4 w-4" />
                        )}
                        <ChevronDown className="h-3 w-3 ml-0.5 opacity-50" />
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
                        <div className="font-medium">Instant</div>
                        <div className="text-xs text-muted-foreground">빠른 응답</div>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setThinkingMode('sequential')}
                      className="cursor-pointer"
                    >
                      <Brain className="h-4 w-4 mr-2" />
                      <div>
                        <div className="font-medium">Sequential</div>
                        <div className="text-xs text-muted-foreground">단계별 사고</div>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setThinkingMode('tree-of-thought')}
                      className="cursor-pointer"
                    >
                      <Network className="h-4 w-4 mr-2" />
                      <div>
                        <div className="font-medium">Tree of Thought</div>
                        <div className="text-xs text-muted-foreground">다중 경로 탐색</div>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setThinkingMode('deep')}
                      className="cursor-pointer"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      <div>
                        <div className="font-medium">Deep</div>
                        <div className="text-xs text-muted-foreground">깊이 있는 분석</div>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setThinkingMode('deep-web-research')}
                      className="cursor-pointer"
                    >
                      <Globe className="h-4 w-4 mr-2" />
                      <div>
                        <div className="font-medium">Deep Web Research</div>
                        <div className="text-xs text-muted-foreground">웹 검색 기반 심층 조사</div>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setThinkingMode('coding')}
                      className="cursor-pointer"
                    >
                      <Code className="h-4 w-4 mr-2" />
                      <div>
                        <div className="font-medium">Coding</div>
                        <div className="text-xs text-muted-foreground">코딩 최적화</div>
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
                    disabled={isStreaming}
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
                        className="h-9 w-9 rounded-xl shrink-0"
                        disabled={isStreaming}
                      >
                        <Wrench className="h-4 w-4" />
                        <ChevronDown className="h-3 w-3 ml-0.5 opacity-50" />
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
                        {enabledTools.size}/{tools.length} 활성화
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
                          전체 활성화
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
                          전체 비활성화
                        </Button>
                      </div>
                    </div>

                    {/* Individual tool toggles */}
                    {tools.map((tool) => {
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
                    })}

                    {tools.length === 0 && (
                      <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                        도구를 불러오는 중...
                      </div>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <TooltipContent side="top">
                  <p className="text-xs">Tools</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* ImageGen Dropdown */}
            {imageGenAvailable && (
              <TooltipProvider>
                <Tooltip>
                  <DropdownMenu>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant={enableImageGeneration ? 'default' : 'ghost'}
                          size="icon"
                          className="h-9 w-9 rounded-xl shrink-0"
                          disabled={isStreaming}
                        >
                          <Sparkles className="h-4 w-4" />
                          <ChevronDown className="h-3 w-3 ml-0.5 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <DropdownMenuContent align="end" side="top" className="w-48">
                      <DropdownMenuItem
                        onClick={() => setEnableImageGeneration(!enableImageGeneration)}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center justify-between w-full">
                          <span>이미지 생성</span>
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
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <TooltipContent side="top">
                    <p className="text-xs">Image Generation</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Image Upload Button */}
            <ImageAttachmentPlugin
              selectedImages={[]}
              onImageSelect={handleImageSelect}
              onImageRemove={handleRemoveImage}
              isStreaming={isStreaming}
              mounted={mounted}
            />

            {/* Send/Stop Button */}
            {isStreaming ? (
              <Button
                onClick={onStopStreaming}
                variant="destructive"
                size="icon"
                className="h-9 w-9 rounded-xl shrink-0"
                title="중단 (ESC)"
                aria-label="응답 생성 중단"
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSend}
                disabled={!input.trim()}
                size="icon"
                className="h-9 w-9 rounded-xl shrink-0"
                title="전송 (Enter)"
                aria-label="메시지 전송"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* LLM Status Bar */}
      <div className="mt-2">
        <LLMStatusBar
          isStreaming={isStreaming}
          llmConfig={null}
          messages={messages}
          input={input}
          mounted={mounted}
          tools={tools}
        />
      </div>

      {/* Tool Approval Dialog */}
      {pendingToolApproval && (
        <ToolApprovalPlugin
          pendingApproval={pendingToolApproval}
          onApprove={async (_toolCalls) => {
            // Handled by useToolApproval hook in ChatContainer
          }}
          onReject={async () => {
            // Handled by useToolApproval hook in ChatContainer
          }}
          onAlwaysApprove={async (_toolCalls) => {
            // Handled by useToolApproval hook in ChatContainer
          }}
        />
      )}
    </div>
  );
}
