'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMessageSubscription } from '@/lib/hooks/use-message-subscription';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertCircle,
  CheckCircle,
  CircleHelp,
  Loader2,
  RefreshCw,
  Power,
  PowerOff,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { MessageSubscriptionConfig } from '@/types/message-subscription';

const DEFAULT_POLLING_INTERVAL_MS = 60_000;

function normalizePollingIntervalMs(value: number | undefined): number {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return DEFAULT_POLLING_INTERVAL_MS;
  }

  // Backward compatibility for configs accidentally saved in seconds
  if (value < 1000) {
    return Math.round(value * 1000);
  }

  return Math.round(value);
}

function pollingSeconds(ms: number | undefined): number {
  return Math.max(1, Math.round(normalizePollingIntervalMs(ms) / 1000));
}

export function MessageSubscriptionSettings() {
  const { t } = useTranslation();
  const {
    config: initialConfig,
    status,
    isConnected,
    lastPolled,
    loading,
    error,
    saveConfig,
    refresh,
  } = useMessageSubscription();

  // 로컬 상태 (폼 데이터)
  const [formData, setFormData] = useState<MessageSubscriptionConfig>({
    enabled: false,
    connectionType: 'polling',
    pollingUrl: '',
    pollingInterval: DEFAULT_POLLING_INTERVAL_MS,
    authToken: '',
    customHeaders: {},
    maxQueueSize: 1000,
    retentionDays: 7,
    autoProcess: true,
    retryAttempts: 3,
    retryDelay: 5000,
    useAIProcessing: false,
    aiPromptTemplate: '',
    thinkingMode: 'instant',
    showNotification: true,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  // 초기 설정 로드
  useEffect(() => {
    if (initialConfig) {
      setFormData({
        ...initialConfig,
        pollingInterval: normalizePollingIntervalMs(initialConfig.pollingInterval),
      });
    }
  }, [initialConfig]);

  // 폼 필드 변경 핸들러
  const handleChange = (field: keyof MessageSubscriptionConfig, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // 설정 저장
  const handleSave = async () => {
    try {
      setIsSaving(true);
      setSuccessMessage(null);
      const { notificationType: _legacyNotificationType, ...formConfig } = formData;
      const normalizedConfig: MessageSubscriptionConfig = {
        ...formConfig,
        pollingInterval: normalizePollingIntervalMs(formConfig.pollingInterval),
      };
      await saveConfig(normalizedConfig);
      setFormData(normalizedConfig);
      setSuccessMessage(t('messageSubscription.saveSuccess'));

      // 3초 후 메시지 제거
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Failed to save config:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // 구독 토글
  const handleToggleSubscription = async () => {
    try {
      const nextEnabled = !formData.enabled;
      const { notificationType: _legacyNotificationType, ...formConfig } = formData;
      const nextConfig: MessageSubscriptionConfig = {
        ...formConfig,
        enabled: nextEnabled,
        pollingInterval: normalizePollingIntervalMs(formConfig.pollingInterval),
      };

      await saveConfig(nextConfig);
      setFormData(nextConfig);
    } catch (err) {
      console.error('Failed to toggle subscription:', err);
    }
  };

  // 수동 새로고침
  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      const result = await refresh();
      if (!result.success) {
        throw new Error(result.error || 'Failed to refresh');
      }
      setSuccessMessage(
        t('messageSubscription.connection.refreshSuccess', { count: result.count })
      );

      // 3초 후 메시지 제거
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Failed to refresh:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // 시간 포맷팅
  const formatTime = (timestamp?: number) => {
    if (!timestamp) {
      return t('messageSubscription.connection.disconnected');
    }
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold">{t('messageSubscription.title')}</h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsGuideOpen(true)}
              aria-label={t('messageSubscription.guide.openButton')}
            >
              <CircleHelp className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-muted-foreground">{t('messageSubscription.description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={formData.enabled ? 'default' : 'secondary'}>
            {formData.enabled
              ? t('messageSubscription.enabled')
              : t('messageSubscription.disabled')}
          </Badge>
          <Button
            variant={formData.enabled ? 'destructive' : 'default'}
            onClick={handleToggleSubscription}
            disabled={loading}
          >
            {formData.enabled ? (
              <>
                <PowerOff className="h-4 w-4 mr-2" />
                {t('messageSubscription.stop')}
              </>
            ) : (
              <>
                <Power className="h-4 w-4 mr-2" />
                {t('messageSubscription.start')}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 성공 메시지 */}
      {successMessage && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-600">{successMessage}</AlertDescription>
        </Alert>
      )}

      {/* 에러 메시지 */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* 큐 상태 요약 */}
      {status && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="text-xs">
                {t('messageSubscription.queue.status.pending')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{status.pending}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="text-xs">
                {t('messageSubscription.queue.status.processing')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{status.processing}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="text-xs">
                {t('messageSubscription.queue.status.completed')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{status.completed}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="text-xs">
                {t('messageSubscription.queue.status.failed')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{status.failed}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 설정 탭 */}
      <Tabs defaultValue="connection">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="connection">{t('messageSubscription.tabs.connection')}</TabsTrigger>
          <TabsTrigger value="queue">{t('messageSubscription.tabs.queue')}</TabsTrigger>
          <TabsTrigger value="ai">{t('messageSubscription.tabs.ai')}</TabsTrigger>
          <TabsTrigger value="notification">
            {t('messageSubscription.tabs.notification')}
          </TabsTrigger>
        </TabsList>

        {/* 연결 설정 */}
        <TabsContent value="connection">
          <Card>
            <CardHeader>
              <CardTitle>{t('messageSubscription.tabs.connection')}</CardTitle>
              <CardDescription>
                {t('messageSubscription.connection.status')}:{' '}
                {isConnected ? (
                  <span className="text-green-600">
                    {t('messageSubscription.connection.connected')}
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {t('messageSubscription.connection.disconnected')}
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="connectionType">{t('messageSubscription.connection.type')}</Label>
                <Select
                  value={formData.connectionType}
                  onValueChange={(value) =>
                    handleChange('connectionType', value as 'polling' | 'websocket' | 'nats')
                  }
                >
                  <SelectTrigger id="connectionType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="polling">
                      {t('messageSubscription.connection.polling')}
                    </SelectItem>
                    <SelectItem value="nats">{t('messageSubscription.connection.nats')}</SelectItem>
                    <SelectItem value="websocket" disabled>
                      {t('messageSubscription.connection.websocket')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.connectionType === 'nats' ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="natsUrl">{t('messageSubscription.connection.natsUrl')} *</Label>
                    <Input
                      id="natsUrl"
                      type="text"
                      value={formData.natsUrl || ''}
                      onChange={(e) => handleChange('natsUrl', e.target.value)}
                      placeholder={t('messageSubscription.connection.natsUrlPlaceholder')}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="natsConsumerId">
                        {t('messageSubscription.connection.natsConsumerId')}
                      </Label>
                      <Input
                        id="natsConsumerId"
                        type="text"
                        value={formData.natsConsumerId || ''}
                        onChange={(e) => handleChange('natsConsumerId', e.target.value)}
                        placeholder={t('messageSubscription.connection.natsConsumerIdPlaceholder')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="natsConsumerSecret">
                        {t('messageSubscription.connection.natsConsumerSecret')}
                      </Label>
                      <Input
                        id="natsConsumerSecret"
                        type="password"
                        value={formData.natsConsumerSecret || ''}
                        onChange={(e) => handleChange('natsConsumerSecret', e.target.value)}
                        placeholder={t(
                          'messageSubscription.connection.natsConsumerSecretPlaceholder'
                        )}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="natsStreamName">
                        {t('messageSubscription.connection.natsStreamName')}
                      </Label>
                      <Input
                        id="natsStreamName"
                        type="text"
                        value={formData.natsStreamName || 'WEBHOOKS'}
                        onChange={(e) => handleChange('natsStreamName', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="natsSubject">
                        {t('messageSubscription.connection.natsSubject')}
                      </Label>
                      <Input
                        id="natsSubject"
                        type="text"
                        value={formData.natsSubject || 'webhooks.>'}
                        onChange={(e) => handleChange('natsSubject', e.target.value)}
                        placeholder={t('messageSubscription.connection.natsSubjectPlaceholder')}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="natsBatchSize">
                      {t('messageSubscription.connection.natsBatchSize')}
                    </Label>
                    <Input
                      id="natsBatchSize"
                      type="number"
                      min={1}
                      max={100}
                      value={formData.natsBatchSize || 10}
                      onChange={(e) => handleChange('natsBatchSize', Number(e.target.value))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pollingInterval">
                      {t('messageSubscription.connection.pollingInterval')}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="pollingInterval"
                        type="number"
                        min={10}
                        max={3600}
                        value={pollingSeconds(formData.pollingInterval)}
                        onChange={(e) => {
                          const seconds = Number(e.target.value);
                          handleChange(
                            'pollingInterval',
                            normalizePollingIntervalMs(seconds * 1000)
                          );
                        }}
                      />
                      <Button
                        variant="outline"
                        onClick={handleRefresh}
                        disabled={loading || isRefreshing || !formData.enabled}
                      >
                        {isRefreshing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="pollingUrl">{t('messageSubscription.connection.url')} *</Label>
                    <Input
                      id="pollingUrl"
                      type="url"
                      value={formData.pollingUrl || ''}
                      onChange={(e) => handleChange('pollingUrl', e.target.value)}
                      placeholder={t('messageSubscription.connection.urlPlaceholder')}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pollingInterval">
                      {t('messageSubscription.connection.pollingInterval')}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="pollingInterval"
                        type="number"
                        min={10}
                        max={3600}
                        value={pollingSeconds(formData.pollingInterval)}
                        onChange={(e) => {
                          const seconds = Number(e.target.value);
                          handleChange(
                            'pollingInterval',
                            normalizePollingIntervalMs(seconds * 1000)
                          );
                        }}
                      />
                      <Button
                        variant="outline"
                        onClick={handleRefresh}
                        disabled={loading || isRefreshing || !formData.enabled}
                      >
                        {isRefreshing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="authToken">
                      {t('messageSubscription.connection.authToken')}
                    </Label>
                    <Input
                      id="authToken"
                      type="password"
                      value={formData.authToken || ''}
                      onChange={(e) => handleChange('authToken', e.target.value)}
                      placeholder={t('messageSubscription.connection.authTokenPlaceholder')}
                    />
                  </div>
                </>
              )}

              {lastPolled && (
                <div className="text-sm text-muted-foreground">
                  {t('messageSubscription.connection.lastPolled')}: {formatTime(lastPolled)}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 큐 설정 */}
        <TabsContent value="queue">
          <Card>
            <CardHeader>
              <CardTitle>{t('messageSubscription.tabs.queue')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="maxQueueSize">{t('messageSubscription.queue.maxQueueSize')}</Label>
                <Input
                  id="maxQueueSize"
                  type="number"
                  min={1}
                  max={10000}
                  value={formData.maxQueueSize || 1000}
                  onChange={(e) => handleChange('maxQueueSize', Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  {t('messageSubscription.queue.maxQueueSizeDesc')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="retentionDays">
                  {t('messageSubscription.queue.retentionDays')}
                </Label>
                <Input
                  id="retentionDays"
                  type="number"
                  min={1}
                  max={365}
                  value={formData.retentionDays || 7}
                  onChange={(e) => handleChange('retentionDays', Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  {t('messageSubscription.queue.retentionDaysDesc')}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="autoProcess">{t('messageSubscription.queue.autoProcess')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t('messageSubscription.queue.autoProcessDesc')}
                  </p>
                </div>
                <Switch
                  id="autoProcess"
                  checked={formData.autoProcess}
                  onCheckedChange={(checked) => handleChange('autoProcess', checked)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="retryAttempts">
                  {t('messageSubscription.queue.retryAttempts')}
                </Label>
                <Input
                  id="retryAttempts"
                  type="number"
                  min={0}
                  max={10}
                  value={formData.retryAttempts || 3}
                  onChange={(e) => handleChange('retryAttempts', Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  {t('messageSubscription.queue.retryAttemptsDesc')}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI 설정 */}
        <TabsContent value="ai">
          <Card>
            <CardHeader>
              <CardTitle>{t('messageSubscription.tabs.ai')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="useAIProcessing">
                    {t('messageSubscription.ai.useAIProcessing')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t('messageSubscription.ai.useAIProcessingDesc')}
                  </p>
                </div>
                <Switch
                  id="useAIProcessing"
                  checked={formData.useAIProcessing}
                  onCheckedChange={(checked) => handleChange('useAIProcessing', checked)}
                />
              </div>

              {formData.useAIProcessing && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="thinkingMode">{t('messageSubscription.ai.thinkingMode')}</Label>
                    <Select
                      value={formData.thinkingMode}
                      onValueChange={(value) =>
                        handleChange('thinkingMode', value as 'instant' | 'sequential')
                      }
                    >
                      <SelectTrigger id="thinkingMode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="instant">
                          {t('messageSubscription.ai.instant')}
                        </SelectItem>
                        <SelectItem value="sequential">
                          {t('messageSubscription.ai.sequential')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="aiPromptTemplate">
                      {t('messageSubscription.ai.promptTemplate')}
                    </Label>
                    <Textarea
                      id="aiPromptTemplate"
                      rows={5}
                      value={formData.aiPromptTemplate || ''}
                      onChange={(e) => handleChange('aiPromptTemplate', e.target.value)}
                      placeholder={t('messageSubscription.ai.promptTemplatePlaceholder')}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('messageSubscription.ai.promptTemplateDesc')}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 알림 설정 */}
        <TabsContent value="notification">
          <Card>
            <CardHeader>
              <CardTitle>{t('messageSubscription.tabs.notification')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="showNotification">
                    {t('messageSubscription.notification.show')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t('messageSubscription.notification.showDesc')}
                  </p>
                </div>
                <Switch
                  id="showNotification"
                  checked={formData.showNotification}
                  onCheckedChange={(checked) => handleChange('showNotification', checked)}
                />
              </div>

              {formData.showNotification && (
                <div className="space-y-2">
                  <Label>{t('messageSubscription.notification.type')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'messageSubscription.notification.typeGlobalDesc',
                      '알림 타입은 전역 설정 > 알림 설정에서 관리됩니다.'
                    )}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 저장 버튼 */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving || loading}>
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t('common.saving')}
            </>
          ) : (
            t('common.save')
          )}
        </Button>
      </div>

      <Dialog open={isGuideOpen} onOpenChange={setIsGuideOpen}>
        <DialogContent
          className="max-w-2xl max-h-[80vh] overflow-y-auto"
          onClose={() => setIsGuideOpen(false)}
        >
          <DialogHeader>
            <DialogTitle>{t('messageSubscription.guide.title')}</DialogTitle>
            <DialogDescription>{t('messageSubscription.guide.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 text-sm">
            <div>
              <h3 className="font-semibold mb-1">{t('messageSubscription.guide.purposeTitle')}</h3>
              <p className="text-muted-foreground">{t('messageSubscription.guide.purposeBody')}</p>
            </div>

            <div>
              <h3 className="font-semibold mb-1">{t('messageSubscription.guide.usageTitle')}</h3>
              <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                <li>{t('messageSubscription.guide.usageSteps.step1')}</li>
                <li>{t('messageSubscription.guide.usageSteps.step2')}</li>
                <li>{t('messageSubscription.guide.usageSteps.step3')}</li>
                <li>{t('messageSubscription.guide.usageSteps.step4')}</li>
              </ol>
            </div>

            <div>
              <h3 className="font-semibold mb-1">
                {t('messageSubscription.guide.integrationTitle')}
              </h3>
              <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                <li>{t('messageSubscription.guide.integrationSteps.step1')}</li>
                <li>{t('messageSubscription.guide.integrationSteps.step2')}</li>
                <li>{t('messageSubscription.guide.integrationSteps.step3')}</li>
                <li>{t('messageSubscription.guide.integrationSteps.step4')}</li>
              </ol>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
