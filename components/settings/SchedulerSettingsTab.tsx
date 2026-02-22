'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { TaskList } from './scheduler/TaskList';
import { TaskFormDialog } from './scheduler/TaskFormDialog';
import { ExecutionHistoryDialog } from './scheduler/ExecutionHistoryDialog';
import { useChatStore } from '@/lib/store/chat-store';
import type { ScheduledTask } from '@/types/scheduler';
import { Clock, Plus, History } from 'lucide-react';
import { toast } from 'sonner';
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

interface SchedulerSettingsTabProps {
  onSave?: () => void;
  isSaving?: boolean;
  message?: { type: 'success' | 'error'; text: string } | null;
}

export function SchedulerSettingsTab({
  onSave: _onSave,
  isSaving: _isSaving,
  message: _message,
}: SchedulerSettingsTabProps) {
  const { t } = useTranslation();
  const {
    scheduledTasks,
    executionHistory,
    isLoadingTasks,
    isLoadingHistory,
    loadTasks,
    createTask,
    updateTask,
    deleteTask,
    runTaskNow,
    loadExecutionHistory,
  } = useChatStore();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyTaskId, setHistoryTaskId] = useState<string | null>(null);
  const [historyTaskName, setHistoryTaskName] = useState<string | undefined>(undefined);
  const [deleteConfirmTask, setDeleteConfirmTask] = useState<string | null>(null);
  const [runningTaskIds, setRunningTaskIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleAddTask = () => {
    setEditingTask(null);
    setIsFormOpen(true);
  };

  const handleEditTask = (task: ScheduledTask) => {
    setEditingTask(task);
    setIsFormOpen(true);
  };

  const handleSaveTask = async (task: ScheduledTask) => {
    try {
      if (editingTask) {
        await updateTask(task.id, task);
        toast.success(t('scheduler.saveSuccess'));
      } else {
        await createTask(task);
        toast.success(t('scheduler.saveSuccess'));
      }
      setIsFormOpen(false);
      setEditingTask(null);
    } catch (error) {
      console.error('Failed to save task:', error);
      toast.error(t('scheduler.saveFailed'));
      throw error;
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    setDeleteConfirmTask(taskId);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmTask) {
      return;
    }

    try {
      await deleteTask(deleteConfirmTask);
      toast.success(t('scheduler.deleteSuccess'));
      setDeleteConfirmTask(null);
    } catch (error) {
      console.error('Failed to delete task:', error);
      toast.error(t('scheduler.deleteFailed'));
    }
  };

  const handleToggleTask = async (taskId: string, enabled: boolean) => {
    try {
      await updateTask(taskId, { enabled });
      toast.success(enabled ? t('scheduler.toggleEnabled') : t('scheduler.toggleDisabled'));
    } catch (error) {
      console.error('Failed to toggle task:', error);
      toast.error(t('scheduler.toggleFailed'));
    }
  };

  const handleRunNow = async (taskId: string) => {
    setRunningTaskIds((prev) => new Set(prev).add(taskId));
    try {
      await runTaskNow(taskId);
      toast.success(t('scheduler.runSuccess'));
    } catch (error) {
      console.error('Failed to run task:', error);
      toast.error(t('scheduler.runFailed'));
    } finally {
      setRunningTaskIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(taskId);
        return newSet;
      });
    }
  };

  const handleViewHistory = (taskId?: string, taskName?: string) => {
    setHistoryTaskId(taskId || null);
    setHistoryTaskName(taskName);
    setIsHistoryOpen(true);
  };

  const activeTasksCount = scheduledTasks.filter((t: any) => t.enabled).length;

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        title={t('scheduler.title')}
        description={t('settings.scheduler.description')}
        icon={Clock}
      />

      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            {t('scheduler.taskCount', { count: scheduledTasks.length })} (
            {t('scheduler.activeCount', { count: activeTasksCount })})
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleViewHistory()}>
            <History className="w-4 h-4 mr-2" />
            {t('scheduler.viewHistory')}
          </Button>
          <Button onClick={handleAddTask}>
            <Plus className="w-4 h-4 mr-2" />
            {t('scheduler.addTask')}
          </Button>
        </div>
      </div>

      {isLoadingTasks ? (
        <div className="text-center py-12 text-muted-foreground">
          {t('scheduler.loadingHistory')}
        </div>
      ) : (
        <TaskList
          tasks={scheduledTasks}
          onEdit={handleEditTask}
          onDelete={handleDeleteTask}
          onToggle={handleToggleTask}
          onRunNow={handleRunNow}
          onViewHistory={handleViewHistory}
          runningTaskIds={runningTaskIds}
        />
      )}

      <TaskFormDialog
        open={isFormOpen}
        task={editingTask}
        onClose={() => {
          setIsFormOpen(false);
          setEditingTask(null);
        }}
        onSave={handleSaveTask}
      />

      <ExecutionHistoryDialog
        open={isHistoryOpen}
        taskId={historyTaskId}
        taskName={historyTaskName}
        history={executionHistory}
        isLoading={isLoadingHistory}
        onClose={() => setIsHistoryOpen(false)}
        onLoad={loadExecutionHistory}
      />

      <AlertDialog open={!!deleteConfirmTask} onOpenChange={() => setDeleteConfirmTask(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('scheduler.confirmDelete')}</AlertDialogTitle>
            <AlertDialogDescription>{t('scheduler.deleteWarning')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('scheduler.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>{t('scheduler.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
