'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { QuickInputConfig, QuickQuestion } from '@/types';
import { Plus, Trash2 } from 'lucide-react';

interface QuickInputSettingsTabProps {
  config: QuickInputConfig;
  setConfig: React.Dispatch<React.SetStateAction<QuickInputConfig>>;
  onSave: () => Promise<void>;
  isSaving: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
}

export function QuickInputSettingsTab({
  config,
  setConfig,
  onSave,
  isSaving,
  message,
}: QuickInputSettingsTabProps) {
  // Check for shortcut conflicts
  const getShortcutConflict = (shortcut: string, excludeId?: string): string | null => {
    if (!shortcut.trim()) return null;

    // Check against Quick Input shortcut
    if (shortcut === config.quickInputShortcut) {
      return 'Quick Input 단축키와 중복됩니다';
    }

    // Check against other Quick Questions
    for (const q of config.quickQuestions) {
      if (q.id !== excludeId && q.shortcut === shortcut) {
        return `"${q.name}"과(와) 중복됩니다`;
      }
    }

    return null;
  };

  const handleAddQuestion = () => {
    if (config.quickQuestions.length >= 5) {
      alert('최대 5개의 Quick Question만 등록할 수 있습니다.');
      return;
    }

    const newQuestion: QuickQuestion = {
      id: `qq-${Date.now()}`,
      name: `Quick Question ${config.quickQuestions.length + 1}`,
      shortcut: '',
      prompt: '',
      enabled: true,
    };

    setConfig({
      ...config,
      quickQuestions: [...config.quickQuestions, newQuestion],
    });
  };

  const handleRemoveQuestion = (id: string) => {
    setConfig({
      ...config,
      quickQuestions: config.quickQuestions.filter((q) => q.id !== id),
    });
  };

  const handleUpdateQuestion = (id: string, updates: Partial<QuickQuestion>) => {
    setConfig({
      ...config,
      quickQuestions: config.quickQuestions.map((q) =>
        q.id === id ? { ...q, ...updates } : q
      ),
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Quick Input과 Quick Question 기능의 단축키 및 프롬프트를 설정합니다.
        </div>

        {/* Quick Input Shortcut */}
        <div className="space-y-3 p-4 rounded-lg border">
          <Label htmlFor="quickInputShortcut" className="text-base font-semibold">
            Quick Input 단축키
          </Label>
          <Input
            id="quickInputShortcut"
            value={config.quickInputShortcut}
            onChange={(e) =>
              setConfig({
                ...config,
                quickInputShortcut: e.target.value,
              })
            }
            placeholder="CommandOrControl+Shift+Space"
          />
          <p className="text-xs text-muted-foreground">
            예: CommandOrControl+Shift+Space (기본값)
          </p>
        </div>

        {/* Quick Questions */}
        <div className="space-y-3 p-4 rounded-lg border">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">Quick Questions (최대 5개)</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddQuestion}
              disabled={config.quickQuestions.length >= 5}
            >
              <Plus className="h-4 w-4 mr-1" />
              추가
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            클립보드 내용을 기반으로 즉시 질문하고 답변을 받는 기능입니다.
            프롬프트에 {'{'}{'{'} clipboard {'}'}{'}'}를 사용하여 클립보드 내용을 참조할 수 있습니다.
          </p>

          {config.quickQuestions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              등록된 Quick Question이 없습니다.
            </div>
          ) : (
            <div className="space-y-4">
              {config.quickQuestions.map((question, index) => (
                <div
                  key={question.id}
                  className="p-4 rounded-lg border bg-muted/30 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">#{index + 1}</span>
                    <div className="flex items-center gap-2">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={question.enabled}
                          onChange={(e) =>
                            handleUpdateQuestion(question.id, {
                              enabled: e.target.checked,
                            })
                          }
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {question.enabled ? '활성화' : '비활성화'}
                        </span>
                      </label>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveQuestion(question.id)}
                        className="h-8 w-8 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`qq-name-${question.id}`}>이름</Label>
                    <Input
                      id={`qq-name-${question.id}`}
                      value={question.name}
                      onChange={(e) =>
                        handleUpdateQuestion(question.id, { name: e.target.value })
                      }
                      placeholder="Quick Question 이름"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`qq-shortcut-${question.id}`}>단축키</Label>
                    <Input
                      id={`qq-shortcut-${question.id}`}
                      value={question.shortcut}
                      onChange={(e) =>
                        handleUpdateQuestion(question.id, { shortcut: e.target.value })
                      }
                      placeholder="CommandOrControl+Shift+1"
                      className={
                        getShortcutConflict(question.shortcut, question.id)
                          ? 'border-destructive focus-visible:ring-destructive'
                          : ''
                      }
                    />
                    {getShortcutConflict(question.shortcut, question.id) && (
                      <p className="text-xs text-destructive">
                        ⚠️ {getShortcutConflict(question.shortcut, question.id)}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`qq-prompt-${question.id}`}>프롬프트</Label>
                    <textarea
                      id={`qq-prompt-${question.id}`}
                      value={question.prompt}
                      onChange={(e) =>
                        handleUpdateQuestion(question.id, { prompt: e.target.value })
                      }
                      placeholder="클립보드 내용: {{ clipboard }}"
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button onClick={onSave} disabled={isSaving}>
          {isSaving ? '저장 중...' : '저장'}
        </Button>
      </div>

      {message && (
        <div
          className={`rounded-md px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20'
              : 'bg-destructive/10 text-destructive border border-destructive/20'
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
