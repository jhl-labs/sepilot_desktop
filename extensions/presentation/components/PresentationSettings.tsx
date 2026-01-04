'use client';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useTranslation } from 'react-i18next';

/**
 * Presentation Extension - Settings Component
 *
 * Beta Settings 탭에 표시될 설정 UI
 */
export function PresentationSettings({
  enabled,
  onEnabledChange,
}: {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="presentation-mode" className="text-base font-medium">
            {t('settings.beta.presentationMode.title')}
          </Label>
          <p className="text-sm text-muted-foreground">
            {t('settings.beta.presentationMode.description')}
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-500 mt-2">
            {t('settings.beta.presentationMode.warning')}
          </p>
        </div>
        <Switch id="presentation-mode" checked={enabled} onCheckedChange={onEnabledChange} />
      </div>
    </div>
  );
}
