'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Check } from 'lucide-react';
import { AppConfig } from '@/types';

interface SettingsJsonEditorProps {
  config: AppConfig;
  onSave: (config: AppConfig) => Promise<void>;
}

import { useTranslation } from 'react-i18next';

export function SettingsJsonEditor({ config, onSave }: SettingsJsonEditorProps) {
  const { t } = useTranslation();
  const [jsonText, setJsonText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Initialize JSON text from config
  useEffect(() => {
    try {
      setJsonText(JSON.stringify(config, null, 2));
    } catch {
      setError('Failed to serialize config to JSON');
    }
  }, [config]);

  const handleSave = async () => {
    setError(null);
    setSuccess(false);
    setIsSaving(true);

    try {
      // Parse and validate JSON
      const parsedConfig = JSON.parse(jsonText) as AppConfig;

      // Basic validation
      if (!parsedConfig.llm) {
        throw new Error(t('settings.jsonEditor.llmRequired'));
      }

      // Save config
      await onSave(parsedConfig);
      setSuccess(true);

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError(t('settings.jsonEditor.syntaxError', { error: err instanceof Error ? err.message : String(err) }));
      } else {
<<<<<<< Updated upstream
        setError(
          err instanceof Error ? err.message : String(err) || t('settings.jsonEditor.saveFailed')
        );
=======
        setError(err instanceof Error ? err.message : String(err) || t('settings.jsonEditor.saveFailed'));
>>>>>>> Stashed changes
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonText(JSON.stringify(parsed, null, 2));
      setError(null);
    } catch (err) {
<<<<<<< Updated upstream
      setError(
        t('settings.jsonEditor.syntaxError', {
          error: err instanceof Error ? err.message : String(err),
        })
      );
=======
      setError(t('settings.jsonEditor.syntaxError', { error: err instanceof Error ? err.message : String(err) }));
>>>>>>> Stashed changes
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b">
        <div className="text-sm text-muted-foreground">{t('settings.jsonEditor.description')}</div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleFormat}>
            {t('settings.jsonEditor.format')}
          </Button>
          <Button onClick={handleSave} disabled={isSaving} size="sm">
            {isSaving ? t('settings.jsonEditor.saving') : t('common.save')}
          </Button>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="mb-4 border-green-500 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100">
          <Check className="h-4 w-4" />
          <AlertDescription>{t('settings.jsonEditor.saveSuccess')}</AlertDescription>
        </Alert>
      )}

      {/* JSON Editor */}
      <div className="flex-1 relative">
        <textarea
          value={jsonText}
          onChange={(e) => {
            setJsonText(e.target.value);
            setError(null);
          }}
          className="absolute inset-0 w-full h-full p-4 font-mono text-sm border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring bg-background"
          spellCheck={false}
          placeholder={t('settings.jsonEditor.placeholder')}
        />
      </div>

      {/* Footer Info */}
      <div className="mt-4 pt-4 border-t text-xs text-muted-foreground space-y-1">
        <div>{t('settings.jsonEditor.tip')}</div>
        <div>{t('settings.jsonEditor.warning')}</div>
      </div>
    </div>
  );
}
