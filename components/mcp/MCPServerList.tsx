'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Trash2,
  ChevronDown,
  ChevronUp,
  Server,
  Database,
  FileText,
  Globe,
  Loader2,
  Terminal,
  Cloud,
  RefreshCw,
  Power,
  PowerOff,
  Wrench,
  AlertCircle,
  CheckCircle2,
  Clock,
  Search,
  Code,
  Zap,
} from 'lucide-react';
import { MCPServerConfig } from '@/lib/mcp/types';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface MCPServerListProps {
  onRefresh?: () => void;
}

interface ServerWithStatus extends MCPServerConfig {
  status?: 'connected' | 'disconnected' | 'connecting' | 'error';
  toolCount?: number;
  tools?: string[];
  lastConnected?: number;
  errorMessage?: string;
}

export function MCPServerList({ onRefresh }: MCPServerListProps) {
  const [servers, setServers] = useState<ServerWithStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [togglingServer, setTogglingServer] = useState<string | null>(null);
  const [refreshingServer, setRefreshingServer] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; serverName: string | null }>({
    open: false,
    serverName: null,
  });

  useEffect(() => {
    loadServers();
  }, []);

  const loadServers = async () => {
    setIsLoading(true);
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.mcp.listServers();
        if (result.success && result.data) {
          // 서버 상태와 도구 정보 가져오기
          const serversWithStatus: ServerWithStatus[] = await Promise.all(
            result.data.map(async (server) => {
              try {
                const statusResult = await window.electronAPI!.mcp.getServerStatus(server.name);
                return {
                  ...server,
                  status: statusResult.success ? statusResult.data?.status : 'disconnected',
                  toolCount: statusResult.data?.toolCount,
                  tools: statusResult.data?.tools,
                };
              } catch {
                return {
                  ...server,
                  status: 'disconnected' as const,
                };
              }
            })
          );
          setServers(serversWithStatus);
        }
      }
    } catch (error) {
      console.error('Failed to load MCP servers:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async (name: string) => {
    setTogglingServer(name);
    try {
      if (window.electronAPI) {
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
    } finally {
      setTogglingServer(null);
    }
  };

  const handleRefreshServer = async (name: string) => {
    setRefreshingServer(name);
    try {
      if (window.electronAPI) {
        // 서버 재연결
        await window.electronAPI.mcp.toggleServer(name);
        await window.electronAPI.mcp.toggleServer(name);
        await loadServers();
        onRefresh?.();
      }
    } catch (error) {
      console.error('Failed to refresh MCP server:', error);
    } finally {
      setRefreshingServer(null);
    }
  };

  const handleRemove = async () => {
    const name = deleteDialog.serverName;
    if (!name) {return;}

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
    } finally {
      setDeleteDialog({ open: false, serverName: null });
    }
  };

  const getServerIcon = (server: MCPServerConfig) => {
    if (server.transport === 'sse') {return Cloud;}

    const lowerName = server.name.toLowerCase();
    if (lowerName.includes('filesystem') || lowerName.includes('file')) {return FileText;}
    if (lowerName.includes('github')) {return Globe;}
    if (lowerName.includes('git')) {return Code;}
    if (lowerName.includes('database') || lowerName.includes('db') || lowerName.includes('sqlite')) {return Database;}
    if (lowerName.includes('search') || lowerName.includes('brave')) {return Search;}
    return Terminal;
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'connected':
        return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
      case 'connecting':
        return <Loader2 className="h-3.5 w-3.5 text-yellow-500 animate-spin" />;
      case 'error':
        return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
      default:
        return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const getStatusText = (status?: string) => {
    switch (status) {
      case 'connected':
        return '연결됨';
      case 'connecting':
        return '연결 중...';
      case 'error':
        return '오류';
      default:
        return '대기 중';
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'connected':
        return 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20';
      case 'connecting':
        return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20';
      case 'error':
        return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
      default:
        return 'bg-muted text-muted-foreground border-muted';
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <div className="relative">
          <Server className="h-12 w-12 opacity-20" />
          <Loader2 className="h-6 w-6 animate-spin absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <p className="text-sm mt-4 font-medium">서버 목록을 불러오는 중...</p>
      </div>
    );
  }

  if (servers.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-muted-foreground/20 p-12 text-center bg-muted/5">
        <div className="relative mx-auto w-fit">
          <Server className="h-16 w-16 text-muted-foreground/30" />
          <Zap className="h-6 w-6 text-primary absolute -bottom-1 -right-1" />
        </div>
        <h3 className="text-lg font-semibold mt-6 mb-2">MCP 서버를 추가하세요</h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          MCP 서버를 등록하면 AI 어시스턴트가 파일 시스템, 데이터베이스, 웹 검색 등 다양한 도구를 사용할 수 있습니다.
        </p>
        <div className="flex items-center justify-center gap-6 mt-8 text-xs text-muted-foreground">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
            <Terminal className="h-4 w-4 text-blue-500" />
            <span>stdio</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
            <Cloud className="h-4 w-4 text-cyan-500" />
            <span>SSE</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-3">
        {/* Server Count Header */}
        <div className="flex items-center justify-between px-1">
          <p className="text-sm text-muted-foreground">
            총 <span className="font-semibold text-foreground">{servers.length}</span>개 서버
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadServers}
            className="h-8 gap-1.5"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            새로고침
          </Button>
        </div>

        {/* Server List */}
        {servers.map((server) => {
          const Icon = getServerIcon(server);
          const isExpanded = expandedServer === server.name;
          const isToggling = togglingServer === server.name;
          const isRefreshing = refreshingServer === server.name;
          const isEnabled = server.enabled !== false;

          return (
            <div
              key={server.name}
              className={cn(
                'rounded-xl border-2 transition-all duration-200 overflow-hidden',
                isEnabled
                  ? 'bg-card border-border hover:border-primary/30 shadow-sm hover:shadow-md'
                  : 'bg-muted/20 border-dashed border-muted-foreground/20 opacity-70'
              )}
            >
              {/* Main Row */}
              <div className="flex items-center gap-4 p-4">
                {/* Server Icon */}
                <div
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-xl shrink-0 transition-colors',
                    isEnabled
                      ? server.transport === 'sse'
                        ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'
                        : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  <Icon className="h-6 w-6" />
                </div>

                {/* Server Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-base truncate">{server.name}</h4>
                    <Badge
                      variant="outline"
                      className={cn('text-[10px] px-1.5 py-0 h-5 font-medium', getStatusColor(server.status))}
                    >
                      {getStatusIcon(server.status)}
                      <span className="ml-1">{getStatusText(server.status)}</span>
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      {server.transport === 'sse' ? (
                        <>
                          <Cloud className="h-3 w-3" />
                          SSE
                        </>
                      ) : (
                        <>
                          <Terminal className="h-3 w-3" />
                          stdio
                        </>
                      )}
                    </span>
                    {server.toolCount !== undefined && server.toolCount > 0 && (
                      <span className="flex items-center gap-1">
                        <Wrench className="h-3 w-3" />
                        {server.toolCount}개 도구
                      </span>
                    )}
                    {server.transport === 'sse' && server.url && (
                      <span className="truncate max-w-[200px] font-mono text-[10px]">
                        {server.url}
                      </span>
                    )}
                    {server.transport === 'stdio' && server.command && (
                      <span className="truncate font-mono text-[10px]">
                        {server.command}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Refresh Button */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRefreshServer(server.name)}
                        disabled={isRefreshing || !isEnabled}
                        className="h-8 w-8"
                      >
                        <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>서버 재연결</TooltipContent>
                  </Tooltip>

                  {/* Toggle Switch */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center">
                        {isToggling ? (
                          <div className="h-8 w-12 flex items-center justify-center">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        ) : (
                          <Switch
                            checked={isEnabled}
                            onCheckedChange={() => handleToggle(server.name)}
                            className="data-[state=checked]:bg-green-500"
                          />
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>{isEnabled ? '비활성화' : '활성화'}</TooltipContent>
                  </Tooltip>

                  {/* Expand Button */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setExpandedServer(isExpanded ? null : server.name)}
                        className="h-8 w-8"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{isExpanded ? '접기' : '상세 정보'}</TooltipContent>
                  </Tooltip>

                  {/* Delete Button */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteDialog({ open: true, serverName: server.name })}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>서버 삭제</TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="border-t bg-muted/30 px-4 py-4">
                  <div className="grid gap-4">
                    {/* Connection Info */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">전송 방식</p>
                        <div className="flex items-center gap-1.5">
                          {server.transport === 'sse' ? (
                            <Cloud className="h-4 w-4 text-cyan-500" />
                          ) : (
                            <Terminal className="h-4 w-4 text-blue-500" />
                          )}
                          <span className="text-sm font-medium">{server.transport.toUpperCase()}</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">상태</p>
                        <div className="flex items-center gap-1.5">
                          {server.enabled !== false ? (
                            <>
                              <Power className="h-4 w-4 text-green-500" />
                              <span className="text-sm font-medium">활성</span>
                            </>
                          ) : (
                            <>
                              <PowerOff className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium">비활성</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">등록된 도구</p>
                        <div className="flex items-center gap-1.5">
                          <Wrench className="h-4 w-4 text-orange-500" />
                          <span className="text-sm font-medium">{server.toolCount ?? 0}개</span>
                        </div>
                      </div>
                      {server.transport === 'stdio' && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">인자 개수</p>
                          <span className="text-sm font-medium">{server.args?.length ?? 0}개</span>
                        </div>
                      )}
                    </div>

                    {/* Command/URL */}
                    {server.transport === 'stdio' ? (
                      <>
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">실행 명령어</p>
                          <code className="block rounded-lg bg-background border px-3 py-2 font-mono text-xs">
                            {server.command}
                          </code>
                        </div>
                        {(server.args?.length ?? 0) > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">실행 인자</p>
                            <div className="rounded-lg bg-background border p-3 space-y-1">
                              {server.args?.map((arg, index) => (
                                <code key={index} className="block font-mono text-xs text-foreground/80">
                                  {arg}
                                </code>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">SSE URL</p>
                          <code className="block rounded-lg bg-background border px-3 py-2 font-mono text-xs break-all">
                            {server.url}
                          </code>
                        </div>
                        {server.headers && Object.keys(server.headers).length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">HTTP 헤더</p>
                            <div className="rounded-lg bg-background border p-3 space-y-1">
                              {Object.entries(server.headers).map(([key, value]) => (
                                <code key={key} className="block font-mono text-xs text-foreground/80">
                                  {key}: {key.toLowerCase().includes('auth') || key.toLowerCase().includes('key') ? '••••••••' : value}
                                </code>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Tools List */}
                    {server.tools && server.tools.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">사용 가능한 도구</p>
                        <div className="flex flex-wrap gap-1.5">
                          {server.tools.map((tool) => (
                            <Badge
                              key={tool}
                              variant="secondary"
                              className="text-xs font-mono"
                            >
                              {tool}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/10 p-3">
                      <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <p className="text-xs text-muted-foreground">
                        Agent 모드에서 이 서버의 도구를 LLM이 사용할 수 있습니다.
                        도구를 사용하려면 서버가 활성화되어 있어야 합니다.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open, serverName: open ? deleteDialog.serverName : null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>서버 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold">&apos;{deleteDialog.serverName}&apos;</span> 서버를 삭제하시겠습니까?
              <br />
              이 작업은 취소할 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
