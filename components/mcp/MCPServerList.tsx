'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2, ChevronDown, ChevronUp, Server, Database, FileText, Globe, Loader2 } from 'lucide-react';
import { MCPServerConfig } from '@/lib/mcp/types';
import { cn } from '@/lib/utils';

interface MCPServerListProps {
  onRefresh?: () => void;
}

export function MCPServerList({ onRefresh }: MCPServerListProps) {
  const [servers, setServers] = useState<MCPServerConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);

  useEffect(() => {
    loadServers();
  }, []);

  const loadServers = async () => {
    setIsLoading(true);
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.mcp.listServers();
        if (result.success && result.data) {
          setServers(result.data);
        }
      }
    } catch (error) {
      console.error('Failed to load MCP servers:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async (name: string, currentEnabled: boolean) => {
    try {
      if (window.electronAPI) {
        // Toggle server
        const result = await window.electronAPI.mcp.toggleServer(name);
        if (result.success) {
          await loadServers();
          onRefresh?.();
        } else {
          console.error('Failed to toggle server:', result.error);
        }
      }
    } catch (error) {
      console.error('Failed to toggle MCP server:', error);
    }
  };

  const handleRemove = async (name: string) => {
    if (!confirm(`'${name}' 서버를 삭제하시겠습니까?`)) {
      return;
    }

    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.mcp.removeServer(name);
        if (result.success) {
          await loadServers();
          onRefresh?.();
        }
      }
    } catch (error) {
      console.error('Failed to remove MCP server:', error);
    }
  };

  const getServerIcon = (name: string) => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('filesystem') || lowerName.includes('file')) return FileText;
    if (lowerName.includes('github') || lowerName.includes('git')) return Globe;
    if (lowerName.includes('database') || lowerName.includes('db')) return Database;
    return Server;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin mb-3" />
        <p className="text-sm">서버 목록 로딩 중...</p>
      </div>
    );
  }

  if (servers.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed p-12 text-center">
        <Server className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
        <h3 className="text-lg font-semibold mb-2">등록된 MCP 서버가 없습니다</h3>
        <p className="text-sm text-muted-foreground mb-4">
          아래에서 새 서버를 추가하여 AI 어시스턴트에 도구를 제공하세요
        </p>
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            <span>파일 시스템</span>
          </div>
          <div className="flex items-center gap-1">
            <Globe className="h-3 w-3" />
            <span>GitHub</span>
          </div>
          <div className="flex items-center gap-1">
            <Database className="h-3 w-3" />
            <span>데이터베이스</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {servers.map((server) => {
        const Icon = getServerIcon(server.name);
        const isExpanded = expandedServer === server.name;

        return (
          <div
            key={server.name}
            className={cn(
              'rounded-lg border transition-all',
              server.enabled !== false
                ? 'bg-card border-border shadow-sm'
                : 'bg-muted/30 border-dashed border-muted-foreground/30'
            )}
          >
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {/* Icon */}
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg shrink-0',
                    server.enabled !== false
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold truncate">{server.name}</h4>
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-full text-xs font-medium',
                        server.enabled !== false
                          ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {server.enabled !== false ? '활성' : '비활성'}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate mt-0.5">
                    {server.command}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                {/* Toggle Switch */}
                <button
                  onClick={() => handleToggle(server.name, server.enabled ?? true)}
                  className={cn(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                    server.enabled !== false ? 'bg-primary' : 'bg-muted'
                  )}
                  title={server.enabled !== false ? '비활성화' : '활성화'}
                >
                  <span
                    className={cn(
                      'inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm',
                      server.enabled !== false ? 'translate-x-6' : 'translate-x-1'
                    )}
                  />
                </button>

                {/* Expand Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setExpandedServer(isExpanded ? null : server.name)
                  }
                  className="h-8 w-8"
                  title={isExpanded ? '접기' : '상세 정보'}
                >
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>

                {/* Delete Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemove(server.name)}
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  title="서버 제거"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Expanded Details */}
            {isExpanded && (
              <div className="px-4 pb-4 pt-0 space-y-3 border-t mt-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">전송 방식</span>
                    <p className="font-mono mt-1">{server.transport}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">인자 개수</span>
                    <p className="mt-1">{server.args.length}개</p>
                  </div>
                </div>

                {server.args.length > 0 && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">실행 인자</span>
                    <div className="mt-1.5 rounded-md bg-muted/50 p-3 font-mono text-xs space-y-1">
                      {server.args.map((arg, index) => (
                        <div key={index} className="text-foreground/80">
                          {arg}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-xs text-muted-foreground pt-2">
                  💡 Agent 모드에서 이 서버의 도구를 사용할 수 있습니다
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
