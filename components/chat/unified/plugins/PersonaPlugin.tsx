'use client';

/**
 * PersonaPlugin
 *
 * Persona 표시 및 선택 (Main 모드 전용)
 * Show active persona, autocomplete for /persona command
 */

import { Bot } from 'lucide-react';
import type { PluginProps } from '../types';
import type { Persona } from '@/types/persona';

interface PersonaPluginProps extends PluginProps {
  activePersona: Persona | null;
  personas: Persona[];
  input: string;
  onPersonaSelect?: (persona: Persona) => void;
}

export function PersonaPlugin({
  activePersona,
  personas,
  input,
  onPersonaSelect,
}: PersonaPluginProps) {
  // Detect /persona command
  const personaCommand = input.match(/^\/persona\s+(.*)$/);
  const filteredPersonas = personaCommand
    ? personas.filter(
        (p) =>
          p.name.toLowerCase().includes(personaCommand[1].toLowerCase()) ||
          p.description.toLowerCase().includes(personaCommand[1].toLowerCase())
      )
    : [];

  const showAutocomplete = personaCommand && filteredPersonas.length > 0;

  return (
    <>
      {/* Active persona indicator */}
      {activePersona && (
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
          <Bot className="h-3.5 w-3.5" />
          <span>Persona: {activePersona.name}</span>
        </div>
      )}

      {/* Persona autocomplete */}
      {showAutocomplete && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
          {filteredPersonas.map((persona) => (
            <button
              key={persona.id}
              className="w-full px-3 py-2 text-left hover:bg-accent text-sm"
              onClick={() => onPersonaSelect?.(persona)}
            >
              <div className="font-medium">{persona.name}</div>
              <div className="text-xs text-muted-foreground">{persona.description}</div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
