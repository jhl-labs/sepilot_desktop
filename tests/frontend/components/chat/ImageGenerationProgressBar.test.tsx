/**
 * ImageGenerationProgressBar 컴포넌트 테스트
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ImageGenerationProgressBar } from '@/components/chat/unified/components/ImageGenerationProgressBar';
import { ImageGenerationProgress } from '@/types';

describe('ImageGenerationProgressBar', () => {
  const baseProgress = {
    conversationId: 'conv-1',
    messageId: 'msg-1',
  };

  it('should render queued status', () => {
    const progress: ImageGenerationProgress = {
      ...baseProgress,
      status: 'queued',
      progress: 0,
      message: '대기 중...',
    };

    render(<ImageGenerationProgressBar progress={progress} />);

    expect(screen.getByText('이미지 생성 대기 중...')).toBeInTheDocument();
    expect(screen.getByText('대기 중...')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('should render executing status', () => {
    const progress: ImageGenerationProgress = {
      ...baseProgress,
      status: 'executing',
      progress: 50,
      message: '생성 중...',
    };

    render(<ImageGenerationProgressBar progress={progress} />);

    expect(screen.getByText('이미지 생성 중...')).toBeInTheDocument();
    expect(screen.getByText('생성 중...')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('should render completed status', () => {
    const progress: ImageGenerationProgress = {
      ...baseProgress,
      status: 'completed',
      progress: 100,
      message: '완료!',
    };

    render(<ImageGenerationProgressBar progress={progress} />);

    expect(screen.getByText('이미지 생성 완료!')).toBeInTheDocument();
    expect(screen.getByText('완료!')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('should render error status', () => {
    const progress: ImageGenerationProgress = {
      ...baseProgress,
      status: 'error',
      progress: 0,
      message: '오류가 발생했습니다',
    };

    render(<ImageGenerationProgressBar progress={progress} />);

    expect(screen.getByText('이미지 생성 실패')).toBeInTheDocument();
    expect(screen.getByText('오류가 발생했습니다')).toBeInTheDocument();
  });

  it('should show step info when provided', () => {
    const progress: ImageGenerationProgress = {
      ...baseProgress,
      status: 'executing',
      progress: 30,
      message: '처리 중...',
      currentStep: 2,
      totalSteps: 5,
    };

    render(<ImageGenerationProgressBar progress={progress} />);

    expect(screen.getByText('단계: 2 / 5')).toBeInTheDocument();
  });

  it('should not show step info when not provided', () => {
    const progress: ImageGenerationProgress = {
      ...baseProgress,
      status: 'executing',
      progress: 30,
      message: '처리 중...',
    };

    render(<ImageGenerationProgressBar progress={progress} />);

    expect(screen.queryByText(/단계:/)).not.toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const progress: ImageGenerationProgress = {
      ...baseProgress,
      status: 'queued',
      progress: 0,
      message: '대기 중',
    };

    const { container } = render(
      <ImageGenerationProgressBar progress={progress} className="custom-class" />
    );

    const progressBar = container.firstChild as HTMLElement;
    expect(progressBar).toHaveClass('custom-class');
  });

  it('should show progress bar at correct width', () => {
    const progress: ImageGenerationProgress = {
      ...baseProgress,
      status: 'executing',
      progress: 75,
      message: '진행 중',
    };

    const { container } = render(<ImageGenerationProgressBar progress={progress} />);

    const progressBar = container.querySelector('[style*="width"]');
    expect(progressBar).toHaveStyle({ width: '75%' });
  });

  it('should render all statuses correctly', () => {
    const statuses: Array<ImageGenerationProgress['status']> = [
      'queued',
      'executing',
      'completed',
      'error',
    ];

    statuses.forEach((status) => {
      const progress: ImageGenerationProgress = {
        ...baseProgress,
        status,
        progress: 50,
        message: 'Test message',
      };

      const { unmount } = render(<ImageGenerationProgressBar progress={progress} />);

      // Verify that component renders without errors
      expect(screen.getByText('Test message')).toBeInTheDocument();

      unmount();
    });
  });

  it('should handle zero progress', () => {
    const progress: ImageGenerationProgress = {
      ...baseProgress,
      status: 'queued',
      progress: 0,
      message: '시작 전',
    };

    const { container } = render(<ImageGenerationProgressBar progress={progress} />);

    const progressBar = container.querySelector('[style*="width"]');
    expect(progressBar).toHaveStyle({ width: '0%' });
  });

  it('should handle full progress', () => {
    const progress: ImageGenerationProgress = {
      ...baseProgress,
      status: 'completed',
      progress: 100,
      message: '완료',
    };

    const { container } = render(<ImageGenerationProgressBar progress={progress} />);

    const progressBar = container.querySelector('[style*="width"]');
    expect(progressBar).toHaveStyle({ width: '100%' });
  });

  it('should display message correctly', () => {
    const message = 'Custom progress message';
    const progress: ImageGenerationProgress = {
      ...baseProgress,
      status: 'executing',
      progress: 45,
      message,
    };

    render(<ImageGenerationProgressBar progress={progress} />);

    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it('should show step 1 of 3', () => {
    const progress: ImageGenerationProgress = {
      ...baseProgress,
      status: 'executing',
      progress: 33,
      message: '첫 단계',
      currentStep: 1,
      totalSteps: 3,
    };

    render(<ImageGenerationProgressBar progress={progress} />);

    expect(screen.getByText('단계: 1 / 3')).toBeInTheDocument();
  });

  it('should show final step', () => {
    const progress: ImageGenerationProgress = {
      ...baseProgress,
      status: 'executing',
      progress: 90,
      message: '마지막 단계',
      currentStep: 5,
      totalSteps: 5,
    };

    render(<ImageGenerationProgressBar progress={progress} />);

    expect(screen.getByText('단계: 5 / 5')).toBeInTheDocument();
  });

  it('should handle unknown status with default icon', () => {
    const progress = {
      ...baseProgress,
      status: 'unknown-status' as any,
      progress: 50,
      message: '알 수 없는 상태',
    };

    const { container } = render(<ImageGenerationProgressBar progress={progress} />);

    // Should render without errors and use default ImageIcon
    expect(screen.getByText('알 수 없는 상태')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('should handle unknown status with default progress bar color', () => {
    const progress = {
      ...baseProgress,
      status: 'invalid-status' as any,
      progress: 75,
      message: '잘못된 상태',
    };

    const { container } = render(<ImageGenerationProgressBar progress={progress} />);

    // Should render progress bar with default color
    expect(screen.getByText('75%')).toBeInTheDocument();
    const progressBar = container.querySelector('[style*="width"]');
    expect(progressBar).toHaveStyle({ width: '75%' });
  });
});
