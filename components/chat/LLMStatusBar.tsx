'use client';

import { useState, useMemo } from 'react';
import { Minimize2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { LLMConfig, Message } from '@/types';

export interface ToolInfo {
  name: string;
  description: string;
  serverName: string;
}

interface LLMStatusBarProps {
  isStreaming: boolean;
  llmConfig: LLMConfig | null;
  messages: Message[];
  input: string;
  mounted: boolean;
  tools?: ToolInfo[];
  onCompact?: () => void;
  onConfigUpdate?: (config: LLMConfig) => void;
}

export function LLMStatusBar({
  isStreaming,
  llmConfig,
  messages,
  input,
  mounted,
  tools = [],
  onCompact,
  onConfigUpdate,
}: LLMStatusBarProps) {
  const [editingField, setEditingField] = useState<'maxTokens' | 'temperature' | null>(null);
  const [editValue, setEditValue] = useState('');

  // Group tools by server
  const groupedTools = useMemo(() => {
    const groups: Record<string, ToolInfo[]> = {};
    tools.forEach((tool) => {
      if (!groups[tool.serverName]) {
        groups[tool.serverName] = [];
      }
      groups[tool.serverName].push(tool);
    });
    return groups;
  }, [tools]);

  // Estimate token count for context usage display
  // Rough estimation: ~4 chars per token for English, ~2-3 for Korean
  const MAX_CONTEXT_TOKENS = 128000; // Default max context (can be model-specific)
  const contextUsage = useMemo(() => {
    const totalChars = messages.reduce((sum, msg) => sum + (msg.content?.length || 0), 0);
    const inputChars = input.length;
    // Use ~3 chars per token as a rough estimate for mixed content
    const estimatedTokens = Math.ceil((totalChars + inputChars) / 3);
    return {
      used: estimatedTokens,
      max: MAX_CONTEXT_TOKENS,
      percentage: Math.min(100, (estimatedTokens / MAX_CONTEXT_TOKENS) * 100),
    };
  }, [messages, input]);

  // Format token count for display (e.g., 1.2K, 45K)
  const formatTokens = (tokens: number) => {
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K`;
    }
    return tokens.toString();
  };

  // Start editing a field
  const startEditing = (field: 'maxTokens' | 'temperature') => {
    if (!llmConfig) {
      return;
    }
    setEditingField(field);
    setEditValue(field === 'maxTokens' ? String(llmConfig.maxTokens) : String(llmConfig.temperature));
  };

  // Save edited field
  const saveEditedField = () => {
    if (!editingField || !llmConfig) {
      setEditingField(null);
      return;
    }

    let newValue: number;
    if (editingField === 'maxTokens') {
      newValue = parseInt(editValue, 10);
      if (isNaN(newValue) || newValue < 1) {
        setEditingField(null);
        return;
      }
    } else {
      newValue = parseFloat(editValue);
      if (isNaN(newValue) || newValue < 0 || newValue > 2) {
        setEditingField(null);
        return;
      }
    }

    const updatedConfig = {
      ...llmConfig,
      [editingField]: newValue,
    };

    setEditingField(null);
    onConfigUpdate?.(updatedConfig);
  };

  // Handle key press in edit input
  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEditedField();
    } else if (e.key === 'Escape') {
      setEditingField(null);
    }
  };

  return (
    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground/70">
      <div className="flex items-center gap-2">
        {isStreaming ? (
          <span className="text-primary animate-pulse">응답 생성 중... (Esc로 중지)</span>
        ) : llmConfig ? (
          <>
            <span title={`Provider: ${llmConfig.provider}`}>{llmConfig.model}</span>
            <span className="text-muted-foreground/50">·</span>
            {editingField === 'maxTokens' ? (
              <input
                type="number"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={saveEditedField}
                onKeyDown={handleEditKeyDown}
                className="w-16 bg-transparent border-b border-primary outline-none text-center"
                autoFocus
                min={1}
              />
            ) : (
              <span
                onClick={() => startEditing('maxTokens')}
                className="cursor-pointer hover:text-primary transition-colors"
                title="클릭하여 수정 (최대 출력 토큰)"
              >
                max {llmConfig.maxTokens}
              </span>
            )}
            <span className="text-muted-foreground/50">·</span>
            {editingField === 'temperature' ? (
              <input
                type="number"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={saveEditedField}
                onKeyDown={handleEditKeyDown}
                className="w-12 bg-transparent border-b border-primary outline-none text-center"
                autoFocus
                min={0}
                max={2}
                step={0.1}
              />
            ) : (
              <span
                onClick={() => startEditing('temperature')}
                className="cursor-pointer hover:text-primary transition-colors"
                title="클릭하여 수정 (Temperature: 0~2)"
              >
                temp {llmConfig.temperature}
              </span>
            )}
            {tools.length > 0 && (
              <>
                <span className="text-muted-foreground/50">·</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className="flex items-center gap-1 cursor-pointer hover:text-primary transition-colors"
                      title="사용 가능한 툴 목록 보기"
                    >
                      <Wrench className="h-3 w-3" />
                      <span>{tools.length} tools</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 max-h-96 overflow-y-auto" side="top" align="start">
                    <div className="space-y-3">
                      <div className="font-semibold text-sm border-b pb-2">
                        사용 가능한 툴 ({tools.length}개)
                      </div>
                      {Object.entries(groupedTools).map(([serverName, serverTools]) => (
                        <div key={serverName} className="space-y-1">
                          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            {serverName === 'builtin' ? 'Built-in Tools' : serverName}
                            <span className="ml-1 text-muted-foreground/70">({serverTools.length})</span>
                          </div>
                          <div className="space-y-1 pl-2">
                            {serverTools.map((tool) => (
                              <div
                                key={`${tool.serverName}-${tool.name}`}
                                className="text-xs py-1 border-l-2 border-muted pl-2"
                              >
                                <div className="font-mono font-medium">{tool.name}</div>
                                <div className="text-muted-foreground text-[10px] mt-0.5">
                                  {tool.description}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </>
            )}
          </>
        ) : (
          <span>모델 설정 필요</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`${contextUsage.percentage > 80 ? 'text-orange-500' : ''} ${contextUsage.percentage > 95 ? 'text-red-500' : ''}`}
          title={`컨텍스트 사용량: ${contextUsage.used.toLocaleString()} / ${contextUsage.max.toLocaleString()} 토큰 (추정)`}
        >
          {formatTokens(contextUsage.used)} / {formatTokens(contextUsage.max)}
        </span>
        {mounted && messages.length > 2 && onCompact && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={onCompact}
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-xs"
                  disabled={isStreaming}
                >
                  <Minimize2 className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>컨텍스트 압축 (구현 예정)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}
