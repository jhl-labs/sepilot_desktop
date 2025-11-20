'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Loader2, FileText, Globe, Database, Search, Code, Terminal, Sparkles } from 'lucide-react';
import { MCPServerConfig } from '@/lib/mcp/types';
import { cn } from '@/lib/utils';

interface MCPServerConfigComponentProps {
  onAdd: () => void;
}

export function MCPServerConfigComponent({ onAdd }: MCPServerConfigComponentProps) {
  const [config, setConfig] = useState<MCPServerConfig>({
    name: '',
    command: 'npx',
    args: [],
    env: {},
    transport: 'stdio',
    enabled: true,
  });

  const [argsText, setArgsText] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleAdd = async () => {
    if (!config.name.trim()) {
      setMessage({ type: 'error', text: '서버 이름을 입력해주세요.' });
      return;
    }

    if (!config.command.trim()) {
      setMessage({ type: 'error', text: '명령어를 입력해주세요.' });
      return;
    }

    setIsAdding(true);
    setMessage(null);

    try {
      // args 파싱
      const args = argsText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      const serverConfig: MCPServerConfig = {
        ...config,
        args,
      };

      if (window.electronAPI) {
        const result = await window.electronAPI.mcp.addServer(serverConfig);

        if (result.success) {
          setMessage({
            type: 'success',
            text: `서버 '${config.name}'가 추가되었습니다! (${result.data?.length || 0}개 도구)`,
          });

          // 입력 필드 초기화
          setConfig({
            name: '',
            command: 'npx',
            args: [],
            env: {},
            transport: 'stdio',
            enabled: true,
          });
          setArgsText('');

          // 부모 컴포넌트에 알림
          onAdd();
        } else {
          setMessage({
            type: 'error',
            text: result.error || '서버 추가에 실패했습니다.',
          });
        }
      }
    } catch (error: any) {
      console.error('Failed to add MCP server:', error);
      setMessage({
        type: 'error',
        text: error.message || '서버 추가에 실패했습니다.',
      });
    } finally {
      setIsAdding(false);
    }
  };

  // 사전 정의된 서버 템플릿
  const presets = [
    {
      name: 'Filesystem',
      icon: FileText,
      description: '로컬 파일 읽기/쓰기',
      command: 'npx',
      args: '-y\n@modelcontextprotocol/server-filesystem\nC:/Users/YourName/Documents',
      color: 'text-blue-500',
    },
    {
      name: 'GitHub',
      icon: Globe,
      description: 'GitHub 저장소 관리',
      command: 'npx',
      args: '-y\n@modelcontextprotocol/server-github',
      color: 'text-purple-500',
    },
    {
      name: 'SQLite',
      icon: Database,
      description: 'SQLite 데이터베이스 쿼리',
      command: 'npx',
      args: '-y\n@modelcontextprotocol/server-sqlite\n/path/to/database.db',
      color: 'text-green-500',
    },
    {
      name: 'Web Search',
      icon: Search,
      description: '웹 검색 도구 (Brave)',
      command: 'npx',
      args: '-y\n@modelcontextprotocol/server-brave-search',
      color: 'text-orange-500',
    },
    {
      name: 'Git',
      icon: Code,
      description: 'Git 저장소 작업',
      command: 'npx',
      args: '-y\n@modelcontextprotocol/server-git',
      color: 'text-red-500',
    },
    {
      name: 'Custom',
      icon: Terminal,
      description: '직접 설정',
      command: '',
      args: '',
      color: 'text-gray-500',
    },
  ];

  const loadPreset = (preset: typeof presets[0]) => {
    if (preset.name === 'Custom') {
      setConfig({
        name: '',
        command: 'npx',
        args: [],
        env: {},
        transport: 'stdio',
        enabled: true,
      });
      setArgsText('');
    } else {
      setConfig({ ...config, name: preset.name, command: preset.command });
      setArgsText(preset.args);
    }
    setMessage(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">새 MCP 서버 추가</h3>
      </div>

      {/* Presets */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">서버 템플릿 선택</Label>
        <div className="grid grid-cols-2 gap-3">
          {presets.map((preset) => {
            const Icon = preset.icon;
            const isSelected = config.name === preset.name;

            return (
              <button
                key={preset.name}
                onClick={() => loadPreset(preset)}
                className={cn(
                  'flex items-start gap-3 p-4 rounded-lg border-2 transition-all text-left',
                  isSelected
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:bg-accent/50'
                )}
              >
                <div className={cn('rounded-md p-2 bg-background', preset.color)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-sm mb-0.5">{preset.name}</h4>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {preset.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Configuration Form */}
      <div className="space-y-4 rounded-lg border p-4 bg-card">
        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="server-name" className="text-sm font-medium flex items-center gap-1.5">
            서버 이름
            <span className="text-destructive">*</span>
          </Label>
          <Input
            id="server-name"
            value={config.name}
            onChange={(e) => setConfig({ ...config, name: e.target.value })}
            placeholder="예: my-filesystem"
            disabled={isAdding}
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Agent 모드에서 표시될 서버 식별자입니다
          </p>
        </div>

        {/* Command */}
        <div className="space-y-2">
          <Label htmlFor="server-command" className="text-sm font-medium flex items-center gap-1.5">
            실행 명령어
            <span className="text-destructive">*</span>
          </Label>
          <Input
            id="server-command"
            value={config.command}
            onChange={(e) => setConfig({ ...config, command: e.target.value })}
            placeholder="예: npx, node, python"
            disabled={isAdding}
            className="font-mono"
          />
        </div>

        {/* Args */}
        <div className="space-y-2">
          <Label htmlFor="server-args" className="text-sm font-medium">
            실행 인자 (한 줄에 하나씩)
          </Label>
          <Textarea
            id="server-args"
            value={argsText}
            onChange={(e) => setArgsText(e.target.value)}
            placeholder="-y&#10;@modelcontextprotocol/server-filesystem&#10;C:/path/to/directory"
            className="min-h-[120px] font-mono text-sm resize-none"
            disabled={isAdding}
          />
          <p className="text-xs text-muted-foreground">
            각 인자를 새 줄에 입력하세요. 경로는 절대 경로를 사용하세요.
          </p>
        </div>
      </div>

      {/* Info Box */}
      <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
        <div className="flex gap-3">
          <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-2 text-sm">
            <p className="font-medium text-primary">MCP 서버 정보</p>
            <ul className="space-y-1 text-muted-foreground text-xs">
              <li>• stdio 프로토콜을 통해 통신합니다</li>
              <li>• 추가 시 자동으로 초기화되며 사용 가능한 도구가 로드됩니다</li>
              <li>• Agent 모드에서 등록된 도구를 LLM이 사용할 수 있습니다</li>
              <li>• 환경 변수가 필요한 경우 시스템 환경 변수를 설정하세요</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div
          className={cn(
            'rounded-lg px-4 py-3 text-sm font-medium flex items-center gap-2',
            message.type === 'success'
              ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20'
              : 'bg-destructive/10 text-destructive border border-destructive/20'
          )}
        >
          {message.type === 'success' ? '✓' : '⚠'} {message.text}
        </div>
      )}

      {/* Add Button */}
      <Button
        onClick={handleAdd}
        disabled={isAdding || !config.name.trim() || !config.command.trim()}
        className="w-full h-11 text-base font-medium"
        size="lg"
      >
        {isAdding ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            서버 추가 중...
          </>
        ) : (
          <>
            <Plus className="mr-2 h-5 w-5" />
            MCP 서버 추가
          </>
        )}
      </Button>
    </div>
  );
}
