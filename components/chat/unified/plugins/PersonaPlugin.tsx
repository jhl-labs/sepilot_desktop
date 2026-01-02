'use client';

/**
 * PersonaPlugin
 *
 * Persona 선택 플러그인 (자동완성)
 * Main Chat에서 사용
 */

import { Check } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Persona } from '@/types/persona';

interface PersonaPluginProps {
  input: string;
  personas: Persona[];
  activePersonaId: string | null;
  onPersonaSelect: (personaId: string) => void;
  onInputClear: () => void;
  onClose: () => void;
  selectedIndex: number;
  onIndexChange: (index: number) => void;
}

export function PersonaPlugin({
  input,
  personas,
  activePersonaId,
  onPersonaSelect,
  onInputClear,
  onClose,
  selectedIndex,
  onIndexChange,
}: PersonaPluginProps) {
  const { t } = useTranslation();
  const autocompleteRef = useRef<HTMLDivElement>(null);

  // Builtin persona의 번역된 이름, 설명을 가져오는 헬퍼 함수
  const getPersonaDisplayText = (persona: Persona, field: 'name' | 'description') => {
    if (persona.isBuiltin) {
      const translationKey = `persona.builtin.${persona.id}.${field}`;
      const translated = t(translationKey);
      // 번역 키가 존재하면 사용, 없으면 원본 사용
      return translated !== translationKey ? translated : persona[field];
    }
    return persona[field];
  };

  // Detect slash command for persona switching
  const personaCommand = input.match(/^\/persona\s+(.*)$/);
  const filteredPersonas = personaCommand
    ? personas.filter((p) => {
        const name = getPersonaDisplayText(p, 'name');
        const description = getPersonaDisplayText(p, 'description');
        const searchTerm = personaCommand[1].toLowerCase();
        return (
          name.toLowerCase().includes(searchTerm) || description.toLowerCase().includes(searchTerm)
        );
      })
    : [];

  const showAutocomplete = personaCommand && filteredPersonas.length > 0;

  if (!showAutocomplete) {
    return null;
  }

  const handleSelect = (persona: Persona) => {
    onPersonaSelect(persona.id);
    onInputClear();
    onClose();
  };

  return (
    <div
      ref={autocompleteRef}
      className="absolute bottom-full left-0 right-0 mb-2 max-h-[300px] overflow-y-auto rounded-lg border border-input bg-popover shadow-lg z-50"
    >
      <div className="p-2 space-y-1">
        {filteredPersonas.map((persona, index) => (
          <button
            key={persona.id}
            onClick={() => handleSelect(persona)}
            onMouseEnter={() => onIndexChange(index)}
            className={`w-full flex items-center gap-3 p-3 rounded-md text-left transition-colors ${
              index === selectedIndex ? 'bg-accent' : 'hover:bg-accent/50'
            }`}
          >
            <span className="text-2xl flex-shrink-0">{persona.avatar || '🤖'}</span>
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
          </button>
        ))}
      </div>
    </div>
  );
}
