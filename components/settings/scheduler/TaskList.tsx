'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ScheduledTask } from '@/types/scheduler';
import {
  Edit2,
  Trash2,
  Play,
  Clock,
  Calendar,
  CheckCircle2,
  XCircle,
  History,
  FileText,
  Loader2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { ko, enUS, zhCN } from 'date-fns/locale';

interface TaskListProps {
  tasks: ScheduledTask[];
  onEdit: (task: ScheduledTask) => void;
  onDelete: (taskId: string) => void;
  onToggle: (taskId: string, enabled: boolean) => void;
  onRunNow: (taskId: string) => void;
  onViewHistory: (taskId: string, taskName: string) => void;
  runningTaskIds?: Set<string>;
}

export function TaskList({
  tasks,
  onEdit,
  onDelete,
  onToggle,
  onRunNow,
  onViewHistory,
  runningTaskIds,
}: TaskListProps) {
  const { t, i18n } = useTranslation();

  const getLocale = () => {
    switch (i18n.language) {
      case 'ko':
        return ko;
      case 'zh':
        return zhCN;
      default:
        return enUS;
    }
  };

  const formatSchedule = (task: ScheduledTask): string => {
    if (task.schedule.type === 'preset') {
      const presetKey = `scheduler.preset${task.schedule.preset
        .split('-')
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join('')}`;
      let schedule = t(presetKey);

      if (task.schedule.time) {
        schedule += ` ${task.schedule.time}`;
      }
      if (task.schedule.dayOfWeek !== undefined) {
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        schedule += ` (${days[task.schedule.dayOfWeek]}요일)`;
      }
      if (task.schedule.dayOfMonth !== undefined) {
        schedule += ` (${task.schedule.dayOfMonth}일)`;
      }

      return schedule;
    } else {
      return task.schedule.expression;
    }
  };

  if (tasks.length === 0) {
    return (
      <div className="text-center py-12 border-2 border-dashed rounded-lg">
        <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">{t('scheduler.noTasks')}</h3>
        <p className="text-sm text-muted-foreground">{t('scheduler.addTask')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tasks.map((task: any) => (
        <Card key={task.id} className={!task.enabled ? 'opacity-60' : ''}>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-lg">{task.name}</CardTitle>
                  {task.enabled ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      {t('scheduler.enable')}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <XCircle className="w-3 h-3" />
                      {t('scheduler.disable')}
                    </Badge>
                  )}
                </div>
                {task.description && (
                  <CardDescription className="mt-2">{task.description}</CardDescription>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={task.enabled}
                  onCheckedChange={(checked) => onToggle(task.id, checked)}
                />
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Schedule Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">{t('scheduler.schedule')}</div>
                  <div className="font-medium">{formatSchedule(task)}</div>
                </div>
              </div>

              {task.lastExecutedAt && (
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">
                      {t('scheduler.lastExecuted')}
                    </div>
                    <div className="font-medium">
                      {formatDistanceToNow(new Date(task.lastExecutedAt), {
                        addSuffix: true,
                        locale: getLocale(),
                      })}
                    </div>
                  </div>
                </div>
              )}

              {task.nextExecutionAt && (
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">
                      {t('scheduler.nextExecution')}
                    </div>
                    <div className="font-medium">
                      {formatDistanceToNow(new Date(task.nextExecutionAt), {
                        addSuffix: true,
                        locale: getLocale(),
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Task Details */}
            <div className="flex flex-wrap gap-2 text-xs">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="cursor-help">
                      <FileText className="w-3 h-3 mr-1" />
                      Prompt
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-md">
                    <p className="whitespace-pre-wrap text-xs">{task.prompt}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Badge variant="outline">
                {t(`thinkingMode.${task.thinkingMode}` as any) || task.thinkingMode}
              </Badge>
              {task.enableRAG && <Badge variant="outline">RAG</Badge>}
              {task.enableTools && (
                <Badge variant="outline">Tools ({task.allowedTools.length})</Badge>
              )}
              {task.resultHandlers.map((handler: any, idx: number) => (
                <Badge key={idx} variant="secondary">
                  {t(
                    `scheduler.${handler.type === 'conversation' ? 'createConversation' : handler.type === 'notification' ? 'sendNotification' : 'saveToFile'}` as any
                  )}
                </Badge>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => onEdit(task)}>
                <Edit2 className="w-4 h-4 mr-2" />
                {t('scheduler.edit')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onRunNow(task.id)}
                disabled={runningTaskIds?.has(task.id)}
              >
                {runningTaskIds?.has(task.id) ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {runningTaskIds?.has(task.id) ? '실행 중...' : t('scheduler.runNow')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => onViewHistory(task.id, task.name)}>
                <History className="w-4 h-4 mr-2" />
                히스토리
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => onDelete(task.id)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {t('scheduler.delete')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
