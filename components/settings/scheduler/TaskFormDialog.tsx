'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ScheduledTask, ThinkingMode } from '@/types/scheduler';
import { ScheduleConfigForm } from './ScheduleConfigForm';
import { ResultHandlersForm } from './ResultHandlersForm';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { toast } from 'sonner';

interface TaskFormDialogProps {
  open: boolean;
  task: ScheduledTask | null;
  onClose: () => void;
  onSave: (task: ScheduledTask) => Promise<void>;
}

// Available tools list (would come from MCP in real implementation)
const FALLBACK_TOOLS = [
  'read_file',
  'write_file',
  'list_directory',
  'search_files',
  'execute_command',
  'browser_action',
  'database_query',
];

export function TaskFormDialog({ open, task, onClose, onSave }: TaskFormDialogProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Partial<ScheduledTask>>({
    name: '',
    description: '',
    enabled: true,
    schedule: {
      type: 'preset',
      preset: 'daily',
      time: '09:00',
    },
    prompt: '',
    thinkingMode: 'instant',
    enableRAG: false,
    enableTools: false,
    allowedTools: [],
    resultHandlers: [{ type: 'conversation', enabled: true }],
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isScheduleValid, setIsScheduleValid] = useState(true);
  const [availableTools, setAvailableTools] = useState<string[]>(FALLBACK_TOOLS);

  useEffect(() => {
    if (task) {
      setFormData(task);
    } else {
      setFormData({
        name: '',
        description: '',
        enabled: true,
        schedule: {
          type: 'preset',
          preset: 'daily',
          time: '09:00',
        },
        prompt: '',
        thinkingMode: 'instant',
        enableRAG: false,
        enableTools: false,
        allowedTools: [],
        resultHandlers: [{ type: 'conversation', enabled: true }],
      });
    }
  }, [task, open]);

  useEffect(() => {
    if (!open || typeof window === 'undefined' || !window.electronAPI?.mcp?.getAllTools) {
      return;
    }

    let mounted = true;

    const loadTools = async () => {
      try {
        const result = await window.electronAPI.mcp.getAllTools();
        if (!mounted || !result?.success || !Array.isArray(result.data)) {
          return;
        }

        const toolNames = Array.from(
          new Set(
            result.data
              .map((tool: any) => (typeof tool?.name === 'string' ? tool.name : null))
              .filter((name: string | null): name is string => !!name)
          )
        ).sort((a, b) => a.localeCompare(b));

        if (toolNames.length > 0) {
          setAvailableTools(toolNames);
        }
      } catch (error) {
        console.error('Failed to load available tools for scheduler:', error);
      }
    };

    loadTools();

    return () => {
      mounted = false;
    };
  }, [open]);

  const handleSave = async () => {
    // Validation
    if (!formData.name?.trim()) {
      toast.error(t('scheduler.validation.nameRequired'));
      return;
    }

    if (!formData.prompt?.trim()) {
      toast.error(t('scheduler.validation.promptRequired'));
      return;
    }

    if (!isScheduleValid) {
      toast.error(t('scheduler.validation.invalidCron'));
      return;
    }

    if (!formData.resultHandlers?.some((h) => h.enabled)) {
      toast.error(t('scheduler.validation.selectAtLeastOneHandler'));
      return;
    }

    setIsSaving(true);
    try {
      const taskToSave: ScheduledTask = {
        id: task?.id || `task-${Date.now()}`,
        name: formData.name!,
        description: formData.description,
        enabled: formData.enabled!,
        schedule: formData.schedule!,
        prompt: formData.prompt!,
        thinkingMode: formData.thinkingMode!,
        enableRAG: formData.enableRAG!,
        enableTools: formData.enableTools!,
        allowedTools: formData.allowedTools!,
        resultHandlers: formData.resultHandlers!,
        created_at: task?.created_at || Date.now(),
        updated_at: Date.now(),
        lastExecutedAt: task?.lastExecutedAt,
        nextExecutionAt: task?.nextExecutionAt,
      };

      await onSave(taskToSave);
      onClose();
    } catch (error) {
      console.error('Failed to save task:', error);
      toast.error(t('scheduler.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const toggleTool = (tool: string) => {
    const allowedTools = formData.allowedTools || [];
    if (allowedTools.includes(tool)) {
      setFormData({
        ...formData,
        allowedTools: allowedTools.filter((t: any) => t !== tool),
      });
    } else {
      setFormData({
        ...formData,
        allowedTools: [...allowedTools, tool],
      });
    }
  };

  const toolOptions = Array.from(new Set([...(formData.allowedTools || []), ...availableTools]));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{task ? t('scheduler.edit') : t('scheduler.addTask')}</DialogTitle>
          <DialogDescription>
            {task ? '스케줄 작업을 수정합니다' : '새로운 스케줄 작업을 추가합니다'}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="basic">기본 정보</TabsTrigger>
            <TabsTrigger value="schedule">스케줄</TabsTrigger>
            <TabsTrigger value="agent">Agent 설정</TabsTrigger>
            <TabsTrigger value="results">결과 처리</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[50vh] mt-4">
            <div className="pr-4">
              <TabsContent value="basic" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="task-name">
                    {t('scheduler.taskName')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="task-name"
                    placeholder="예: 매일 아침 뉴스 요약"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="task-description">{t('scheduler.taskDescription')}</Label>
                  <Textarea
                    id="task-description"
                    placeholder="작업에 대한 설명을 입력하세요 (선택사항)"
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="space-y-0.5">
                    <Label htmlFor="task-enabled">{t('scheduler.enable')}</Label>
                    <div className="text-sm text-muted-foreground">작업을 즉시 활성화합니다</div>
                  </div>
                  <Switch
                    id="task-enabled"
                    checked={formData.enabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
                  />
                </div>
              </TabsContent>

              <TabsContent value="schedule" className="space-y-4">
                <ScheduleConfigForm
                  schedule={formData.schedule!}
                  onChange={(schedule) => setFormData({ ...formData, schedule })}
                  onValidationChange={setIsScheduleValid}
                />
              </TabsContent>

              <TabsContent value="agent" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="task-prompt">
                    {t('scheduler.prompt')} <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="task-prompt"
                    placeholder="Agent에게 실행시킬 프롬프트를 입력하세요"
                    value={formData.prompt}
                    onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
                    rows={6}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="thinking-mode">{t('scheduler.thinkingMode')}</Label>
                  <Select
                    value={formData.thinkingMode}
                    onValueChange={(value: ThinkingMode) =>
                      setFormData({ ...formData, thinkingMode: value })
                    }
                  >
                    <SelectTrigger id="thinking-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instant">Instant</SelectItem>
                      <SelectItem value="sequential">Sequential</SelectItem>
                      <SelectItem value="tree-of-thought">Tree of Thought</SelectItem>
                      <SelectItem value="deep">Deep</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="space-y-0.5">
                    <Label htmlFor="enable-rag">{t('scheduler.enableRAG')}</Label>
                    <div className="text-sm text-muted-foreground">문서 검색 기능 활성화</div>
                  </div>
                  <Switch
                    id="enable-rag"
                    checked={formData.enableRAG}
                    onCheckedChange={(checked) => setFormData({ ...formData, enableRAG: checked })}
                  />
                </div>

                <div className="space-y-3 p-3 rounded-lg border">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="enable-tools">{t('scheduler.enableTools')}</Label>
                      <div className="text-sm text-muted-foreground">도구 사용 기능 활성화</div>
                    </div>
                    <Switch
                      id="enable-tools"
                      checked={formData.enableTools}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, enableTools: checked })
                      }
                    />
                  </div>

                  {formData.enableTools && (
                    <div className="space-y-2 pt-2 border-t">
                      <Label className="text-sm">{t('scheduler.allowedTools')}</Label>
                      <div className="flex flex-wrap gap-2">
                        {toolOptions.map((tool: any) => {
                          const isSelected = formData.allowedTools?.includes(tool);
                          return (
                            <Badge
                              key={tool}
                              variant={isSelected ? 'default' : 'outline'}
                              className="cursor-pointer"
                              onClick={() => toggleTool(tool)}
                            >
                              {tool}
                              {isSelected && <X className="w-3 h-3 ml-1" />}
                            </Badge>
                          );
                        })}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        선택한 도구만 자동으로 승인됩니다
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="results" className="space-y-4">
                <ResultHandlersForm
                  handlers={formData.resultHandlers || []}
                  onChange={(handlers) => setFormData({ ...formData, resultHandlers: handlers })}
                />
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            {t('scheduler.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? '저장 중...' : t('scheduler.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
