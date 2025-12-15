'use client';

import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { BetaConfig } from '@/types';

import { useTranslation } from 'react-i18next';

interface BetaSettingsTabProps {
  config: BetaConfig;
  setConfig: (config: BetaConfig) => void;
  onSave: () => Promise<void>;
  isSaving: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
}

export function BetaSettingsTab({
  config,
  setConfig,
  onSave,
  isSaving,
  message,
}: BetaSettingsTabProps) {
  const { t } = useTranslation();
  const [localConfig, setLocalConfig] = useState<BetaConfig>(config);

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  const handleChange = (field: keyof BetaConfig, value: boolean) => {
    const newConfig = { ...localConfig, [field]: value };
    setLocalConfig(newConfig);
    setConfig(newConfig);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t('settings.beta.title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('settings.beta.description')}</p>
      </div>

      {/* Warning Alert */}
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{t('settings.beta.warning')}</AlertDescription>
      </Alert>

      {/* Status Message */}
      {message && (
        <div
          className={`p-3 rounded-md text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100'
              : 'bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Presentation Mode */}
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
          <Switch
            id="presentation-mode"
            checked={localConfig.enablePresentationMode ?? false}
            onCheckedChange={(checked) => handleChange('enablePresentationMode', checked)}
          />
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button onClick={onSave} disabled={isSaving}>
          {isSaving ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </div>
  );
}
