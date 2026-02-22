'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ResultHandler } from '@/types/scheduler';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Bell, FileText } from 'lucide-react';

interface ResultHandlersFormProps {
  handlers: ResultHandler[];
  onChange: (handlers: ResultHandler[]) => void;
}

export function ResultHandlersForm({ handlers, onChange }: ResultHandlersFormProps) {
  const { t } = useTranslation();

  const conversationHandler = handlers.find((h) => h.type === 'conversation');
  const notificationHandler = handlers.find((h) => h.type === 'notification');
  const fileHandler = handlers.find((h) => h.type === 'file');

  const updateHandler = (type: ResultHandler['type'], updates: Partial<ResultHandler>) => {
    const newHandlers = handlers.map((h) => {
      if (h.type === type) {
        return { ...h, ...updates } as ResultHandler;
      }
      return h;
    });
    onChange(newHandlers);
  };

  const toggleHandler = (type: ResultHandler['type'], enabled: boolean) => {
    const existingHandler = handlers.find((h) => h.type === type);

    if (existingHandler) {
      updateHandler(type, { enabled });
    } else {
      // Add new handler
      let newHandler: ResultHandler;
      if (type === 'conversation') {
        newHandler = { type: 'conversation', enabled: true };
      } else if (type === 'notification') {
        newHandler = { type: 'notification', enabled: true };
      } else {
        newHandler = {
          type: 'file',
          enabled: true,
          directory: '',
          format: 'md',
        };
      }
      onChange([...handlers, newHandler]);
    }
  };

  return (
    <div className="space-y-4">
      {/* Conversation Handler */}
      <div className="space-y-3 p-4 rounded-lg border">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="handler-conversation" className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              {t('scheduler.createConversation')}
            </Label>
            <p className="text-xs text-muted-foreground">
              실행 결과를 새로운 대화 세션으로 생성합니다
            </p>
          </div>
          <Switch
            id="handler-conversation"
            checked={conversationHandler?.enabled ?? false}
            onCheckedChange={(checked: boolean) => toggleHandler('conversation', checked)}
          />
        </div>
      </div>

      {/* Notification Handler */}
      <div className="space-y-3 p-4 rounded-lg border">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="handler-notification" className="flex items-center gap-2">
              <Bell className="w-4 h-4" />
              {t('scheduler.sendNotification')}
            </Label>
            <p className="text-xs text-muted-foreground">실행 완료 시 데스크톱 알림을 전송합니다</p>
          </div>
          <Switch
            id="handler-notification"
            checked={notificationHandler?.enabled ?? false}
            onCheckedChange={(checked: boolean) => toggleHandler('notification', checked)}
          />
        </div>

        {notificationHandler?.enabled && (
          <div className="space-y-2 pt-2 border-t">
            <Label htmlFor="notification-title" className="text-xs">
              {t('scheduler.notificationTitle')} (선택사항)
            </Label>
            <Input
              id="notification-title"
              placeholder="작업 완료"
              value={
                notificationHandler.type === 'notification' ? notificationHandler.title || '' : ''
              }
              onChange={(e) => updateHandler('notification', { title: e.target.value })}
            />
          </div>
        )}
      </div>

      {/* File Handler */}
      <div className="space-y-3 p-4 rounded-lg border">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="handler-file" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              {t('scheduler.saveToFile')}
            </Label>
            <p className="text-xs text-muted-foreground">실행 결과를 파일로 저장합니다</p>
          </div>
          <Switch
            id="handler-file"
            checked={fileHandler?.enabled ?? false}
            onCheckedChange={(checked: boolean) => toggleHandler('file', checked)}
          />
        </div>

        {fileHandler?.enabled && fileHandler.type === 'file' && (
          <div className="space-y-3 pt-2 border-t">
            <div className="space-y-2">
              <Label htmlFor="file-directory" className="text-xs">
                {t('scheduler.fileDirectory')}
              </Label>
              <Input
                id="file-directory"
                placeholder="/path/to/results"
                value={fileHandler.directory}
                onChange={(e) => updateHandler('file', { directory: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="file-name" className="text-xs">
                {t('scheduler.filename')} (선택사항)
              </Label>
              <Input
                id="file-name"
                placeholder="result_{timestamp}.md"
                value={fileHandler.filename || ''}
                onChange={(e) => updateHandler('file', { filename: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">{t('scheduler.filenameTemplate')}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="file-format" className="text-xs">
                {t('scheduler.fileFormat')}
              </Label>
              <Select
                value={fileHandler.format}
                onValueChange={(value: 'txt' | 'md') => updateHandler('file', { format: value })}
              >
                <SelectTrigger id="file-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="md">Markdown (.md)</SelectItem>
                  <SelectItem value="txt">Text (.txt)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
