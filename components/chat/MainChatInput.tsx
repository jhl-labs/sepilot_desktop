'use client';

/**
 * MainChatInput Component
 *
 * Main Chat 전용 입력 컴포넌트
 * UnifiedChatInput + 모든 Main Chat 기능 통합
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send, Square, Brain, BookText, Wrench, Sparkles } from 'lucide-react';
import { useChatInput } from './unified/hooks/useChatInput';
import { useImageUpload } from './unified/hooks/useImageUpload';
import { useFileUpload } from './unified/hooks/useFileUpload';
import { ImageAttachmentPlugin } from './unified/plugins/ImageAttachmentPlugin';
import { PersonaPlugin } from './unified/plugins/PersonaPlugin';
import { ToolApprovalPlugin } from './unified/plugins/ToolApprovalPlugin';
import { isTextFile } from '@/lib/utils';
import { useChatStore } from '@/lib/store/chat-store';
import type { ImageAttachment } from '@/types';
import type { ThinkingMode } from '@/lib/langgraph';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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
    personas,
    activePersonaId,
    setActivePersona,
    pendingToolApproval,
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

  const {
    selectedImages,
    handleImageSelect,
    handleRemoveImage,
    handlePaste,
    clearImages,
  } = useImageUpload();

  const { isDragging, setIsDragging, handleFileDrop } = useFileUpload();

  const [personaAutocompleteIndex, setPersonaAutocompleteIndex] = useState(0);
  const dropZoneRef = useRef<HTMLDivElement>(null);

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
  }, [input]);

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
        for (const img of newImages) {
          handleImageSelect(); // TODO: Fix this - should directly add images
        }
      }
    };

    window.addEventListener('sepilot:file-drop', handleFileDropEvent);
    return () => {
      window.removeEventListener('sepilot:file-drop', handleFileDropEvent);
    };
  }, [setInput]);

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

  // Handle send
  const handleSend = async () => {
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
  };

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
        for (const img of images) {
          // TODO: Fix this - should directly add to selectedImages
          handleImageSelect();
        }
      }
    );
  };

  const placeholderText = isStreaming
    ? '응답 생성 중... (ESC로 중단 가능)'
    : '메시지를 입력하세요... (Shift+Enter로 줄바꿈)';

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

      {/* Top controls: Thinking Mode, RAG, Tools, ImageGen */}
      <div className="flex items-center gap-2 mb-2">
        {/* Thinking Mode Selector */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1">
                <Brain className="h-3.5 w-3.5 text-muted-foreground" />
                <Select
                  value={thinkingMode}
                  onValueChange={(value) => setThinkingMode(value as ThinkingMode)}
                  disabled={isStreaming}
                >
                  <SelectTrigger className="h-7 w-[110px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simple" className="text-xs">
                      Simple
                    </SelectItem>
                    <SelectItem value="advanced" className="text-xs">
                      Advanced
                    </SelectItem>
                    <SelectItem value="coding" className="text-xs">
                      Coding
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TooltipTrigger>
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
                variant={enableRAG ? 'default' : 'outline'}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setEnableRAG(!enableRAG)}
                disabled={isStreaming}
              >
                <BookText className="h-3.5 w-3.5 mr-1" />
                RAG
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">Retrieval-Augmented Generation</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Tools Toggle */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={enableTools ? 'default' : 'outline'}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setEnableTools(!enableTools)}
                disabled={isStreaming}
              >
                <Wrench className="h-3.5 w-3.5 mr-1" />
                Tools
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">Enable tool calling (search, file ops, etc.)</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* ImageGen Toggle */}
        {imageGenAvailable && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={enableImageGeneration ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setEnableImageGeneration(!enableImageGeneration)}
                  disabled={isStreaming}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  ImageGen
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">Enable image generation</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

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

        {/* Input box */}
        <div className="flex items-end gap-2 rounded-lg border border-input bg-background">
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
            className="min-h-[60px] max-h-[200px] resize-none border-0 focus-visible:ring-0 text-sm"
            rows={2}
          />

          <div className="flex items-center gap-1 p-2 shrink-0">
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

      {/* Tool Approval Dialog */}
      {pendingToolApproval && (
        <ToolApprovalPlugin
          pendingApproval={pendingToolApproval}
          onApprove={async (toolCalls) => {
            // Handled by useToolApproval hook in ChatContainer
          }}
          onReject={async () => {
            // Handled by useToolApproval hook in ChatContainer
          }}
          onAlwaysApprove={async (toolCalls) => {
            // Handled by useToolApproval hook in ChatContainer
          }}
        />
      )}
    </div>
  );
}
