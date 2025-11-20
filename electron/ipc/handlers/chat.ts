import { ipcMain } from 'electron';
import { databaseService } from '../../services/database';
import { logger } from '../../services/logger';
import { chatLogger } from '../../services/chat-logger';
import { Conversation, Message } from '../../../types';

export function setupChatHandlers() {
  // Save conversation
  ipcMain.handle('save-conversation', async (_, conversation: Conversation) => {
    try {
      logger.debug('Saving conversation', { id: conversation.id });
      databaseService.saveConversation(conversation);
      return { success: true };
    } catch (error) {
      logger.error('Failed to save conversation', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Load all conversations
  ipcMain.handle('load-conversations', async () => {
    try {
      const conversations = databaseService.getAllConversations();
      logger.debug('Loaded conversations', { count: conversations.length });
      return { success: true, data: conversations };
    } catch (error) {
      logger.error('Failed to load conversations', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Delete conversation
  ipcMain.handle('delete-conversation', async (_, id: string) => {
    try {
      logger.debug('Deleting conversation', { id });
      databaseService.deleteConversation(id);
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete conversation', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Update conversation title
  ipcMain.handle(
    'update-conversation-title',
    async (_, id: string, title: string) => {
      try {
        logger.debug('Updating conversation title', { id, title });
        databaseService.updateConversationTitle(id, title);
        return { success: true };
      } catch (error) {
        logger.error('Failed to update conversation title', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );

  // Save message
  ipcMain.handle('save-message', async (_, message: Message) => {
    try {
      logger.debug('Saving message', { id: message.id });
      databaseService.saveMessage(message);

      // Log the message to a file
      const conversation = databaseService.getConversation(message.conversation_id);
      if (conversation) {
        await chatLogger.logMessage(conversation, message);
      }

      return { success: true };
    } catch (error) {
      logger.error('Failed to save message', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Load messages
  ipcMain.handle('load-messages', async (_, conversationId: string) => {
    try {
      const messages = databaseService.getMessages(conversationId);
      logger.debug('Loaded messages', {
        conversationId,
        count: messages.length,
      });
      return { success: true, data: messages };
    } catch (error) {
      logger.error('Failed to load messages', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Delete message
  ipcMain.handle('delete-message', async (_, id: string) => {
    try {
      logger.debug('Deleting message', { id });
      databaseService.deleteMessage(id);
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete message', error);
      return { success: false, error: (error as Error).message };
    }
  });

  logger.info('Chat IPC handlers registered');
}
