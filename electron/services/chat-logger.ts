import fs from 'fs/promises';
import path from 'path';
import { PathsUtil } from '../utils/paths';
import { Conversation, Message } from '../../types';

class ChatLogger {
  private logDir: string;

  constructor() {
    this.logDir = PathsUtil.getLogsPath();
  }

  private getLogFilePath(conversationId: string): string {
    // Sanitize conversationId to be used as a filename
    const safeFileName = conversationId.replace(/[^a-z0-9-]/gi, '_');
    return path.join(this.logDir, `chat_${safeFileName}.md`);
  }

  private formatMessage(message: Message): string {
    const timestamp = new Date(message.created_at).toLocaleString();
    let content = `**[${message.role.toUpperCase()}]** (${timestamp})\n\n`;
    content += `${message.content}\n\n`;

    if (message.tool_calls && message.tool_calls.length > 0) {
      content += `*Tool Calls:*\n`;
      message.tool_calls.forEach((call) => {
        const args =
          typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments);
        content += `  - \`${call.name}\` with args: \`${args}\`\n`;
      });
      content += '\n';
    }

    if ((message as any).tool_results && (message as any).tool_results.length > 0) {
      content += `*Tool Results:*\n`;
      (message as any).tool_results.forEach((result: any) => {
        content += '```json\n';
        content += JSON.stringify(result, null, 2);
        content += '\n```\n\n';
      });
    }

    return content;
  }

  async logMessage(conversation: Conversation, message: Message): Promise<void> {
    try {
      const filePath = this.getLogFilePath(conversation.id);
      const fileExists = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false);

      let fileContent = '';
      if (!fileExists) {
        fileContent += `# Chat Log: ${conversation.title}\n`;
        fileContent += `*Conversation ID: ${conversation.id}*\n`;
        fileContent += `*Created At: ${new Date(conversation.created_at).toLocaleString()}*\n\n`;
        fileContent += '---\n\n';
      }

      const formattedMessage = this.formatMessage(message);
      fileContent += formattedMessage;

      await fs.appendFile(filePath, fileContent, 'utf-8');
    } catch (error) {
      console.error('Failed to log chat message:', error);
    }
  }
}

export const chatLogger = new ChatLogger();
