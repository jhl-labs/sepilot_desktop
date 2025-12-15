'use client';

import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/components/providers/i18n-provider';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { Loader2, Languages, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import type { SupportedLanguage } from '@/lib/i18n';

import { logger } from '@/lib/utils/logger';
interface GeneralSettingsTabProps {
  onSave?: (language?: string) => void;
  isSaving?: boolean;
  message?: { type: 'success' | 'error'; text: string } | null;
}

export function GeneralSettingsTab({ onSave, isSaving, message }: GeneralSettingsTabProps) {
  const { t } = useTranslation();
  const { language, setLanguage, supportedLanguages } = useLanguage();
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>(language);
  const [isChanging, setIsChanging] = useState(false);

  const handleLanguageChange = async (value: string) => {
    setSelectedLanguage(value as SupportedLanguage);
  };

  const handleSave = async () => {
    if (selectedLanguage === language) {
      onSave?.(selectedLanguage);
      return;
    }

    setIsChanging(true);
    try {
      await setLanguage(selectedLanguage);
      onSave?.(selectedLanguage);
    } catch (error) {
      logger.error('Failed to change language:', error);
    } finally {
      setIsChanging(false);
    }
  };

  const hasChanges = selectedLanguage !== language;

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        title={t('settings.general.title')}
        description={t('settings.general.description')}
      />

      {/* Language Selection */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Languages className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-medium">{t('settings.general.language.title')}</h3>
        </div>

        <div className="space-y-2">
          <Label htmlFor="language-select">{t('settings.general.language.selectLanguage')}</Label>
          <Select value={selectedLanguage} onValueChange={handleLanguageChange}>
            <SelectTrigger id="language-select" className="w-[200px]">
              <SelectValue placeholder={t('settings.general.language.selectLanguage')} />
            </SelectTrigger>
            <SelectContent>
              {supportedLanguages.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  <span className="flex items-center gap-2">
                    <span>{lang.nativeName}</span>
                    {lang.name !== lang.nativeName && (
                      <span className="text-muted-foreground text-sm">({lang.name})</span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {t('settings.general.language.description')}
          </p>
        </div>

        {hasChanges && (
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            <span>{t('settings.general.language.restartRequired')}</span>
          </div>
        )}
      </div>

      {/* Save Button and Message */}
      <div className="flex items-center gap-4 pt-4 border-t">
        <Button onClick={handleSave} disabled={isSaving || isChanging}>
          {(isSaving || isChanging) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
