'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  Loader2,
  Globe,
  Database,
  Search,
  Code,
  Terminal,
  Sparkles,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Zap,
  Settings2,
  Link2,
  Key,
  ArrowRight,
  Brain,
  Lightbulb,
  Chrome,
} from 'lucide-react';
import { MCPServerConfig } from '@/lib/mcp/types';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface MCPServerConfigComponentProps {
  onAdd: () => void;
}

export function MCPServerConfigComponent({ onAdd }: MCPServerConfigComponentProps) {
  const { t } = useTranslation();

  const PRESETS = useMemo(
    () => ({
      stdio: [
        {
          name: 'GitHub',
          icon: Globe,
          description: t('settings.mcp.config.presets.github'),
          command: 'npx',
          args: '-y\n@modelcontextprotocol/server-github',
          env: 'GITHUB_PERSONAL_ACCESS_TOKEN=',
          color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
          iconColor: 'text-purple-500',
        },
        {
          name: 'SQLite',
          icon: Database,
          description: t('settings.mcp.config.presets.sqlite'),
          command: 'npx',
          args: '-y\n@modelcontextprotocol/server-sqlite\n/path/to/database.db',
          color: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
          iconColor: 'text-green-500',
        },
        {
          name: 'Web Search',
          icon: Search,
          description: t('settings.mcp.config.presets.websearch'),
          command: 'npx',
          args: '-y\nmcp-remote\nhttps://mcp.tavily.com/mcp/?tavilyApiKey=YOUR_API_KEY',
          color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
          iconColor: 'text-orange-500',
        },
        {
          name: 'Git',
          icon: Code,
          description: t('settings.mcp.config.presets.git'),
          command: 'npx',
          args: '-y\n@modelcontextprotocol/server-git\n--repository\n/path/to/git/repo',
          color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
          iconColor: 'text-red-500',
        },
        {
          name: 'Context7',
          icon: Sparkles,
          description: t('settings.mcp.config.presets.context7'),
          command: 'npx',
          args: '-y\n@upstash/context7-mcp',
          env: 'CONTEXT7_API_KEY=',
          color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
          iconColor: 'text-indigo-500',
        },
        {
          name: 'Memory',
          icon: Brain,
          description: t('settings.mcp.config.presets.memory'),
          command: 'npx',
          args: '-y\n@modelcontextprotocol/server-memory',
          color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
          iconColor: 'text-rose-500',
        },
        {
          name: 'Thinking',
          icon: Lightbulb,
          description: t('settings.mcp.config.presets.thinking'),
          command: 'npx',
          args: '-y\n@modelcontextprotocol/server-sequential-thinking',
          color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
          iconColor: 'text-yellow-500',
        },
        {
          name: 'Puppeteer',
          icon: Chrome,
          description: t('settings.mcp.config.presets.puppeteer'),
          command: 'npx',
          args: '-y\n@modelcontextprotocol/server-puppeteer',
          color: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
          iconColor: 'text-cyan-500',
        },
      ],
      sse: [
        {
          name: 'Custom SSE',
          icon: Cloud,
          description: t('settings.mcp.config.presets.customSse'),
          url: 'http://localhost:3001/sse',
          headers: 'Authorization: Bearer YOUR_API_KEY',
          color: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
          iconColor: 'text-cyan-500',
        },
      ],
    }),
    [t]
  );
  const [transport, setTransport] = useState<'stdio' | 'sse'>('stdio');
  const [config, setConfig] = useState<MCPServerConfig>({
    name: '',
    transport: 'stdio',
    command: 'npx',
    args: [],
    env: {},
    enabled: true,
  });

  const [argsText, setArgsText] = useState('');
  const [headersText, setHeadersText] = useState('');
  const [envText, setEnvText] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleTransportChange = (value: 'stdio' | 'sse') => {
    setTransport(value);
    setConfig({
      ...config,
      transport: value,
      command: value === 'stdio' ? 'npx' : undefined,
      args: value === 'stdio' ? [] : undefined,
      url: value === 'sse' ? '' : undefined,
      headers: value === 'sse' ? {} : undefined,
    });
    setArgsText('');
    setHeadersText('');
    setEnvText('');
    setSelectedPreset(null);
    setMessage(null);
  };

  const handleAdd = async () => {
    if (!config.name.trim()) {
      setMessage({ type: 'error', text: t('settings.mcp.config.messages.nameRequired') });
      return;
    }

    if (transport === 'stdio') {
      if (!config.command?.trim()) {
        setMessage({ type: 'error', text: t('settings.mcp.config.messages.commandRequired') });
        return;
      }
    } else if (transport === 'sse') {
      if (!config.url?.trim()) {
        setMessage({ type: 'error', text: t('settings.mcp.config.messages.urlRequired') });
        return;
      }
    }

    setIsAdding(true);
    setMessage(null);

    try {
      const serverConfig: MCPServerConfig = {
        ...config,
        name: config.name.trim(),
        transport,
      };

      // stdio: args 파싱
      if (transport === 'stdio') {
        const args = argsText
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0);

        serverConfig.args = args;
        serverConfig.command = config.command?.trim();
      }

      // sse: headers 파싱
      if (transport === 'sse') {
        const headers: Record<string, string> = {};
        headersText
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .forEach((line) => {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
              const key = line.substring(0, colonIndex).trim();
              const value = line.substring(colonIndex + 1).trim();
              headers[key] = value;
            }
          });

        serverConfig.headers = Object.keys(headers).length > 0 ? headers : undefined;
        serverConfig.url = config.url?.trim();
      }

      // 환경 변수 파싱 (stdio와 sse 모두 적용)
      const env: Record<string, string> = {};
      envText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .forEach((line) => {
          const equalIndex = line.indexOf('=');
          if (equalIndex > 0) {
            const key = line.substring(0, equalIndex).trim();
            const value = line.substring(equalIndex + 1).trim();
            env[key] = value;
          }
        });

      serverConfig.env = Object.keys(env).length > 0 ? env : undefined;

      if (window.electronAPI) {
        const result = await window.electronAPI.mcp.addServer(serverConfig);

        if (result.success) {
          setMessage({
            type: 'success',
            text: t('settings.mcp.config.messages.success', { name: config.name }),
          });

          // 입력 필드 초기화
          setConfig({
            name: '',
            transport: 'stdio',
            command: 'npx',
            args: [],
            env: {},
            enabled: true,
          });
          setArgsText('');
          setHeadersText('');
          setEnvText('');
          setSelectedPreset(null);

          // 부모 컴포넌트에 알림
          onAdd();
        } else {
          setMessage({
            type: 'error',
            text: result.error || t('settings.mcp.config.messages.failed'),
          });
        }
      }
    } catch (error: any) {
      console.error('Failed to add MCP server:', error);

      // 타임아웃 에러 감지 및 특별 처리
      let errorMessage = error.message || t('settings.mcp.config.messages.failed');
      if (error.message?.includes('timeout')) {
        errorMessage = t('settings.mcp.config.messages.timeout', {
          hint:
            transport === 'stdio'
              ? t('settings.mcp.config.messages.timeoutHintStdio')
              : t('settings.mcp.config.messages.timeoutHintSse'),
        });
      }

      setMessage({
        type: 'error',
        text: errorMessage,
      });
    } finally {
      setIsAdding(false);
    }
  };

  const loadPreset = (preset: (typeof PRESETS.stdio)[0] | (typeof PRESETS.sse)[0]) => {
    setSelectedPreset(preset.name);
    setConfig({
      ...config,
      name: preset.name,
      transport,
      command: 'command' in preset ? preset.command : undefined,
      url: 'url' in preset ? preset.url : undefined,
    });
    setArgsText('args' in preset ? preset.args : '');
    setHeadersText('headers' in preset ? preset.headers : '');
    const envValue = 'env' in preset && preset.env ? preset.env : '';
    setEnvText(envValue);
    // 환경 변수가 필요한 프리셋인 경우 Advanced Options 자동으로 열기
    if (envValue) {
      setShowAdvanced(true);
    }
    setMessage(null);
  };

  const currentPresets = transport === 'stdio' ? PRESETS.stdio : PRESETS.sse;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Zap className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">{t('settings.mcp.config.title')}</h3>
          <p className="text-sm text-muted-foreground">{t('settings.mcp.config.subtitle')}</p>
        </div>
      </div>

      {/* Transport Type Tabs */}
      <Tabs value={transport} onValueChange={(v) => handleTransportChange(v as 'stdio' | 'sse')}>
        <TabsList className="grid w-full grid-cols-2 h-12">
          <TabsTrigger value="stdio" className="gap-2 h-10">
            <Terminal className="h-4 w-4" />
            <div className="text-left">
              <div className="font-medium">stdio</div>
              <div className="text-[10px] text-muted-foreground hidden sm:block">
                {t('settings.mcp.config.tabs.stdioDesc')}
              </div>
            </div>
          </TabsTrigger>
          <TabsTrigger value="sse" className="gap-2 h-10">
            <Cloud className="h-4 w-4" />
            <div className="text-left">
              <div className="font-medium">SSE</div>
              <div className="text-[10px] text-muted-foreground hidden sm:block">
                {t('settings.mcp.config.tabs.sseDesc')}
              </div>
            </div>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stdio" className="space-y-6 mt-6">
          {/* stdio Presets */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">{t('settings.mcp.config.presets.title')}</Label>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
              {currentPresets.map((preset) => {
                const Icon = preset.icon;
                const isSelected = selectedPreset === preset.name;

                return (
                  <button
                    key={preset.name}
                    onClick={() => loadPreset(preset)}
                    disabled={isAdding}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left group',
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-transparent bg-muted/50 hover:bg-muted hover:border-border'
                    )}
                  >
                    <div className={cn('rounded-lg p-2', preset.color)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm">{preset.name}</h4>
                      <p className="text-[10px] text-muted-foreground line-clamp-1">
                        {preset.description}
                      </p>
                    </div>
                    {isSelected && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="sse" className="space-y-6 mt-6">
          {/* SSE Presets */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">{t('settings.mcp.config.presets.title')}</Label>
            <div className="grid grid-cols-2 gap-2">
              {currentPresets.map((preset) => {
                const Icon = preset.icon;
                const isSelected = selectedPreset === preset.name;

                return (
                  <button
                    key={preset.name}
                    onClick={() => loadPreset(preset)}
                    disabled={isAdding}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left group',
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-transparent bg-muted/50 hover:bg-muted hover:border-border'
                    )}
                  >
                    <div className={cn('rounded-lg p-2', preset.color)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm">{preset.name}</h4>
                      <p className="text-[10px] text-muted-foreground line-clamp-1">
                        {preset.description}
                      </p>
                    </div>
                    {isSelected && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Configuration Form */}
      <div className="rounded-xl border-2 bg-card overflow-hidden">
        <div className="bg-muted/30 px-4 py-3 border-b flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">
            {t('settings.mcp.config.section.serverConfig')}
          </span>
        </div>

        <div className="p-4 space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="server-name" className="text-sm font-medium flex items-center gap-1.5">
              {t('settings.mcp.config.labels.name')}
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                {t('settings.mcp.config.labels.required')}
              </Badge>
            </Label>
            <Input
              id="server-name"
              value={config.name}
              onChange={(e) => setConfig({ ...config, name: e.target.value })}
              placeholder={t('settings.mcp.config.placeholders.name')}
              disabled={isAdding}
              className="font-mono h-10"
            />
            <p className="text-[11px] text-muted-foreground">
              {t('settings.mcp.config.helpers.name')}
            </p>
          </div>

          {/* stdio 전송 방식 */}
          {transport === 'stdio' && (
            <>
              {/* Command */}
              <div className="space-y-2">
                <Label
                  htmlFor="server-command"
                  className="text-sm font-medium flex items-center gap-1.5"
                >
                  <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
                  {t('settings.mcp.config.labels.command')}
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                    {t('settings.mcp.config.labels.required')}
                  </Badge>
                </Label>
                <Input
                  id="server-command"
                  value={config.command || ''}
                  onChange={(e) => setConfig({ ...config, command: e.target.value })}
                  placeholder={t('settings.mcp.config.placeholders.command')}
                  disabled={isAdding}
                  className="font-mono h-10"
                />
              </div>

              {/* Args */}
              <div className="space-y-2">
                <Label
                  htmlFor="server-args"
                  className="text-sm font-medium flex items-center gap-1.5"
                >
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  {t('settings.mcp.config.labels.args')}
                </Label>
                <Textarea
                  id="server-args"
                  value={argsText}
                  onChange={(e) => setArgsText(e.target.value)}
                  placeholder={t('settings.mcp.config.placeholders.args')}
                  className="min-h-[100px] font-mono text-sm resize-none"
                  disabled={isAdding}
                />
                <p className="text-[11px] text-muted-foreground">
                  {t('settings.mcp.config.helpers.args')}
                </p>
              </div>
            </>
          )}

          {/* SSE 전송 방식 */}
          {transport === 'sse' && (
            <>
              {/* URL */}
              <div className="space-y-2">
                <Label
                  htmlFor="server-url"
                  className="text-sm font-medium flex items-center gap-1.5"
                >
                  <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                  {t('settings.mcp.config.labels.sseUrl')}
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                    {t('settings.mcp.config.labels.required')}
                  </Badge>
                </Label>
                <Input
                  id="server-url"
                  value={config.url || ''}
                  onChange={(e) => setConfig({ ...config, url: e.target.value })}
                  placeholder={t('settings.mcp.config.placeholders.sseUrl')}
                  disabled={isAdding}
                  className="font-mono h-10"
                />
                <p className="text-[11px] text-muted-foreground">
                  {t('settings.mcp.config.helpers.sseUrl')}
                </p>
              </div>

              {/* Headers */}
              <div className="space-y-2">
                <Label
                  htmlFor="server-headers"
                  className="text-sm font-medium flex items-center gap-1.5"
                >
                  <Key className="h-3.5 w-3.5 text-muted-foreground" />
                  {t('settings.mcp.config.labels.headers')}
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                    {t('settings.mcp.config.labels.optional')}
                  </Badge>
                </Label>
                <Textarea
                  id="server-headers"
                  value={headersText}
                  onChange={(e) => setHeadersText(e.target.value)}
                  placeholder={t('settings.mcp.config.placeholders.headers')}
                  className="min-h-[80px] font-mono text-sm resize-none"
                  disabled={isAdding}
                />
                <p className="text-[11px] text-muted-foreground">
                  {t('settings.mcp.config.helpers.headers')}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Advanced Options (Optional) */}
      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between h-10 px-3">
            <span className="text-sm text-muted-foreground">
              {t('settings.mcp.config.section.advanced')}
            </span>
            <ChevronRight
              className={cn('h-4 w-4 transition-transform', showAdvanced && 'rotate-90')}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-4">
          <div className="rounded-xl border-2 bg-card overflow-hidden">
            <div className="bg-muted/30 px-4 py-3 border-b flex items-center gap-2">
              <Key className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">{t('settings.mcp.config.labels.env')}</span>
            </div>
            <div className="p-4 space-y-2">
              <Label htmlFor="server-env" className="text-sm font-medium flex items-center gap-1.5">
                {t('settings.mcp.config.labels.env')}
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                  {t('settings.mcp.config.labels.optional')}
                </Badge>
              </Label>
              <Textarea
                id="server-env"
                value={envText}
                onChange={(e) => setEnvText(e.target.value)}
                placeholder={t('settings.mcp.config.placeholders.env')}
                className="min-h-[100px] font-mono text-sm resize-none"
                disabled={isAdding}
              />
              <p className="text-[11px] text-muted-foreground">
                {t('settings.mcp.config.helpers.env')}
              </p>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Info Box */}
      <div className="rounded-xl bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 p-4">
        <div className="flex gap-3">
          <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-2 text-sm">
            <p className="font-medium text-primary">{t('settings.mcp.config.info.title')}</p>
            {transport === 'stdio' ? (
              <ul className="space-y-1.5 text-muted-foreground text-xs">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                  {t('settings.mcp.config.info.stdio.item1')}
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                  {t('settings.mcp.config.info.stdio.item2')}
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                  {t('settings.mcp.config.info.stdio.item3')}
                </li>
              </ul>
            ) : (
              <ul className="space-y-1.5 text-muted-foreground text-xs">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                  {t('settings.mcp.config.info.sse.item1')}
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                  {t('settings.mcp.config.info.sse.item2')}
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 mt-0.5 shrink-0" />
                  {t('settings.mcp.config.info.sse.item3')}
                </li>
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div
          className={cn(
            'rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-3 border',
            message.type === 'success'
              ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20'
              : 'bg-destructive/10 text-destructive border-destructive/20'
          )}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : (
            <AlertTriangle className="h-5 w-5 shrink-0" />
          )}
          {message.text}
        </div>
      )}

      {/* Add Button */}
      <Button
        onClick={handleAdd}
        disabled={
          isAdding ||
          !config.name.trim() ||
          (transport === 'stdio' && !config.command?.trim()) ||
          (transport === 'sse' && !config.url?.trim())
        }
        className="w-full h-12 text-base font-medium gap-2"
        size="lg"
      >
        {isAdding ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            {t('settings.mcp.config.buttons.adding')}
          </>
        ) : (
          <>
            <Plus className="h-5 w-5" />
            {t('settings.mcp.config.buttons.add')}
          </>
        )}
      </Button>
    </div>
  );
}
