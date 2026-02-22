'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Download, Upload, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import { isElectron } from '@/lib/platform';
import type { Conversation, Message, AppConfig } from '@/types';
import { chunkArray, runPromisesInBatches } from '@/lib/utils/batch';

interface BackupData {
  version: string;
  exportDate: string;
  conversations: Conversation[];
  messages: Message[];
  settings?: AppConfig;
}

const EXPORT_MESSAGE_LOAD_BATCH_SIZE = 12;
const IMPORT_CONVERSATION_BATCH_SIZE = 20;
const IMPORT_MESSAGE_BATCH_SIZE = 80;

export function BackupRestoreSettings() {
  const { t } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  /**
   * Export all conversations and messages to XML
   */
  const handleExport = async () => {
    if (!isElectron() || !window.electronAPI) {
      setStatusMessage({ type: 'error', text: t('settings.backup.electronOnly') });
      return;
    }

    try {
      setIsExporting(true);
      setStatusMessage({ type: 'info', text: t('settings.backup.exporting') });

      // Load all conversations
      const conversationsResult = await window.electronAPI.chat.loadConversations();
      if (!conversationsResult.success) {
        throw new Error(conversationsResult.error || 'Failed to load conversations');
      }

      const conversations = conversationsResult.data || [];

      // Load all messages for each conversation
      const allMessages: Message[] = [];
      const messageLoadResults = await runPromisesInBatches(
        conversations,
        EXPORT_MESSAGE_LOAD_BATCH_SIZE,
        (conv) => window.electronAPI.chat.loadMessages(conv.id)
      );
      for (const result of messageLoadResults) {
        if (result.status === 'fulfilled' && result.value.success && result.value.data) {
          allMessages.push(...result.value.data);
        }
      }

      // Load app config (optional)
      const configResult = await window.electronAPI.config.load();
      const settings = configResult.success ? configResult.data : null;

      // Create backup data
      const backupData: BackupData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        conversations,
        messages: allMessages,
        settings: settings ?? undefined,
      };

      // Convert to XML
      const xml = convertToXML(backupData);

      // Save to file
      const blob = new Blob([xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sepilot-backup-${new Date().toISOString().split('T')[0]}.xml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatusMessage({
        type: 'success',
        text: t('settings.backup.exportSuccess', {
          conversations: conversations.length,
          messages: allMessages.length,
        }),
      });
    } catch (error) {
      console.error('Export error:', error);
      setStatusMessage({
        type: 'error',
        text: t('settings.backup.exportFailed', {
          error: error instanceof Error ? error.message : String(error),
        }),
      });
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * Import conversations and messages from XML
   */
  const handleImport = async () => {
    if (!isElectron() || !window.electronAPI) {
      setStatusMessage({ type: 'error', text: t('settings.backup.electronOnly') });
      return;
    }

    try {
      setIsImporting(true);
      setStatusMessage({ type: 'info', text: t('settings.backup.selectFile') });

      // Create file input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.xml';

      input.onchange = async (e: Event) => {
        const file = (e.target as HTMLInputElement)?.files?.[0];
        if (!file) {
          setIsImporting(false);
          return;
        }

        try {
          setStatusMessage({ type: 'info', text: t('settings.backup.readingFile') });

          const text = await file.text();
          const backupData = parseXML(text);

          setStatusMessage({ type: 'info', text: t('settings.backup.restoring') });

          // Restore conversations (bulk IPC to reduce round trips)
          const conversationChunks = chunkArray(
            backupData.conversations,
            IMPORT_CONVERSATION_BATCH_SIZE
          );
          const conversationRestoreResults = await Promise.allSettled(
            conversationChunks.map((chunk) => window.electronAPI.chat.saveConversationsBulk(chunk))
          );
          let conversationsRestored = 0;
          conversationRestoreResults.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value.success) {
              conversationsRestored += result.value.data?.saved ?? conversationChunks[index].length;
            }
          });

          // Restore messages (bulk IPC to reduce round trips)
          const messageChunks = chunkArray(backupData.messages, IMPORT_MESSAGE_BATCH_SIZE);
          const messageRestoreResults = await Promise.allSettled(
            messageChunks.map((chunk) => window.electronAPI.chat.saveMessagesBulk(chunk))
          );
          let messagesRestored = 0;
          messageRestoreResults.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value.success) {
              messagesRestored += result.value.data?.saved ?? messageChunks[index].length;
            }
          });

          setStatusMessage({
            type: 'success',
            text: t('settings.backup.importSuccess', {
              conversations: conversationsRestored,
              messages: messagesRestored,
            }),
          });

          // Reload the page to reflect changes
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        } catch (error) {
          console.error('Import error:', error);
          setStatusMessage({
            type: 'error',
            text: t('settings.backup.importFailed', {
              error: error instanceof Error ? error.message : String(error),
            }),
          });
        } finally {
          setIsImporting(false);
        }
      };

      input.click();
    } catch (error) {
      console.error('Import error:', error);
      setStatusMessage({
        type: 'error',
        text: t('settings.backup.importFailed', {
          error: error instanceof Error ? error.message : String(error),
        }),
      });
      setIsImporting(false);
    }
  };

  /**
   * Convert backup data to XML format
   */
  const convertToXML = (data: BackupData): string => {
    const escapeXML = (str: string): string => {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    };

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<sepilot-backup>\n';
    xml += `  <version>${data.version}</version>\n`;
    xml += `  <export-date>${data.exportDate}</export-date>\n`;

    // Conversations
    xml += '  <conversations>\n';
    for (const conv of data.conversations) {
      xml += '    <conversation>\n';
      xml += `      <id>${escapeXML(conv.id)}</id>\n`;
      xml += `      <title>${escapeXML(conv.title)}</title>\n`;
      xml += `      <created-at>${conv.created_at}</created-at>\n`;
      xml += `      <updated-at>${conv.updated_at}</updated-at>\n`;
      xml += '    </conversation>\n';
    }
    xml += '  </conversations>\n';

    // Messages
    xml += '  <messages>\n';
    for (const msg of data.messages) {
      xml += '    <message>\n';
      xml += `      <id>${escapeXML(msg.id || '')}</id>\n`;
      xml += `      <conversation-id>${escapeXML(msg.conversation_id || '')}</conversation-id>\n`;
      xml += `      <role>${escapeXML(msg.role || 'user')}</role>\n`;
      xml += `      <content>${escapeXML(msg.content || '')}</content>\n`;
      xml += `      <created-at>${msg.created_at}</created-at>\n`;

      // Images (optional)
      if (msg.images && msg.images.length > 0) {
        xml += '      <images>\n';
        for (const img of msg.images) {
          xml += '        <image>\n';
          xml += `          <id>${escapeXML(img.id)}</id>\n`;
          xml += `          <filename>${escapeXML(img.filename)}</filename>\n`;
          xml += `          <mime-type>${escapeXML(img.mimeType)}</mime-type>\n`;
          if (img.base64) {
            xml += `          <base64>${escapeXML(img.base64)}</base64>\n`;
          }
          xml += '        </image>\n';
        }
        xml += '      </images>\n';
      }

      // Referenced documents (optional)
      if (msg.referenced_documents && msg.referenced_documents.length > 0) {
        xml += '      <referenced-documents>\n';
        for (const doc of msg.referenced_documents) {
          xml += '        <document>\n';
          xml += `          <id>${escapeXML(doc.id)}</id>\n`;
          xml += `          <title>${escapeXML(doc.title)}</title>\n`;
          xml += `          <source>${escapeXML(doc.source)}</source>\n`;
          xml += `          <content>${escapeXML(doc.content)}</content>\n`;
          xml += '        </document>\n';
        }
        xml += '      </referenced-documents>\n';
      }

      xml += '    </message>\n';
    }
    xml += '  </messages>\n';

    // Settings (optional)
    if (data.settings) {
      xml += '  <settings>\n';
      xml += `    <![CDATA[${JSON.stringify(data.settings, null, 2)}]]>\n`;
      xml += '  </settings>\n';
    }

    xml += '</sepilot-backup>\n';

    return xml;
  };

  /**
   * Parse XML to backup data
   */
  const parseXML = (xml: string): BackupData => {
    // Prevent parsing dangerous XML constructs (e.g., DOCTYPE, external entities)
    if (/<!DOCTYPE/i.test(xml)) {
      throw new Error('Unsafe XML: DOCTYPE is not allowed');
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');

    // Check for parsing errors
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      throw new Error('Invalid XML format');
    }

    const root = doc.querySelector('sepilot-backup');
    if (!root) {
      throw new Error('Invalid backup file format');
    }

    const version = root.querySelector('version')?.textContent || '1.0';
    const exportDate = root.querySelector('export-date')?.textContent || new Date().toISOString();

    // Parse conversations
    const conversations: Conversation[] = [];
    const conversationNodes = root.querySelectorAll('conversations > conversation');
    conversationNodes.forEach((node) => {
      conversations.push({
        id: node.querySelector('id')?.textContent || '',
        title: node.querySelector('title')?.textContent || '',
        created_at: parseInt(node.querySelector('created-at')?.textContent || '0'),
        updated_at: parseInt(node.querySelector('updated-at')?.textContent || '0'),
      });
    });

    // Parse messages
    const messages: Message[] = [];
    const messageNodes = root.querySelectorAll('messages > message');
    messageNodes.forEach((node) => {
      const msg: Partial<Message> = {
        id: node.querySelector('id')?.textContent || '',
        conversation_id: node.querySelector('conversation-id')?.textContent || '',
        role: (node.querySelector('role')?.textContent as Message['role']) || 'user',
        content: node.querySelector('content')?.textContent || '',
        created_at: parseInt(node.querySelector('created-at')?.textContent || '0'),
      };

      // Parse images
      const imageNodes = node.querySelectorAll('images > image');
      if (imageNodes.length > 0) {
        msg.images = [];
        imageNodes.forEach((imgNode) => {
          msg.images!.push({
            id: imgNode.querySelector('id')?.textContent || '',
            filename: imgNode.querySelector('filename')?.textContent || '',
            mimeType: imgNode.querySelector('mime-type')?.textContent || '',
            base64: imgNode.querySelector('base64')?.textContent || '',
          });
        });
      }

      // Referenced documents
      const docNodes = node.querySelectorAll('referenced-documents > document');
      if (docNodes.length > 0) {
        msg.referenced_documents = [];
        docNodes.forEach((docNode) => {
          msg.referenced_documents!.push({
            id: docNode.querySelector('id')?.textContent || '',
            title: docNode.querySelector('title')?.textContent || '',
            source: docNode.querySelector('source')?.textContent || '',
            content: docNode.querySelector('content')?.textContent || '',
          });
        });
      }

      messages.push(msg as Message);
    });

    // Parse settings (optional)
    let settings = null;
    const settingsNode = root.querySelector('settings');
    if (settingsNode?.textContent) {
      try {
        settings = JSON.parse(settingsNode.textContent);
      } catch (e) {
        console.warn('Failed to parse settings:', e);
      }
    }

    return {
      version,
      exportDate,
      conversations,
      messages,
      settings,
    };
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-4">{t('settings.backup.title')}</h3>
        <p className="text-sm text-muted-foreground mb-6">{t('settings.backup.description')}</p>
      </div>

      {/* Status Message */}
      {statusMessage && (
        <div
          className={`rounded-md border px-4 py-3 text-sm flex items-start gap-3 ${
            statusMessage.type === 'success'
              ? 'bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-500'
              : statusMessage.type === 'error'
                ? 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-500'
                : 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-500'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" />
          ) : statusMessage.type === 'error' ? (
            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          ) : (
            <FileText className="w-5 h-5 mt-0.5 flex-shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      <div className="space-y-4">
        {/* Export */}
        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Download className="w-5 h-5 mt-0.5 text-muted-foreground" />
            <div className="flex-1">
              <Label className="text-base font-medium">{t('settings.backup.export')}</Label>
              <p className="text-sm text-muted-foreground mt-1">
                {t('settings.backup.exportDescription')}
              </p>
            </div>
          </div>
          <Button
            onClick={handleExport}
            disabled={isExporting || isImporting}
            className="w-full"
            variant="outline"
          >
            {isExporting ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                {t('settings.backup.exporting')}
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                {t('settings.backup.exportButton')}
              </>
            )}
          </Button>
        </div>

        {/* Import */}
        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Upload className="w-5 h-5 mt-0.5 text-muted-foreground" />
            <div className="flex-1">
              <Label className="text-base font-medium">{t('settings.backup.import')}</Label>
              <p className="text-sm text-muted-foreground mt-1">
                {t('settings.backup.importDescription')}
              </p>
            </div>
          </div>
          <Button
            onClick={handleImport}
            disabled={isExporting || isImporting}
            className="w-full"
            variant="outline"
          >
            {isImporting ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                {t('settings.backup.importing')}
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                {t('settings.backup.importButton')}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Warning */}
      <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 px-4 py-3 text-sm text-yellow-600 dark:text-yellow-500">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">{t('settings.backup.warning')}</p>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li>{t('settings.backup.warning1')}</li>
              <li>{t('settings.backup.warning2')}</li>
              <li>{t('settings.backup.warning3')}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
