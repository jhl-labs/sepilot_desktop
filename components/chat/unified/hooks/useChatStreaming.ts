/**
 * useChatStreaming Hook
 *
 * 스트리밍 상태 관리 및 RAF 최적화
 */

import { useRef, useCallback } from 'react';
import type { Message } from '@/types';
import type { ChatDataSource } from '../types';

export function useChatStreaming(dataSource: ChatDataSource) {
  const rafIdRef = useRef<number | null>(null);
  const pendingUpdate = useRef(false);
  const accumulatedMessage = useRef<Partial<Message>>({});

  /**
   * 부드러운 UI 업데이트를 위한 RAF 기반 배칭
   * RAF (requestAnimationFrame)로 렌더링을 배칭하여 성능 향상
   */
  const scheduleUpdate = useCallback(
    (messageId: string, updates: Partial<Message>, force = false) => {
      accumulatedMessage.current = { ...accumulatedMessage.current, ...updates };

      if (force) {
        // 강제 업데이트 (스트리밍 완료 시)
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        dataSource.updateMessage(messageId, accumulatedMessage.current);
        pendingUpdate.current = false;
        accumulatedMessage.current = {};
        return;
      }

      // RAF가 이미 예약되어 있으면, 다음 프레임에서 최신 상태로 업데이트됨
      if (pendingUpdate.current) {
        return;
      }

      pendingUpdate.current = true;
      rafIdRef.current = requestAnimationFrame(() => {
        dataSource.updateMessage(messageId, accumulatedMessage.current);
        pendingUpdate.current = false;
        rafIdRef.current = null;
      });
    },
    [dataSource]
  );

  /**
   * 스트리밍 시작
   */
  const startStreaming = useCallback(
    (messageId: string) => {
      dataSource.startStreaming(messageId);
      accumulatedMessage.current = {};
    },
    [dataSource]
  );

  /**
   * 스트리밍 종료
   */
  const stopStreaming = useCallback(() => {
    dataSource.stopStreaming();

    // Cleanup RAF
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    pendingUpdate.current = false;
    accumulatedMessage.current = {};
  }, [dataSource]);

  return {
    scheduleUpdate,
    startStreaming,
    stopStreaming,
  };
}
