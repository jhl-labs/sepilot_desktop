'use client';

import { ImageGenerationProgress } from '@/types';
import { cn } from '@/lib/utils';
import { ImageIcon, Loader2, CheckCircle, XCircle } from 'lucide-react';

interface ImageGenerationProgressBarProps {
  progress: ImageGenerationProgress;
  className?: string;
}

export function ImageGenerationProgressBar({ progress, className }: ImageGenerationProgressBarProps) {
  const getStatusIcon = () => {
    switch (progress.status) {
      case 'queued':
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
      case 'executing':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <ImageIcon className="h-4 w-4" />;
    }
  };

  const getProgressBarColor = () => {
    switch (progress.status) {
      case 'queued':
        return 'bg-muted-foreground/50';
      case 'executing':
        return 'bg-primary';
      case 'completed':
        return 'bg-green-500';
      case 'error':
        return 'bg-destructive';
      default:
        return 'bg-primary';
    }
  };

  const getBackgroundColor = () => {
    switch (progress.status) {
      case 'completed':
        return 'bg-green-500/10 border-green-500/30';
      case 'error':
        return 'bg-destructive/10 border-destructive/30';
      default:
        return 'bg-primary/5 border-primary/20';
    }
  };

  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-all duration-300',
        getBackgroundColor(),
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        {getStatusIcon()}
        <span className="text-sm font-medium">
          {progress.status === 'queued' && '이미지 생성 대기 중...'}
          {progress.status === 'executing' && '이미지 생성 중...'}
          {progress.status === 'completed' && '이미지 생성 완료!'}
          {progress.status === 'error' && '이미지 생성 실패'}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full transition-all duration-500 ease-out rounded-full',
            getProgressBarColor(),
            progress.status === 'executing' && 'animate-pulse'
          )}
          style={{ width: `${progress.progress}%` }}
        />
      </div>

      {/* Progress Details */}
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{progress.message}</span>
        <span className="font-medium">{progress.progress}%</span>
      </div>

      {/* Step Info */}
      {progress.currentStep !== undefined && progress.totalSteps !== undefined && (
        <div className="mt-1 text-xs text-muted-foreground">
          단계: {progress.currentStep} / {progress.totalSteps}
        </div>
      )}
    </div>
  );
}
