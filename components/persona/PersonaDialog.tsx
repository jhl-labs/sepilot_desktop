'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Trash2, Edit2, Check, User } from 'lucide-react';
import { useChatStore } from '@/lib/store/chat-store';
import type { Persona } from '@/types/persona';

interface PersonaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PersonaDialog({ open, onOpenChange }: PersonaDialogProps) {
  const { t } = useTranslation();
  const { personas, activePersonaId, setActivePersona, addPersona, updatePersona, deletePersona } =
    useChatStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    systemPrompt: '',
    avatar: '🤖',
  });

  const activePersona = personas.find((p) => p.id === activePersonaId);

  // Builtin persona의 번역된 이름, 설명, systemPrompt를 가져오는 헬퍼 함수
  const getPersonaDisplayText = (
    persona: Persona,
    field: 'name' | 'description' | 'systemPrompt'
  ) => {
    if (persona.isBuiltin) {
      const translationKey = `persona.builtin.${persona.id}.${field}`;
      const translated = t(translationKey);
      // 번역 키가 존재하면 사용, 없으면 원본 사용
      return translated !== translationKey ? translated : persona[field];
    }
    return persona[field];
  };

  const handleStartCreate = () => {
    setIsCreating(true);
    setEditingId(null);
    setFormData({
      name: '',
      description: '',
      systemPrompt: '',
      avatar: '🤖',
    });
  };

  const handleStartEdit = (persona: Persona) => {
    if (persona.isBuiltin) {
      return; // 기본 페르소나는 수정 불가
    }
    setIsCreating(false);
    setEditingId(persona.id);
    setFormData({
      name: persona.name,
      description: persona.description,
      systemPrompt: persona.systemPrompt,
      avatar: persona.avatar || '🤖',
    });
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.systemPrompt.trim()) {
      toast.warning(t('personaDialog.errors.requiredFields'));
      return;
    }

    try {
      if (isCreating) {
        await addPersona(formData);
      } else if (editingId) {
        await updatePersona(editingId, formData);
      }
      setIsCreating(false);
      setEditingId(null);
      setFormData({ name: '', description: '', systemPrompt: '', avatar: '🤖' });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : String(error) || t('personaDialog.errors.saveFailed')
      );
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm(t('personaDialog.confirm.delete'))) {
      try {
        await deletePersona(id);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : String(error) || t('personaDialog.errors.deleteFailed')
        );
      }
    }
  };

  const handleCancel = () => {
    setIsCreating(false);
    setEditingId(null);
    setFormData({ name: '', description: '', systemPrompt: '', avatar: '🤖' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]" onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5" />
              <span>{t('personaDialog.title')}</span>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-4 h-[calc(80vh-120px)]">
          {/* 페르소나 목록 */}
          <div className="w-1/3 border-r pr-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium">{t('personaDialog.list.title')}</h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleStartCreate}
                title={t('personaDialog.list.addNew')}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <ScrollArea className="h-[calc(100%-40px)]">
              <div className="space-y-1">
                {personas.map((persona) => (
                  <div
                    key={persona.id}
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                      activePersonaId === persona.id
                        ? 'bg-primary/10 border border-primary/20'
                        : 'hover:bg-accent'
                    }`}
                    onClick={() => setActivePersona(persona.id)}
                  >
                    <span className="text-2xl">{persona.avatar || '🤖'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {getPersonaDisplayText(persona, 'name')}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {getPersonaDisplayText(persona, 'description')}
                      </div>
                    </div>
                    {activePersonaId === persona.id && (
                      <Check className="h-4 w-4 text-primary flex-shrink-0" />
                    )}
                    {!persona.isBuiltin && (
                      <div className="flex gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartEdit(persona);
                          }}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(persona.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* 페르소나 상세/편집 */}
          <div className="flex-1">
            {isCreating || editingId ? (
              <div className="space-y-4">
                <h3 className="text-sm font-medium">
                  {isCreating ? t('personaDialog.form.create') : t('personaDialog.form.edit')}
                </h3>

                <div>
                  <label className="text-sm font-medium">{t('personaDialog.form.avatar')}</label>
                  <Input
                    value={formData.avatar}
                    onChange={(e) => setFormData({ ...formData, avatar: e.target.value })}
                    placeholder="🤖"
                    maxLength={2}
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">{t('personaDialog.form.name')}</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={t('personaDialog.form.namePlaceholder')}
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">
                    {t('personaDialog.form.description')}
                  </label>
                  <Input
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder={t('personaDialog.form.descriptionPlaceholder')}
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">
                    {t('personaDialog.form.systemPrompt')}
                  </label>
                  <Textarea
                    value={formData.systemPrompt}
                    onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                    placeholder={t('personaDialog.form.systemPromptPlaceholder')}
                    className="mt-1 min-h-[200px]"
                  />
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSave} className="flex-1">
                    {t('personaDialog.form.save')}
                  </Button>
                  <Button onClick={handleCancel} variant="outline" className="flex-1">
                    {t('personaDialog.form.cancel')}
                  </Button>
                </div>
              </div>
            ) : activePersona ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-4xl">{activePersona.avatar || '🤖'}</span>
                  <div>
                    <h3 className="text-lg font-semibold">
                      {getPersonaDisplayText(activePersona, 'name')}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {getPersonaDisplayText(activePersona, 'description')}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">
                    {t('personaDialog.view.systemPrompt')}
                  </label>
                  <ScrollArea className="mt-2 h-[300px] rounded-md border p-3 bg-muted/30">
                    <p className="text-sm whitespace-pre-wrap">
                      {getPersonaDisplayText(activePersona, 'systemPrompt')}
                    </p>
                  </ScrollArea>
                </div>

                {activePersona.isBuiltin && (
                  <p className="text-xs text-muted-foreground">
                    {t('personaDialog.view.builtinNote')}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <p>{t('personaDialog.view.emptyState')}</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
