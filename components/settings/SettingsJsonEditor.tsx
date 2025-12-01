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

export function SettingsJsonEditor({ config, onSave }: SettingsJsonEditorProps) {
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
        throw new Error('LLM 설정이 필요합니다.');
      }

      // Save config
      await onSave(parsedConfig);
      setSuccess(true);

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      if (err instanceof SyntaxError) {
        setError(`JSON 구문 오류: ${err.message}`);
      } else {
        setError(err.message || '설정 저장에 실패했습니다.');
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
    } catch (err: any) {
      setError(`JSON 구문 오류: ${err.message}`);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b">
        <div className="text-sm text-muted-foreground">
          settings.json 편집 - VSCode와 동일한 방식으로 전체 설정을 관리합니다.
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleFormat}>
            Format Document
          </Button>
          <Button onClick={handleSave} disabled={isSaving} size="sm">
            {isSaving ? '저장 중...' : '저장'}
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
          <AlertDescription>설정이 성공적으로 저장되었습니다.</AlertDescription>
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
          placeholder="설정을 JSON 형식으로 입력하세요..."
        />
      </div>

      {/* Footer Info */}
      <div className="mt-4 pt-4 border-t text-xs text-muted-foreground space-y-1">
        <div>💡 Tip: Ctrl+Space를 눌러 자동 완성 사용 (향후 지원 예정)</div>
        <div>⚠️ 주의: 잘못된 설정은 애플리케이션 오류를 발생시킬 수 있습니다.</div>
      </div>
    </div>
  );
}
