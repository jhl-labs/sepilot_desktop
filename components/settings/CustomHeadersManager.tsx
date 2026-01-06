/**
 * CustomHeadersManager Component
 *
 * 재사용 가능한 Custom Headers 관리 UI
 * ConnectionManager와 ModelListView에서 사용
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CustomHeadersManagerProps {
  /**
   * 현재 헤더 목록
   */
  headers: Record<string, string> | null;

  /**
   * 헤더 추가 콜백
   */
  onAddHeader: (key: string, value: string) => void;

  /**
   * 헤더 삭제 콜백
   */
  onDeleteHeader: (key: string) => void;

  /**
   * 제목 (optional)
   */
  title?: string;

  /**
   * 추가 CSS 클래스 (optional)
   */
  className?: string;
}

export function CustomHeadersManager({
  headers,
  onAddHeader,
  onDeleteHeader,
  title,
  className = '',
}: CustomHeadersManagerProps) {
  const { t } = useTranslation();
  const [newHeaderKey, setNewHeaderKey] = useState('');
  const [newHeaderValue, setNewHeaderValue] = useState('');

  const handleAddHeader = () => {
    if (!newHeaderKey.trim() || !newHeaderValue.trim()) {
      return;
    }

    onAddHeader(newHeaderKey.trim(), newHeaderValue.trim());

    // Reset inputs
    setNewHeaderKey('');
    setNewHeaderValue('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newHeaderKey.trim() && newHeaderValue.trim()) {
      handleAddHeader();
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Title */}
      {title && <Label>{title}</Label>}
      {!title && <Label>{t('settings.llm.connections.customHeaders')}</Label>}

      {/* Existing Headers List */}
      {headers && Object.keys(headers).length > 0 && (
        <div className="space-y-1">
          {Object.entries(headers).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2 rounded bg-background p-2 text-sm">
              <span className="font-mono flex-1">{key}</span>
              <span className="font-mono text-muted-foreground flex-1">{value}</span>
              <Button variant="ghost" size="sm" onClick={() => onDeleteHeader(key)}>
                {t('common.delete')}
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add New Header Input */}
      <div className="flex gap-2">
        <Input
          value={newHeaderKey}
          onChange={(e) => setNewHeaderKey(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={t('settings.llm.connections.headerKey')}
          className="flex-1"
        />
        <Input
          value={newHeaderValue}
          onChange={(e) => setNewHeaderValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={t('settings.llm.connections.headerValue')}
          className="flex-1"
        />
        <Button
          size="sm"
          onClick={handleAddHeader}
          disabled={!newHeaderKey.trim() || !newHeaderValue.trim()}
        >
          {t('settings.llm.connections.addHeader')}
        </Button>
      </div>
    </div>
  );
}
