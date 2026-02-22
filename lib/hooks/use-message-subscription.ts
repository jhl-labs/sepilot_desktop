import { useState, useEffect, useCallback } from 'react';
import type {
  MessageSubscriptionConfig,
  MessageQueueStatus,
  QueuedMessage,
} from '@/types/message-subscription';

export function useMessageSubscription() {
  const [config, setConfig] = useState<MessageSubscriptionConfig | null>(null);
  const [status, setStatus] = useState<MessageQueueStatus | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastPolled, setLastPolled] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 설정 로드
  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const cfg = await window.electronAPI.messageSubscription.getConfig();
      setConfig(cfg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load config');
    } finally {
      setLoading(false);
    }
  }, []);

  // 큐 상태 로드
  const loadStatus = useCallback(async () => {
    try {
      const st = await window.electronAPI.messageSubscription.getQueueStatus();
      setStatus(st);
    } catch (err) {
      console.error('Failed to load queue status:', err);
    }
  }, []);

  // 연결 상태 로드
  const loadConnectionStatus = useCallback(async () => {
    try {
      const connectionStatus = await window.electronAPI.messageSubscription.getStatus();
      setIsConnected(connectionStatus.isConnected);
      setLastPolled(connectionStatus.lastPolled);
    } catch (err) {
      console.error('Failed to load connection status:', err);
    }
  }, []);

  // 설정 저장
  const saveConfig = useCallback(
    async (newConfig: MessageSubscriptionConfig) => {
      try {
        setLoading(true);
        setError(null);
        const savedConfig = await window.electronAPI.messageSubscription.saveConfig(newConfig);
        setConfig(savedConfig || newConfig);
        await Promise.all([loadStatus(), loadConnectionStatus()]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save config');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [loadConnectionStatus, loadStatus]
  );

  // 구독 시작
  const start = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      await window.electronAPI.messageSubscription.start();
      await loadConnectionStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start subscription');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [loadConnectionStatus]);

  // 구독 중지
  const stop = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      await window.electronAPI.messageSubscription.stop();
      await loadConnectionStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop subscription');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [loadConnectionStatus]);

  // 수동 새로고침
  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await window.electronAPI.messageSubscription.refresh();
      await loadStatus();
      await loadConnectionStatus();
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [loadStatus, loadConnectionStatus]);

  // 실패한 메시지 목록 조회
  const getFailedMessages = useCallback(async (): Promise<QueuedMessage[]> => {
    try {
      return await window.electronAPI.messageSubscription.getFailedMessages();
    } catch (err) {
      console.error('Failed to get failed messages:', err);
      return [];
    }
  }, []);

  // 대기 메시지 목록 조회
  const getPendingMessages = useCallback(async (): Promise<QueuedMessage[]> => {
    try {
      return await window.electronAPI.messageSubscription.getPendingMessages();
    } catch (err) {
      console.error('Failed to get pending messages:', err);
      return [];
    }
  }, []);

  // 완료된 메시지 목록 조회
  const getCompletedMessages = useCallback(async (): Promise<QueuedMessage[]> => {
    try {
      return await window.electronAPI.messageSubscription.getCompletedMessages();
    } catch (err) {
      console.error('Failed to get completed messages:', err);
      return [];
    }
  }, []);

  // 메시지 재처리
  const reprocessMessage = useCallback(
    async (hash: string) => {
      try {
        setLoading(true);
        setError(null);
        await window.electronAPI.messageSubscription.reprocessMessage(hash);
        await loadStatus();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reprocess message');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [loadStatus]
  );

  // 메시지 삭제
  const deleteMessage = useCallback(
    async (hash: string) => {
      try {
        setLoading(true);
        setError(null);
        await window.electronAPI.messageSubscription.deleteMessage(hash);
        await loadStatus();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete message');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [loadStatus]
  );

  // 큐 정리
  const cleanupQueue = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await window.electronAPI.messageSubscription.cleanupQueue();
      await loadStatus();
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cleanup queue');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [loadStatus]);

  // 초기 로드 및 주기적 업데이트
  useEffect(() => {
    loadConfig();
    loadStatus();
    loadConnectionStatus();

    // 5초마다 상태 업데이트
    const interval = setInterval(() => {
      loadStatus();
      loadConnectionStatus();
    }, 5000);

    return () => clearInterval(interval);
  }, [loadConfig, loadStatus, loadConnectionStatus]);

  return {
    config,
    status,
    isConnected,
    lastPolled,
    loading,
    error,
    saveConfig,
    start,
    stop,
    refresh,
    getFailedMessages,
    getPendingMessages,
    getCompletedMessages,
    reprocessMessage,
    deleteMessage,
    cleanupQueue,
    loadStatus,
  };
}
