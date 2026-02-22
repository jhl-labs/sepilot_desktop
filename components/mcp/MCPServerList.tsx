'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
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
import { MCPServerConfig } from '@/lib/domains/mcp/types';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
  tools?: Array<{ name: string; enabled: boolean }>;
  lastConnected?: number;
  errorMessage?: string;
}

export function MCPServerList({ onRefresh }: MCPServerListProps) {
  const { t } = useTranslation();
  const MCP_UPDATED_EVENT = 'sepilot:mcp-updated';
  const [servers, setServers] = useState<ServerWithStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [togglingServer, setTogglingServer] = useState<string | null>(null);
  const [refreshingServer, setRefreshingServer] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
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
                  errorMessage: statusResult.data?.errorMessage,
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
          setActionError(null);
        } else if (!result.success) {
          setActionError(result.error || 'Failed to load MCP servers');
        }
      }
    } catch (error) {
      console.error('Failed to load MCP servers:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredServers = useMemo(() => {
    if (!searchQuery.trim()) {
      return servers;
    }
    const query = searchQuery.toLowerCase();
    return servers.filter((server) => {
      const nameMatch = server.name.toLowerCase().includes(query);
      const toolMatch = server.tools?.some((tool) => tool.name.toLowerCase().includes(query));
      return nameMatch || toolMatch;
    });
  }, [servers, searchQuery]);

  const handleToggle = async (name: string) => {
    setTogglingServer(name);
    setActionError(null);
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.mcp.toggleServer(name);
        if (result.success) {
          window.dispatchEvent(new CustomEvent(MCP_UPDATED_EVENT));
          await loadServers();
          onRefresh?.();
        } else {
          console.error('Failed to toggle server:', result.error);
          setActionError(result.error || 'Failed to toggle server');
          await loadServers();
        }
      }
    } catch (error) {
      console.error('Failed to toggle MCP server:', error);
      setActionError(error instanceof Error ? error.message : String(error));
      await loadServers();
    } finally {
      setTogglingServer(null);
    }
  };

  const handleRefreshServer = async (name: string) => {
    setRefreshingServer(name);
    setActionError(null);
    try {
      if (window.electronAPI) {
        // 서버 재연결
        const disableResult = await window.electronAPI.mcp.toggleServer(name);
        if (!disableResult.success) {
          throw new Error(disableResult.error || 'Failed to reconnect server');
        }

        const enableResult = await window.electronAPI.mcp.toggleServer(name);
        if (!enableResult.success) {
          throw new Error(enableResult.error || 'Failed to reconnect server');
        }

        window.dispatchEvent(new CustomEvent(MCP_UPDATED_EVENT));
        await loadServers();
        onRefresh?.();
      }
    } catch (error) {
      console.error('Failed to refresh MCP server:', error);
      setActionError(error instanceof Error ? error.message : String(error));
      await loadServers();
    } finally {
      setRefreshingServer(null);
    }
  };

  const handleRemove = async () => {
    const name = deleteDialog.serverName;
    if (!name) {
      return;
    }

    setActionError(null);
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.mcp.removeServer(name);
        if (result.success) {
          window.dispatchEvent(new CustomEvent(MCP_UPDATED_EVENT));
          await loadServers();
          onRefresh?.();
        } else {
          setActionError(result.error || 'Failed to remove MCP server');
          await loadServers();
        }
      }
    } catch (error) {
      console.error('Failed to remove MCP server:', error);
      setActionError(error instanceof Error ? error.message : String(error));
      await loadServers();
    } finally {
      setDeleteDialog({ open: false, serverName: null });
    }
  };

  const handleToggleTool = async (serverName: string, toolName: string, enabled: boolean) => {
    setActionError(null);
    try {
      // Optimistic update
      setServers((prev) =>
        prev.map((s) => {
          if (s.name === serverName && s.tools) {
            return {
              ...s,
              tools: s.tools.map((t) => (t.name === toolName ? { ...t, enabled } : t)),
            };
          }
          return s;
        })
      );

      if (window.electronAPI) {
        const result = await window.electronAPI.mcp.toggleTool(serverName, toolName, enabled);
        if (!result.success) {
          throw new Error(result.error || 'Failed to toggle tool');
        }
        window.dispatchEvent(new CustomEvent(MCP_UPDATED_EVENT));
      }
    } catch (error) {
      console.error('Failed to toggle tool:', error);
      setActionError(error instanceof Error ? error.message : String(error));
      loadServers(); // Revert on error
    }
  };

  const handleToggleAllTools = async (serverName: string, enableAll: boolean) => {
    setActionError(null);
    try {
      const server = servers.find((s) => s.name === serverName);
      if (!server || !server.tools) {
        return;
      }

      const allToolNames = server.tools.map((t) => t.name);

      // Optimistic update
      setServers((prev) =>
        prev.map((s) => {
          if (s.name === serverName && s.tools) {
            return {
              ...s,
              tools: s.tools.map((t) => ({ ...t, enabled: enableAll })),
            };
          }
          return s;
        })
      );

      if (window.electronAPI) {
        // If enabling all, disabled list is empty.
        // If disabling all, disabled list contains all tools.
        const disabledTools = enableAll ? [] : allToolNames;
        const result = await window.electronAPI.mcp.setDisabledTools(serverName, disabledTools);
        if (!result.success) {
          throw new Error(result.error || 'Failed to update tool state');
        }
        window.dispatchEvent(new CustomEvent(MCP_UPDATED_EVENT));
      }
    } catch (error) {
      console.error('Failed to toggle all tools:', error);
      setActionError(error instanceof Error ? error.message : String(error));
      loadServers();
    }
  };

  const getServerIcon = (server: MCPServerConfig) => {
    if (server.transport === 'sse') {
      return Cloud;
    }

    const lowerName = server.name.toLowerCase();
    if (lowerName.includes('filesystem') || lowerName.includes('file')) {
      return FileText;
    }
    if (lowerName.includes('github')) {
      return Globe;
    }
    if (lowerName.includes('git')) {
      return Code;
    }
    if (
      lowerName.includes('database') ||
      lowerName.includes('db') ||
      lowerName.includes('sqlite')
    ) {
      return Database;
    }
    if (lowerName.includes('search') || lowerName.includes('brave')) {
      return Search;
    }
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
        return t('settings.mcp.serverList.status.connected');
      case 'connecting':
        return t('settings.mcp.serverList.status.connecting');
      case 'error':
        return t('settings.mcp.serverList.status.error');
      default:
        return t('settings.mcp.serverList.status.waiting');
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

  if (isLoading && servers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <div className="relative">
          <Server className="h-12 w-12 opacity-20" />
          <Loader2 className="h-6 w-6 animate-spin absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <p className="text-sm mt-4 font-medium">{t('settings.mcp.serverList.loading')}</p>
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
        <h3 className="text-lg font-semibold mt-6 mb-2">
          {t('settings.mcp.serverList.emptyTitle')}
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          {t('settings.mcp.serverList.emptyDescription')}
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
      <div className="space-y-4">
        {actionError && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {actionError}
          </div>
        )}

        {/* Search & Refresh */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t(
                'settings.mcp.serverList.searchPlaceholder',
                'Search servers and tools...'
              )}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="icon" onClick={loadServers} disabled={isLoading}>
            <span className="sr-only">{t('settings.mcp.serverList.refresh')}</span>
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
        </div>

        {/* Server List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-sm text-muted-foreground">
              {t('settings.mcp.serverList.totalServers', { count: filteredServers.length })}
            </p>
          </div>

          {filteredServers.map((server) => {
            const Icon = getServerIcon(server);
            const isExpanded = expandedServer === server.name || !!searchQuery;
            const isToggling = togglingServer === server.name;
            const isRefreshing = refreshingServer === server.name;
            const isEnabled = server.enabled !== false;

            const tools = server.tools || [];
            const enabledToolsCount = tools.filter((t) => t.enabled !== false).length;
            const allToolsEnabled = tools.length > 0 && enabledToolsCount === tools.length;

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
                        className={cn(
                          'text-[10px] px-1.5 py-0 h-5 font-medium',
                          getStatusColor(server.status)
                        )}
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
                          {t('settings.mcp.serverList.toolCount', { count: enabledToolsCount })}
                          {enabledToolsCount !== server.toolCount && (
                            <span className="text-muted-foreground/60"> / {server.toolCount}</span>
                          )}
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
                      <TooltipContent>
                        {t('settings.mcp.serverList.tooltips.reconnect')}
                      </TooltipContent>
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
                      <TooltipContent>
                        {t(
                          isEnabled
                            ? 'settings.mcp.serverList.tooltips.deactivate'
                            : 'settings.mcp.serverList.tooltips.activate'
                        )}
                      </TooltipContent>
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
                      <TooltipContent>
                        {isExpanded
                          ? t('settings.mcp.serverList.expand.hide')
                          : t('settings.mcp.serverList.expand.show')}
                      </TooltipContent>
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
                      <TooltipContent>
                        {t('settings.mcp.serverList.tooltips.delete')}
                      </TooltipContent>
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
                          <p className="text-xs font-medium text-muted-foreground">
                            {t('settings.mcp.serverList.labels.transport')}
                          </p>
                          <div className="flex items-center gap-1.5">
                            {server.transport === 'sse' ? (
                              <Cloud className="h-4 w-4 text-cyan-500" />
                            ) : (
                              <Terminal className="h-4 w-4 text-blue-500" />
                            )}
                            <span className="text-sm font-medium">
                              {server.transport.toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t('settings.mcp.serverList.labels.status')}
                          </p>
                          <div className="flex items-center gap-1.5">
                            {server.enabled !== false ? (
                              <>
                                <Power className="h-4 w-4 text-green-500" />
                                <span className="text-sm font-medium">
                                  {t('settings.mcp.serverList.status.active')}
                                </span>
                              </>
                            ) : (
                              <>
                                <PowerOff className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">
                                  {t('settings.mcp.serverList.status.inactive')}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        {/* More details if needed */}
                      </div>

                      {server.status === 'error' && server.errorMessage && (
                        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                          {server.errorMessage}
                        </div>
                      )}

                      {/* Tool Management Section */}
                      {server.tools && server.tools.length > 0 && (
                        <div className="space-y-3 pt-2 border-t border-dashed">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">
                              {t('settings.mcp.serverList.labels.availableTools')}
                            </p>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs"
                                onClick={() => handleToggleAllTools(server.name, !allToolsEnabled)}
                              >
                                {allToolsEnabled
                                  ? t('settings.mcp.serverList.actions.deselectAll')
                                  : t('settings.mcp.serverList.actions.selectAll')}
                              </Button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {server.tools.map((tool) => {
                              const toolEnabled = tool.enabled !== false;
                              return (
                                <div
                                  key={tool.name}
                                  className={cn(
                                    'flex items-center gap-3 p-2 rounded-lg border transition-colors',
                                    toolEnabled
                                      ? 'bg-background border-border'
                                      : 'bg-muted/50 border-transparent text-muted-foreground'
                                  )}
                                >
                                  <Checkbox
                                    id={`${server.name}-${tool.name}`}
                                    checked={toolEnabled}
                                    onCheckedChange={(checked: boolean) =>
                                      handleToggleTool(server.name, tool.name, checked)
                                    }
                                  />
                                  <label
                                    htmlFor={`${server.name}-${tool.name}`}
                                    className="text-sm font-mono flex-1 cursor-pointer select-none truncate"
                                    title={tool.name}
                                  >
                                    {tool.name}
                                  </label>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Delete Confirmation Dialog */}
        <AlertDialog
          open={deleteDialog.open}
          onOpenChange={(open) =>
            setDeleteDialog({ open, serverName: open ? deleteDialog.serverName : null })
          }
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('settings.mcp.serverList.deleteDialog.title')}</AlertDialogTitle>
              <AlertDialogDescription>
                <div className="space-y-2">
                  <p>
                    {t('settings.mcp.serverList.deleteDialog.question', {
                      name: deleteDialog.serverName,
                    })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.mcp.serverList.deleteDialog.warning')}
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {t('settings.mcp.serverList.deleteDialog.cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRemove}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {t('settings.mcp.serverList.deleteDialog.confirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
