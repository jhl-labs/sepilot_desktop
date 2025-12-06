'use client';

import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { BetaConfig } from '@/types';

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
        <h2 className="text-2xl font-bold">Beta 기능</h2>
        <p className="text-sm text-muted-foreground mt-1">
          개발 중인 실험적 기능들을 활성화합니다.
        </p>
      </div>

      {/* Warning Alert */}
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>주의:</strong> Beta 기능은 아직 개발 진행 중이며 완성되지 않았습니다. 버그가 많을
          수 있으므로 프로덕션 환경에서는 사용을 권장하지 않습니다.
        </AlertDescription>
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
              Presentation 모드 활성화
            </Label>
            <p className="text-sm text-muted-foreground">
              Presentation 모드를 활성화하면 Chat, Editor, Browser 사이드바에서
              &quot;Presentation&quot; 항목이 표시됩니다.
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-2">
              ⚠️ 이 기능은 현재 개발 중이며 완전하지 않습니다.
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
          {isSaving ? '저장 중...' : '저장'}
        </Button>
      </div>
    </div>
  );
}
