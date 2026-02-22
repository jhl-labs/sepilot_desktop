'use client';

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { Loader2, Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { logger } from '@/lib/utils/logger';
import { useChatStore } from '@/lib/store/chat-store';
import { useNotification, NotificationType } from '@/lib/hooks/use-notification';

interface NotificationSettingsTabProps {
  onSave?: (notificationType: NotificationType) => boolean | Promise<boolean>;
  isSaving?: boolean;
  message?: { type: 'success' | 'error'; text: string } | null;
}

function isNotificationType(value: string): value is NotificationType {
  return value === 'os' || value === 'application';
}

export function NotificationSettingsTab({
  onSave,
  isSaving,
  message,
}: NotificationSettingsTabProps) {
  const { t } = useTranslation();

  // Notification test state
  const [isTestingNotification, setIsTestingNotification] = useState(false);
  const [notificationTestResult, setNotificationTestResult] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const { conversations, activeConversationId } = useChatStore();
  const { notificationType, showNotification } = useNotification();
  const [draftNotificationType, setDraftNotificationType] = useState<NotificationType>('os');

  useEffect(() => {
    setDraftNotificationType(notificationType);
  }, [notificationType]);

  const handleTestNotification = async () => {
    setIsTestingNotification(true);
    setNotificationTestResult(null);

    try {
      const testConversationId =
        activeConversationId || conversations[0]?.id || 'test-conversation';
      const testConversation = conversations.find((c: any) => c.id === testConversationId);
      const testTitle = testConversation?.title || '테스트 대화';

      const result = await showNotification({
        conversationId: testConversationId,
        title: testTitle,
        body: '알림 테스트가 성공적으로 완료되었습니다!',
        type: draftNotificationType,
        // Add rich content for Application Type
        ...(draftNotificationType === 'application' && {
          html: `
            <div style="font-family: sans-serif;">
              <span style="color: #10b981; font-weight: 700; font-size: 0.95em;">✓ Connected</span>
              <div style="margin-top: 4px; color: inherit;">
                Your <strong>Deep Learning Agent</strong> has successfully analyzed the repository.
              </div>
            </div>
          `,
          imageUrl:
            'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=800&auto=format&fit=crop&q=80',
        }),
      });

      if (result.success) {
        setNotificationTestResult({
          type: 'success',
          message: '테스트 알림이 표시되었습니다.',
        });
      } else {
        setNotificationTestResult({
          type: 'error',
          message: `알림 표시 실패: ${result.error || '알 수 없는 오류'}`,
        });
      }
    } catch (error) {
      logger.error('[NotificationSettingsTab] Failed to show test notification:', error);
      setNotificationTestResult({
        type: 'error',
        message: `알림 표시 실패: ${error instanceof Error ? error.message : String(error) || '알 수 없는 오류'}`,
      });
    } finally {
      setIsTestingNotification(false);
    }
  };

  const handleSave = async () => {
    const saved = await onSave?.(draftNotificationType);
    if (saved === false) {
      setDraftNotificationType(notificationType);
    }
  };

  return (
    <div className="space-y-6" data-testid="notification-settings">
      <SettingsSectionHeader
        icon={Bell}
        title={t('settings.notification.title', '알림 설정')}
        description={t('settings.notification.description', '알림 표시 방식과 테스트를 관리합니다')}
      />

      <div className="space-y-6">
        <div className="space-y-3">
          <Label>{t('settings.notification.type.label', '알림 유형')}</Label>
          <RadioGroup
            value={draftNotificationType}
            onValueChange={(value) => {
              if (isNotificationType(value)) {
                setDraftNotificationType(value);
              }
            }}
            className="flex flex-col space-y-1"
          >
            <div className="flex items-center space-x-3 space-y-0">
              <RadioGroupItem value="os" id="notification-os" />
              <Label htmlFor="notification-os" className="font-normal">
                {t('settings.notification.type.os', '시스템 기본 알림 (OS)')}
              </Label>
            </div>
            <div className="flex items-center space-x-3 space-y-0">
              <RadioGroupItem value="application" id="notification-app" />
              <Label htmlFor="notification-app" className="font-normal">
                {t('settings.notification.type.app', '애플리케이션 자체 알림 (In-App)')}
              </Label>
            </div>
          </RadioGroup>
          <p className="text-sm text-muted-foreground">
            {draftNotificationType === 'os'
              ? t(
                  'settings.notification.type.osDesc',
                  '운영체제의 알림 센터를 사용합니다. 앱이 최소화되어 있어도 알림을 받을 수 있습니다.'
                )
              : t(
                  'settings.notification.type.appDesc',
                  '앱 내에서 디자인된 알림을 표시합니다. 앱이 화면에 보일 때만 유용합니다.'
                )}
          </p>
        </div>

        <div className="p-4 border rounded-lg bg-muted/20 space-y-3">
          <div className="flex items-center justify-between">
            <Label>{t('settings.notification.test.title', '알림 테스트')}</Label>
          </div>
          <p className="text-sm text-muted-foreground">
            {t(
              'settings.notification.test.description',
              '선택한 알림 유형으로 테스트 알림을 발송합니다.'
            )}
          </p>

          <Button
            onClick={handleTestNotification}
            disabled={isTestingNotification}
            variant="outline"
            className="w-full"
          >
            {isTestingNotification && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Bell className="mr-2 h-4 w-4" />
            {t('settings.notification.test.button', '테스트 알림 보내기')}
          </Button>

          {notificationTestResult && (
            <div
              className={`p-3 rounded-lg text-sm ${
                notificationTestResult.type === 'success'
                  ? 'bg-green-500/10 text-green-600 border border-green-500/20'
                  : 'bg-red-500/10 text-red-600 border border-red-500/20'
              }`}
            >
              {notificationTestResult.message}
            </div>
          )}
        </div>
      </div>

      {/* Save Button and Message */}
      <div className="flex items-center gap-4 pt-4 border-t">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('common.save')}
        </Button>

        {message && (
          <p
            className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
