'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ExecutionRecord } from '@/types/scheduler';
import type { ExecutionHistoryQuery } from '@/types/scheduler';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { ko, enUS, zhCN } from 'date-fns/locale';
import { CheckCircle2, XCircle, Clock, Ban } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface ExecutionHistoryDialogProps {
  open: boolean;
  taskId: string | null;
  taskName?: string;
  history: ExecutionRecord[];
  isLoading: boolean;
  onClose: () => void;
  onLoad: (taskId?: string, filters?: ExecutionHistoryQuery) => void;
}

export function ExecutionHistoryDialog({
  open,
  taskId,
  taskName,
  history,
  isLoading,
  onClose,
  onLoad,
}: ExecutionHistoryDialogProps) {
  const { t, i18n } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<ExecutionRecord['status'] | 'all'>('all');
  const [triggerFilter, setTriggerFilter] = useState<ExecutionRecord['trigger'] | 'all'>('all');
  const [startedAfterDate, setStartedAfterDate] = useState('');
  const [startedBeforeDate, setStartedBeforeDate] = useState('');

  const toLocalDateInputValue = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const applyDatePreset = (preset: '24h' | '7d' | '30d' | 'clear') => {
    if (preset === 'clear') {
      setStartedAfterDate('');
      setStartedBeforeDate('');
      return;
    }

    const now = new Date();
    const toDate = toLocalDateInputValue(now);
    const fromDate = new Date(now);
    if (preset === '24h') {
      fromDate.setDate(fromDate.getDate() - 1);
    } else if (preset === '7d') {
      fromDate.setDate(fromDate.getDate() - 7);
    } else {
      fromDate.setDate(fromDate.getDate() - 30);
    }

    setStartedAfterDate(toLocalDateInputValue(fromDate));
    setStartedBeforeDate(toDate);
  };

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

  useEffect(() => {
    if (open) {
      const startedAfter = startedAfterDate
        ? new Date(`${startedAfterDate}T00:00:00`).getTime()
        : undefined;
      const startedBefore = startedBeforeDate
        ? new Date(`${startedBeforeDate}T23:59:59.999`).getTime()
        : undefined;

      if (
        typeof startedAfter === 'number' &&
        typeof startedBefore === 'number' &&
        startedAfter > startedBefore
      ) {
        return;
      }

      onLoad(taskId || undefined, {
        status: statusFilter === 'all' ? undefined : statusFilter,
        trigger: triggerFilter === 'all' ? undefined : triggerFilter,
        startedAfter,
        startedBefore,
      });
    }
  }, [open, taskId, onLoad, statusFilter, triggerFilter, startedAfterDate, startedBeforeDate]);

  const isDateRangeInvalid =
    !!startedAfterDate && !!startedBeforeDate && startedAfterDate > startedBeforeDate;

  const getStatusIcon = (status: ExecutionRecord['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'running':
        return <Clock className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'cancelled':
        return <Ban className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusBadgeVariant = (
    status: ExecutionRecord['status']
  ): 'default' | 'destructive' | 'secondary' => {
    switch (status) {
      case 'success':
        return 'default';
      case 'error':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const formatDuration = (duration?: number) => {
    if (!duration) {
      return '-';
    }
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh]" onClose={onClose}>
        <DialogHeader>
          <DialogTitle>{t('scheduler.executionHistory')}</DialogTitle>
          <DialogDescription>
            {taskName
              ? t('scheduler.taskLabel', { taskName })
              : t('scheduler.allTasksExecutionHistory')}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[60vh]">
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('scheduler.filterStatus')}</p>
              <Select
                value={statusFilter}
                onValueChange={(value) =>
                  setStatusFilter(value as ExecutionRecord['status'] | 'all')
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('scheduler.filterAll')}</SelectItem>
                  <SelectItem value="success">{t('scheduler.status.success')}</SelectItem>
                  <SelectItem value="error">{t('scheduler.status.error')}</SelectItem>
                  <SelectItem value="running">{t('scheduler.status.running')}</SelectItem>
                  <SelectItem value="cancelled">{t('scheduler.status.cancelled')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('scheduler.filterTrigger')}</p>
              <Select
                value={triggerFilter || 'all'}
                onValueChange={(value) =>
                  setTriggerFilter(value as ExecutionRecord['trigger'] | 'all')
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('scheduler.filterAll')}</SelectItem>
                  <SelectItem value="schedule">{t('scheduler.trigger.schedule')}</SelectItem>
                  <SelectItem value="manual">{t('scheduler.trigger.manual')}</SelectItem>
                  <SelectItem value="catch-up">{t('scheduler.trigger.catch-up')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('scheduler.filterFromDate')}</p>
              <Input
                type="date"
                value={startedAfterDate}
                onChange={(e) => setStartedAfterDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('scheduler.filterToDate')}</p>
              <Input
                type="date"
                value={startedBeforeDate}
                onChange={(e) => setStartedBeforeDate(e.target.value)}
              />
            </div>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => applyDatePreset('24h')}>
              {t('scheduler.presetLast24Hours')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => applyDatePreset('7d')}>
              {t('scheduler.presetLast7Days')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => applyDatePreset('30d')}>
              {t('scheduler.presetLast30Days')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => applyDatePreset('clear')}>
              {t('scheduler.clearFilters')}
            </Button>
          </div>

          {isDateRangeInvalid && (
            <p className="mb-2 text-xs text-destructive">{t('scheduler.filterInvalidDateRange')}</p>
          )}

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('scheduler.loadingHistory')}
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('scheduler.noExecutionHistory')}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">{t('scheduler.historyExecutedAt')}</TableHead>
                  <TableHead className="w-[100px]">{t('scheduler.historyStatus')}</TableHead>
                  <TableHead className="w-[100px]">{t('scheduler.historyTrigger')}</TableHead>
                  <TableHead className="w-[90px]">{t('scheduler.historyAttempts')}</TableHead>
                  <TableHead className="w-[100px]">{t('scheduler.duration')}</TableHead>
                  <TableHead>{t('scheduler.resultSummary')}</TableHead>
                  <TableHead className="w-[150px]">
                    {t('scheduler.historyResultProcessing')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-mono text-xs">
                      {format(new Date(record.startedAt), 'yyyy-MM-dd HH:mm:ss', {
                        locale: getLocale(),
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(record.status)} className="gap-1">
                        {getStatusIcon(record.status)}
                        {t(`scheduler.status.${record.status}` as any)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {record.trigger ? t(`scheduler.trigger.${record.trigger}` as any) : '-'}
                    </TableCell>
                    <TableCell className="text-xs">{record.attemptCount ?? 1}</TableCell>
                    <TableCell className="text-sm">{formatDuration(record.duration)}</TableCell>
                    <TableCell>
                      <div className="max-w-md">
                        {record.status === 'error' && record.errorMessage ? (
                          <p className="text-sm text-destructive line-clamp-2">
                            {record.errorMessage}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {record.resultSummary || '-'}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-xs">
                        {record.conversationId && (
                          <Badge variant="outline" className="w-fit">
                            {t('scheduler.conversationCreated')}
                          </Badge>
                        )}
                        {record.notificationSent && (
                          <Badge variant="outline" className="w-fit">
                            {t('scheduler.notificationSent')}
                          </Badge>
                        )}
                        {record.savedFilePath && (
                          <Badge variant="outline" className="w-fit">
                            {t('scheduler.fileSaved')}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
