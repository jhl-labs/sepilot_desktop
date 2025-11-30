/**
 * Persona IPC Handlers
 * AI 페르소나 관리를 위한 IPC 핸들러
 */

import { databaseService } from '../../services/database';
import { logger } from '../../services/logger';
import { Persona } from '../../../types/persona';
import { registerHandlers, removeHandlerIfExists } from '../utils';

export function setupPersonaHandlers() {
  // Remove existing handlers (for hot reload)
  const channels = ['persona-load-all', 'persona-save', 'persona-update', 'persona-delete'];
  channels.forEach(removeHandlerIfExists);

  registerHandlers([
    {
      channel: 'persona-load-all',
      handler: () => {
        const personas = databaseService.getAllPersonas();
        logger.debug('Loaded personas', { count: personas.length });
        return personas;
      },
    },
    {
      channel: 'persona-save',
      handler: (persona: Persona) => {
        logger.debug('Saving persona', { id: persona.id });
        databaseService.savePersona(persona);
      },
    },
    {
      channel: 'persona-update',
      handler: (persona: Persona) => {
        logger.debug('Updating persona', { id: persona.id });
        databaseService.updatePersona(persona);
      },
    },
    {
      channel: 'persona-delete',
      handler: (id: string) => {
        logger.debug('Deleting persona', { id });
        databaseService.deletePersona(id);
      },
    },
  ]);

  logger.info('Persona IPC handlers registered');
}
