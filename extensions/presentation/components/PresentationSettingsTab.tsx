'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SettingsSectionHeader } from '@/components/settings/SettingsSectionHeader';
import { Presentation, Save, RotateCcw } from 'lucide-react';

interface PresentationSettingsTabProps {
  onSave: () => void;
  isSaving: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
}

interface PresentationConfig {
  webSearchEnabled: boolean;
  ragEnabled: boolean;
  defaultSlideCount: number;
  defaultLanguage: 'ko' | 'en' | 'ja' | 'zh';
}

const DEFAULT_CONFIG: PresentationConfig = {
  webSearchEnabled: false,
  ragEnabled: false,
  defaultSlideCount: 8,
  defaultLanguage: 'ko',
};

export function PresentationSettingsTab({ message }: PresentationSettingsTabProps) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<PresentationConfig>(DEFAULT_CONFIG);
  const [hasChanges, setHasChanges] = useState(false);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const saved = localStorage.getItem('sepilot_presentation_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        setConfig({ ...DEFAULT_CONFIG, ...parsed });
      }
    } catch (error) {
      console.error('[PresentationSettingsTab] Failed to load settings:', error);
    }
  };

  const handleSave = async () => {
    try {
      localStorage.setItem('sepilot_presentation_config', JSON.stringify(config));
      setHasChanges(false);

      // Dispatch custom event for other components
      window.dispatchEvent(
        new CustomEvent('sepilot:presentation-config-updated', {
          detail: config,
        })
      );
    } catch (error) {
      console.error('[PresentationSettingsTab] Failed to save settings:', error);
    }
  };

  const handleReset = () => {
    if (window.confirm(t('settings.presentation.resetConfirm'))) {
      setConfig(DEFAULT_CONFIG);
      setHasChanges(true);
    }
  };

  const updateConfig = (updates: Partial<PresentationConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
    setHasChanges(true);
  };

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        title={t('settings.presentation.title')}
        description={t('settings.presentation.description')}
        icon={Presentation}
      />

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

      {/* Web Search */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="web-search-enabled" className="text-base font-medium">
              {t('settings.presentation.webSearchEnabled.label')}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t('settings.presentation.webSearchEnabled.description')}
            </p>
          </div>
          <Switch
            id="web-search-enabled"
            checked={config.webSearchEnabled}
            onCheckedChange={(checked) => updateConfig({ webSearchEnabled: checked })}
          />
        </div>
      </div>

      {/* RAG */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="rag-enabled" className="text-base font-medium">
              {t('settings.presentation.ragEnabled.label')}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t('settings.presentation.ragEnabled.description')}
            </p>
          </div>
          <Switch
            id="rag-enabled"
            checked={config.ragEnabled}
            onCheckedChange={(checked) => updateConfig({ ragEnabled: checked })}
          />
        </div>
      </div>

      {/* Default Slide Count */}
      <div className="space-y-2">
        <Label htmlFor="default-slide-count" className="text-base font-medium">
          {t('settings.presentation.defaultSlideCount.label')}
        </Label>
        <p className="text-sm text-muted-foreground mb-2">
          {t('settings.presentation.defaultSlideCount.description')}
        </p>
        <Input
          id="default-slide-count"
          type="number"
          min="1"
          max="50"
          value={config.defaultSlideCount}
          onChange={(e) => updateConfig({ defaultSlideCount: parseInt(e.target.value) || 8 })}
          className="max-w-xs"
        />
      </div>

      {/* Default Language */}
      <div className="space-y-2">
        <Label htmlFor="default-language" className="text-base font-medium">
          {t('settings.presentation.defaultLanguage.label')}
        </Label>
        <p className="text-sm text-muted-foreground mb-2">
          {t('settings.presentation.defaultLanguage.description')}
        </p>
        <Select
          value={config.defaultLanguage}
          onValueChange={(value: 'ko' | 'en' | 'ja' | 'zh') =>
            updateConfig({ defaultLanguage: value })
          }
        >
          <SelectTrigger className="max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ko">한국어 (Korean)</SelectItem>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="ja">日本語 (Japanese)</SelectItem>
            <SelectItem value="zh">中文 (Chinese)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between pt-4 border-t">
        <Button variant="outline" onClick={handleReset}>
          <RotateCcw className="w-4 h-4 mr-2" />
          {t('settings.presentation.reset')}
        </Button>
        <Button onClick={handleSave} disabled={!hasChanges}>
          <Save className="w-4 h-4 mr-2" />
          {t('settings.presentation.save')}
        </Button>
      </div>
    </div>
  );
}
