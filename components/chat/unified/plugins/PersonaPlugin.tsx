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
  const autocompleteRef = useRef<HTMLDivElement>(null);

  // Detect slash command for persona switching
  const personaCommand = input.match(/^\/persona\s+(.*)$/);
  const filteredPersonas = personaCommand
    ? personas.filter(
        (p) =>
          p.name.toLowerCase().includes(personaCommand[1].toLowerCase()) ||
          p.description.toLowerCase().includes(personaCommand[1].toLowerCase())
      )
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
              <div className="font-medium text-sm truncate">{persona.name}</div>
              <div className="text-xs text-muted-foreground truncate">{persona.description}</div>
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
