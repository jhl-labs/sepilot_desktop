/**
 * Chat IPC Handlers
 * 대화 및 메시지 관리를 위한 IPC 핸들러
 */

import { databaseService } from '../../services/database';
import { logger } from '../../services/logger';
import { chatLogger } from '../../services/chat-logger';
import { Conversation, Message } from '../../../types';
import { registerHandlers, removeHandlerIfExists } from '../utils';

export function setupChatHandlers() {
  // Remove existing handlers (for hot reload)
  const channels = [
    'save-conversation',
    'load-conversations',
    'delete-conversation',
    'update-conversation-title',
    'save-message',
    'load-messages',
    'delete-message',
  ];
  channels.forEach(removeHandlerIfExists);

  registerHandlers([
    {
      channel: 'save-conversation',
      handler: (conversation: Conversation) => {
        logger.debug('Saving conversation', { id: conversation.id });
        databaseService.saveConversation(conversation);
      },
    },
    {
      channel: 'load-conversations',
      handler: () => {
        const conversations = databaseService.getAllConversations();
        logger.debug('Loaded conversations', { count: conversations.length });
        return conversations;
      },
    },
    {
      channel: 'delete-conversation',
      handler: (id: string) => {
        logger.debug('Deleting conversation', { id });
        databaseService.deleteConversation(id);
      },
    },
    {
      channel: 'update-conversation-title',
      handler: (id: string, title: string) => {
        logger.debug('Updating conversation title', { id, title });
        databaseService.updateConversationTitle(id, title);
      },
    },
    {
      channel: 'save-message',
      handler: async (message: Message) => {
        logger.debug('Saving message', { id: message.id });
        databaseService.saveMessage(message);

        // Log the message to a file
        const conversation = databaseService.getConversation(message.conversation_id);
        if (conversation) {
          await chatLogger.logMessage(conversation, message);
        }
      },
    },
    {
      channel: 'load-messages',
      handler: (conversationId: string) => {
        const messages = databaseService.getMessages(conversationId);
        logger.debug('Loaded messages', {
          conversationId,
          count: messages.length,
        });
        return messages;
      },
    },
    {
      channel: 'delete-message',
      handler: (id: string) => {
        logger.debug('Deleting message', { id });
        databaseService.deleteMessage(id);
      },
    },
  ]);

  logger.info('Chat IPC handlers registered');
}
