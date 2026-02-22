'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useMessageSubscription } from '@/lib/hooks/use-message-subscription';
import { useChatStore } from '@/lib/store/chat-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  AlertCircle,
  CheckCircle,
  CircleHelp,
  Clock,
  Trash2,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import type { QueuedMessage } from '@/types/message-subscription';

export function MessageQueueViewer() {
  const { t } = useTranslation();
  const { setActiveConversation, setAppMode } = useChatStore();
  const {
    status,
    loading,
    error,
    getFailedMessages,
    getPendingMessages,
    getCompletedMessages,
    reprocessMessage,
    deleteMessage,
    cleanupQueue,
  } = useMessageSubscription();

  const [failedMessages, setFailedMessages] = useState<QueuedMessage[]>([]);
  const [pendingMessages, setPendingMessages] = useState<QueuedMessage[]>([]);
  const [completedMessages, setCompletedMessages] = useState<QueuedMessage[]>([]);
  const [activeTab, setActiveTab] = useState('failed');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const reloadQueueMessages = useCallback(async () => {
    const [failed, pending, completed] = await Promise.all([
      getFailedMessages(),
      getPendingMessages(),
      getCompletedMessages(),
    ]);

    // 디버깅: 반환값 타입 확인
    if (!Array.isArray(failed)) {
      console.warn('[MessageQueueViewer] getFailedMessages returned non-array:', failed);
    }
    if (!Array.isArray(pending)) {
      console.warn('[MessageQueueViewer] getPendingMessages returned non-array:', pending);
    }
    if (!Array.isArray(completed)) {
      console.warn('[MessageQueueViewer] getCompletedMessages returned non-array:', completed);
    }

    // 방어적 처리: 배열이 아니면 빈 배열 사용
    setFailedMessages(Array.isArray(failed) ? failed : []);
    setPendingMessages(Array.isArray(pending) ? pending : []);
    setCompletedMessages(Array.isArray(completed) ? completed : []);
  }, [getCompletedMessages, getFailedMessages, getPendingMessages]);

  // 메시지 로드
  useEffect(() => {
    reloadQueueMessages();

    // 10초마다 새로고침
    const interval = setInterval(reloadQueueMessages, 10000);
    return () => clearInterval(interval);
  }, [reloadQueueMessages]);

  // 메시지 재처리
  const handleReprocess = async (hash: string) => {
    try {
      setActionLoading(hash);
      await reprocessMessage(hash);
      await reloadQueueMessages();
    } catch (err) {
      console.error('Failed to reprocess message:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // 메시지 삭제
  const handleDelete = async (hash: string) => {
    try {
      setActionLoading(hash);
      await deleteMessage(hash);
      await reloadQueueMessages();
    } catch (err) {
      console.error('Failed to delete message:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // 큐 정리
  const handleCleanup = async () => {
    try {
      setActionLoading('cleanup');
      const result = await cleanupQueue();
      console.log('Cleanup result:', result);
      await reloadQueueMessages();
    } catch (err) {
      console.error('Failed to cleanup queue:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // 대화 보기
  const handleConversationView = async (conversationId: string) => {
    try {
      // 1. Chat 모드로 전환
      setAppMode('chat');

      // 2. 해당 대화로 전환
      await setActiveConversation(conversationId);

      // 3. 설정 다이얼로그는 자동으로 닫힘 (SettingsDialog의 onOpenChange 처리)
    } catch (err) {
      console.error('Failed to switch conversation:', err);
    }
  };

  // 시간 포맷팅
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  // 메시지 타입 배지 색상
  const getTypeBadgeVariant = (type: string) => {
    switch (type) {
      case 'github_webhook':
        return 'default';
      case 'community_post':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <div className="space-y-6">
      {/* 큐 상태 요약 */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              {t('messageSubscription.queue.status.pending')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{status?.pending || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
              {t('messageSubscription.queue.status.processing')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{status?.processing || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              {t('messageSubscription.queue.status.completed')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{status?.completed || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              {t('messageSubscription.queue.status.failed')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{status?.failed || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* 에러 표시 */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 메시지 목록 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle>{t('messageSubscription.queueViewer.title')}</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setActiveTab('guide')}
                  aria-label={t('messageSubscription.help.queue.buttonAria')}
                >
                  <CircleHelp className="h-4 w-4" />
                </Button>
              </div>
              <CardDescription>{t('messageSubscription.queueViewer.description')}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setActiveTab('guide')}>
                <CircleHelp className="h-4 w-4 mr-2" />
                {t('messageSubscription.queueViewer.guide.button')}
              </Button>
              <Button
                variant="outline"
                onClick={handleCleanup}
                disabled={loading || actionLoading === 'cleanup'}
              >
                {actionLoading === 'cleanup' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                {t('messageSubscription.queue.actions.cleanup')}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="failed">
                {t('messageSubscription.queueViewer.tabs.failed')} ({failedMessages.length})
              </TabsTrigger>
              <TabsTrigger value="pending">
                {t('messageSubscription.queueViewer.tabs.pending')} ({status?.pending || 0})
              </TabsTrigger>
              <TabsTrigger value="completed">
                {t('messageSubscription.queueViewer.tabs.completed')} ({status?.completed || 0})
              </TabsTrigger>
              <TabsTrigger value="guide">
                {t('messageSubscription.queueViewer.tabs.guide')}
              </TabsTrigger>
            </TabsList>

            {/* 실패한 메시지 */}
            <TabsContent value="failed">
              {failedMessages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {t('messageSubscription.queueViewer.empty')}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('messageSubscription.queueViewer.columns.title')}</TableHead>
                      <TableHead>{t('messageSubscription.queueViewer.columns.type')}</TableHead>
                      <TableHead>{t('messageSubscription.queueViewer.columns.time')}</TableHead>
                      <TableHead>{t('messageSubscription.queueViewer.columns.error')}</TableHead>
                      <TableHead className="text-right">
                        {t('messageSubscription.queueViewer.columns.actions')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {failedMessages.map((msg) => (
                      <TableRow key={msg.hash}>
                        <TableCell className="font-medium">{msg.title}</TableCell>
                        <TableCell>
                          <Badge variant={getTypeBadgeVariant(msg.type)}>{msg.type}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatTime(msg.queuedAt)}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-sm text-red-600">
                          {msg.error}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReprocess(msg.hash)}
                              disabled={loading || actionLoading === msg.hash}
                            >
                              {actionLoading === msg.hash ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3 w-3" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-500 hover:text-red-600 hover:bg-red-50"
                              onClick={() => handleDelete(msg.hash)}
                              disabled={loading || actionLoading === msg.hash}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            {/* 대기 중 메시지 */}
            <TabsContent value="pending">
              {pendingMessages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {t('messageSubscription.queueViewer.empty')}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('messageSubscription.queueViewer.columns.title')}</TableHead>
                      <TableHead>{t('messageSubscription.queueViewer.columns.type')}</TableHead>
                      <TableHead>{t('messageSubscription.queueViewer.columns.time')}</TableHead>
                      <TableHead className="text-right">
                        {t('messageSubscription.queueViewer.columns.actions')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingMessages.map((msg) => (
                      <TableRow key={msg.hash}>
                        <TableCell className="font-medium">{msg.title}</TableCell>
                        <TableCell>
                          <Badge variant={getTypeBadgeVariant(msg.type)}>{msg.type}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatTime(msg.queuedAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => handleDelete(msg.hash)}
                            disabled={loading || actionLoading === msg.hash}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            {/* 완료된 메시지 */}
            <TabsContent value="completed">
              {completedMessages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {t('messageSubscription.queueViewer.empty')}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('messageSubscription.queueViewer.columns.title')}</TableHead>
                      <TableHead>{t('messageSubscription.queueViewer.columns.type')}</TableHead>
                      <TableHead>{t('messageSubscription.queueViewer.columns.time')}</TableHead>
                      <TableHead>
                        {t('messageSubscription.queueViewer.columns.conversation')}
                      </TableHead>
                      <TableHead className="text-right">
                        {t('messageSubscription.queueViewer.columns.actions')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completedMessages.map((msg) => (
                      <TableRow key={msg.hash}>
                        <TableCell className="font-medium">{msg.title}</TableCell>
                        <TableCell>
                          <Badge variant={getTypeBadgeVariant(msg.type)}>{msg.type}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatTime(msg.processedAt || msg.queuedAt)}
                        </TableCell>
                        <TableCell>
                          {msg.conversationId && (
                            <Badge
                              variant="outline"
                              className="cursor-pointer hover:bg-accent"
                              onClick={() => handleConversationView(msg.conversationId!)}
                            >
                              {t('messageSubscription.queueViewer.actions.viewConversation')}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => handleDelete(msg.hash)}
                            disabled={loading || actionLoading === msg.hash}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="guide">
              <div className="rounded-lg border p-5 space-y-4">
                <div>
                  <h3 className="font-semibold mb-1">
                    {t('messageSubscription.help.queue.whatItDoesTitle')}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t('messageSubscription.help.queue.whatItDoesBody')}
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold mb-1">
                    {t('messageSubscription.queueViewer.guide.purposeTitle')}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t('messageSubscription.queueViewer.guide.purposeBody')}
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold mb-1">
                    {t('messageSubscription.help.queue.howToUseTitle')}
                  </h3>
                  <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground">
                    <li>{t('messageSubscription.help.queue.steps.step1')}</li>
                    <li>{t('messageSubscription.help.queue.steps.step2')}</li>
                    <li>{t('messageSubscription.help.queue.steps.step3')}</li>
                    <li>{t('messageSubscription.help.queue.steps.step4')}</li>
                  </ol>
                </div>

                <div>
                  <h3 className="font-semibold mb-1">
                    {t('messageSubscription.queueViewer.guide.integrationTitle')}
                  </h3>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                    <li>
                      {t('messageSubscription.queueViewer.guide.integrationItems.connection')}
                    </li>
                    <li>
                      {t('messageSubscription.queueViewer.guide.integrationItems.autoProcess')}
                    </li>
                    <li>{t('messageSubscription.queueViewer.guide.integrationItems.recovery')}</li>
                    <li>
                      {t('messageSubscription.queueViewer.guide.integrationItems.monitoring')}
                    </li>
                  </ul>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
