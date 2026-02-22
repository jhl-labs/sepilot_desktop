/**
 * Chat IPC Handlers
 * 대화 및 메시지 관리를 위한 IPC 핸들러
 */

import { databaseService } from '../../../services/database';
import { logger } from '../../../services/logger';
import { chatLogger } from '../../../services/chat-logger';
import { Conversation, Message } from '@/types';
import { registerHandlers, removeHandlerIfExists } from '@/electron/ipc/utils';

export function setupChatHandlers() {
  // Remove existing handlers (for hot reload)
  const channels = [
    'save-conversation',
    'save-conversations-bulk',
    'load-conversations',
    'search-conversations',
    'delete-conversation',
    'update-conversation-title',
    'save-message',
    'save-messages-bulk',
    'load-messages',
    'delete-message',
    'delete-conversation-messages',
    'replace-conversation-messages',
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
      channel: 'save-conversations-bulk',
      handler: (conversations: Conversation[]) => {
        logger.debug('Saving conversations in bulk', { count: conversations.length });
        databaseService.saveConversationsBulk(conversations);
        return { saved: conversations.length };
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
      channel: 'search-conversations',
      handler: (query: string) => {
        const results = databaseService.searchConversations(query);
        logger.debug('Searched conversations', {
          query,
          resultCount: results.length,
        });
        return results;
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
      channel: 'save-messages-bulk',
      handler: async (messages: Message[]) => {
        logger.debug('Saving messages in bulk', { count: messages.length });
        databaseService.saveMessagesBulk(messages);

        const conversationCache = new Map<string, Conversation | null>();
        for (const message of messages) {
          const conversationId = message.conversation_id;
          if (!conversationId) {
            continue;
          }

          let conversation = conversationCache.get(conversationId);
          if (conversation === undefined) {
            conversation = databaseService.getConversation(conversationId);
            conversationCache.set(conversationId, conversation);
          }

          if (conversation) {
            await chatLogger.logMessage(conversation, message);
          }
        }

        return { saved: messages.length };
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
    {
      channel: 'delete-conversation-messages',
      handler: (conversationId: string) => {
        logger.debug('Deleting all messages for conversation', { conversationId });
        databaseService.deleteConversationMessages(conversationId);
      },
    },
    {
      channel: 'replace-conversation-messages',
      handler: (conversationId: string, newMessages: Message[]) => {
        logger.debug('Replacing conversation messages', {
          conversationId,
          messageCount: newMessages.length,
        });
        databaseService.replaceConversationMessages(conversationId, newMessages);
      },
    },
  ]);

  logger.info('Chat IPC handlers registered');
}
