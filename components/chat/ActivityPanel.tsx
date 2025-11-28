'use client';

import { useEffect, useState } from 'react';
import { Activity } from '@/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileText,
  Terminal,
  Search,
  File,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActivityPanelProps {
  conversationId: string;
  className?: string;
}

const TOOL_ICONS: Record<string, React.ElementType> = {
  file_read: FileText,
  file_write: File,
  file_edit: FileText,
  file_list: File,
  command_execute: Terminal,
  grep_search: Search,
};

const TOOL_LABELS: Record<string, string> = {
  file_read: '파일 읽기',
  file_write: '파일 쓰기',
  file_edit: '파일 수정',
  file_list: '파일 목록',
  command_execute: '명령 실행',
  grep_search: '코드 검색',
};

export function ActivityPanel({ conversationId, className }: ActivityPanelProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Load activities from database
  useEffect(() => {
    const loadActivities = async () => {
      if (!conversationId || !window.electronAPI?.activity) {
        return;
      }

      try {
        setLoading(true);
        const response = await window.electronAPI.activity.loadActivities(conversationId);
        if (response.success && response.data) {
          setActivities(response.data);
        }
      } catch (error) {
        console.error('[ActivityPanel] Failed to load activities:', error);
      } finally {
        setLoading(false);
      }
    };

    loadActivities();
  }, [conversationId]);

  const toggleExpand = (activityId: string) => {
    const newExpanded = new Set(expandedActivities);
    if (newExpanded.has(activityId)) {
      newExpanded.delete(activityId);
    } else {
      newExpanded.add(activityId);
    }
    setExpandedActivities(newExpanded);
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const truncateResult = (result: string, maxLength: number = 100) => {
    if (result.length <= maxLength) return result;
    return result.substring(0, maxLength) + '...';
  };

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center p-4', className)}>
        <p className="text-sm text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center p-8 text-center', className)}>
        <Terminal className="h-12 w-12 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">아직 실행된 도구가 없습니다</p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Coding 모드에서 도구가 실행되면 여기에 표시됩니다
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className={cn('h-full', className)}>
      <div className="space-y-2 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            도구 실행 이력
            <span className="text-xs font-normal text-muted-foreground">
              ({activities.length}개)
            </span>
          </h3>
        </div>

        {activities.map((activity) => {
          const isExpanded = expandedActivities.has(activity.id);
          const ToolIcon = TOOL_ICONS[activity.tool_name] || Terminal;
          const toolLabel = TOOL_LABELS[activity.tool_name] || activity.tool_name;
          const isSuccess = activity.status === 'success';

          return (
            <div
              key={activity.id}
              className={cn(
                'rounded-lg border p-3 transition-all hover:bg-muted/30',
                isSuccess ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'
              )}
            >
              {/* Header */}
              <div
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => toggleExpand(activity.id)}
              >
                <ToolIcon className="h-4 w-4 shrink-0 text-primary" />
                <span className="text-sm font-medium flex-1">{toolLabel}</span>

                {/* Status icon */}
                {isSuccess ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}

                {/* Duration */}
                {activity.duration_ms && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatDuration(activity.duration_ms)}
                  </div>
                )}

                {/* Expand icon */}
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>

              {/* Arguments preview (always shown) */}
              <div className="mt-2 text-xs text-muted-foreground font-mono">
                {Object.entries(activity.tool_args).map(([key, value]) => (
                  <div key={key} className="truncate">
                    <span className="text-primary">{key}:</span>{' '}
                    {typeof value === 'string' ? truncateResult(value, 50) : JSON.stringify(value)}
                  </div>
                ))}
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="mt-3 pt-3 border-t space-y-2">
                  {/* Full arguments */}
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-1">인자:</div>
                    <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                      {JSON.stringify(activity.tool_args, null, 2)}
                    </pre>
                  </div>

                  {/* Result */}
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-1">
                      결과:
                    </div>
                    <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-64 overflow-y-auto">
                      {activity.result}
                    </pre>
                  </div>

                  {/* Timestamp */}
                  <div className="text-xs text-muted-foreground">
                    실행 시각: {new Date(activity.created_at).toLocaleString('ko-KR')}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
