/**
 * ImageGenerationProgressBar 컴포넌트 테스트
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ImageGenerationProgressBar } from '@/components/chat/unified/components/ImageGenerationProgressBar';
import { ImageGenerationProgress } from '@/types';

describe('ImageGenerationProgressBar', () => {
  const baseProgress: ImageGenerationProgress = {
    conversationId: 'conv-1',
    messageId: 'msg-1',
    status: 'queued',
    progress: 0,
    message: 'Starting...',
  };

  it('should render queued status', () => {
    const progress: ImageGenerationProgress = {
      ...baseProgress,
      status: 'queued',
      progress: 0,
      message: 'Waiting in queue...',
    };

    render(<ImageGenerationProgressBar progress={progress} />);

    expect(screen.getByText('이미지 생성 대기 중...')).toBeInTheDocument();
    expect(screen.getByText('Waiting in queue...')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('should render executing status', () => {
    const progress: ImageGenerationProgress = {
      ...baseProgress,
      status: 'executing',
      progress: 50,
      message: 'Generating image...',
    };

    render(<ImageGenerationProgressBar progress={progress} />);

    expect(screen.getByText('이미지 생성 중...')).toBeInTheDocument();
    expect(screen.getByText('Generating image...')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('should render completed status', () => {
    const progress: ImageGenerationProgress = {
      ...baseProgress,
      status: 'completed',
      progress: 100,
      message: 'Image generated successfully!',
    };

    render(<ImageGenerationProgressBar progress={progress} />);

    expect(screen.getByText('이미지 생성 완료!')).toBeInTheDocument();
    expect(screen.getByText('Image generated successfully!')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('should render error status', () => {
    const progress: ImageGenerationProgress = {
      ...baseProgress,
      status: 'error',
      progress: 0,
      message: 'Failed to generate image',
    };

    render(<ImageGenerationProgressBar progress={progress} />);

    expect(screen.getByText('이미지 생성 실패')).toBeInTheDocument();
    expect(screen.getByText('Failed to generate image')).toBeInTheDocument();
  });

  it('should display progress bar with correct width', () => {
    const progress: ImageGenerationProgress = {
      ...baseProgress,
      status: 'executing',
      progress: 75,
      message: 'Processing...',
    };

    const { container } = render(<ImageGenerationProgressBar progress={progress} />);

    const progressBar = container.querySelector('[style*="width: 75%"]');
    expect(progressBar).toBeInTheDocument();
  });

  it('should display step information when provided', () => {
    const progress: ImageGenerationProgress = {
      ...baseProgress,
      status: 'executing',
      progress: 50,
      message: 'Step 2 of 4',
      currentStep: 2,
      totalSteps: 4,
    };

    render(<ImageGenerationProgressBar progress={progress} />);

    expect(screen.getByText(/단계: 2 \/ 4/)).toBeInTheDocument();
  });

  it('should not display step information when not provided', () => {
    const progress: ImageGenerationProgress = {
      ...baseProgress,
      status: 'executing',
      progress: 50,
      message: 'Processing...',
    };

    render(<ImageGenerationProgressBar progress={progress} />);

    expect(screen.queryByText(/단계:/)).not.toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const progress: ImageGenerationProgress = {
      ...baseProgress,
      status: 'queued',
      progress: 0,
      message: 'Waiting...',
    };

    const { container } = render(
      <ImageGenerationProgressBar progress={progress} className="custom-class" />
    );

    const mainDiv = container.firstChild;
    expect(mainDiv).toHaveClass('custom-class');
  });

  it('should show correct icon for queued status', () => {
    const progress: ImageGenerationProgress = {
      ...baseProgress,
      status: 'queued',
      progress: 0,
      message: 'Queued',
    };

    const { container } = render(<ImageGenerationProgressBar progress={progress} />);

    // Should have a loading spinner icon
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('should show correct icon for executing status', () => {
    const progress: ImageGenerationProgress = {
      ...baseProgress,
      status: 'executing',
      progress: 50,
      message: 'Executing',
    };

    const { container } = render(<ImageGenerationProgressBar progress={progress} />);

    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('should show correct icon for completed status', () => {
    const progress: ImageGenerationProgress = {
      ...baseProgress,
      status: 'completed',
      progress: 100,
      message: 'Completed',
    };

    const { container } = render(<ImageGenerationProgressBar progress={progress} />);

    // Should have a CheckCircle icon
    const checkIcon = container.querySelector('.text-green-500');
    expect(checkIcon).toBeInTheDocument();
  });

  it('should show correct icon for error status', () => {
    const progress: ImageGenerationProgress = {
      ...baseProgress,
      status: 'error',
      progress: 0,
      message: 'Error',
    };

    const { container } = render(<ImageGenerationProgressBar progress={progress} />);

    // Should have an XCircle icon
    const errorIcon = container.querySelector('.text-destructive');
    expect(errorIcon).toBeInTheDocument();
  });

  it('should apply pulse animation for executing status', () => {
    const progress: ImageGenerationProgress = {
      ...baseProgress,
      status: 'executing',
      progress: 50,
      message: 'Executing',
    };

    const { container } = render(<ImageGenerationProgressBar progress={progress} />);

    const progressBar = container.querySelector('.animate-pulse');
    expect(progressBar).toBeInTheDocument();
  });

  it('should not apply pulse animation for other statuses', () => {
    const progress: ImageGenerationProgress = {
      ...baseProgress,
      status: 'completed',
      progress: 100,
      message: 'Done',
    };

    const { container } = render(<ImageGenerationProgressBar progress={progress} />);

    const progressBar = container.querySelector('[style*="width: 100%"]');
    expect(progressBar).not.toHaveClass('animate-pulse');
  });

  it('should handle zero progress', () => {
    const progress: ImageGenerationProgress = {
      ...baseProgress,
      status: 'queued',
      progress: 0,
      message: 'Starting',
    };

    render(<ImageGenerationProgressBar progress={progress} />);

    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('should handle 100% progress', () => {
    const progress: ImageGenerationProgress = {
      ...baseProgress,
      status: 'completed',
      progress: 100,
      message: 'Complete',
    };

    render(<ImageGenerationProgressBar progress={progress} />);

    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('should apply correct background color for each status', () => {
    const { container, rerender } = render(
      <ImageGenerationProgressBar
        progress={{ ...baseProgress, status: 'queued', progress: 0, message: '' }}
      />
    );

    let mainDiv = container.firstChild as HTMLElement;
    expect(mainDiv).toHaveClass('bg-primary/5');

    rerender(
      <ImageGenerationProgressBar
        progress={{ ...baseProgress, status: 'completed', progress: 100, message: '' }}
      />
    );
    expect(mainDiv).toHaveClass('bg-green-500/10');

    rerender(
      <ImageGenerationProgressBar
        progress={{ ...baseProgress, status: 'error', progress: 0, message: '' }}
      />
    );
    expect(mainDiv).toHaveClass('bg-destructive/10');
  });
});
