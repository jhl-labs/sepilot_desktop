'use client';

/**
 * PersonaPlugin
 *
 * Persona 선택 플러그인 (자동완성)
 * Main Chat에서 사용
 */

import { Check } from 'lucide-react';
import { useRef } from 'react';
import type { Persona } from '@/types/persona';

interface PersonaPluginProps {
  personas: Persona[];
  listboxId: string;
  activePersonaId: string | null;
  onPersonaSelect: (persona: Persona) => void;
  onClose: () => void;
  selectedIndex: number;
  onIndexChange: (index: number) => void;
  getPersonaDisplayText: (persona: Persona, field: 'name' | 'description') => string;
}

export function PersonaPlugin({
  personas,
  listboxId,
  activePersonaId,
  onPersonaSelect,
  onClose,
  selectedIndex,
  onIndexChange,
  getPersonaDisplayText,
}: PersonaPluginProps) {
  const autocompleteRef = useRef<HTMLDivElement>(null);

  if (personas.length === 0) {
    return null;
  }

  const handleSelect = (persona: Persona) => {
    onPersonaSelect(persona);
    onClose();
  };

  return (
    <div
      ref={autocompleteRef}
      id={listboxId}
      role="listbox"
      aria-label="Persona suggestions"
      className="absolute bottom-full left-0 right-0 mb-2 max-h-[300px] overflow-y-auto rounded-lg border border-input bg-popover shadow-lg z-50"
    >
      <div className="p-2 space-y-1">
        {personas.map((persona, index) => {
          const optionId = `${listboxId}-option-${persona.id}`;
          const isSelected = index === selectedIndex;

          return (
            <button
              key={persona.id}
              id={optionId}
              type="button"
              role="option"
              aria-selected={isSelected}
              onClick={() => handleSelect(persona)}
              onMouseEnter={() => onIndexChange(index)}
              className={`w-full flex items-center gap-3 p-3 rounded-md text-left transition-colors ${
                isSelected ? 'bg-accent' : 'hover:bg-accent/50'
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
          );
        })}
      </div>
    </div>
  );
}
