'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Download, Upload, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import { isElectron } from '@/lib/platform';

interface BackupData {
  version: string;
  exportDate: string;
  conversations: any[];
  messages: any[];
  settings?: any;
}

export function BackupRestoreSettings() {
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
      setStatusMessage({ type: 'error', text: 'Electron 환경에서만 사용 가능합니다.' });
      return;
    }

    try {
      setIsExporting(true);
      setStatusMessage({ type: 'info', text: '대화 데이터를 내보내는 중...' });

      // Load all conversations
      const conversationsResult = await window.electronAPI.chat.loadConversations();
      if (!conversationsResult.success) {
        throw new Error(conversationsResult.error || 'Failed to load conversations');
      }

      const conversations = conversationsResult.data || [];

      // Load all messages for each conversation
      const allMessages: any[] = [];
      for (const conv of conversations) {
        const messagesResult = await window.electronAPI.chat.loadMessages(conv.id);
        if (messagesResult.success && messagesResult.data) {
          allMessages.push(...messagesResult.data);
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
        settings,
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
        text: `${conversations.length}개의 대화와 ${allMessages.length}개의 메시지를 내보냈습니다.`,
      });
    } catch (error: any) {
      console.error('Export error:', error);
      setStatusMessage({ type: 'error', text: `내보내기 실패: ${error.message}` });
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * Import conversations and messages from XML
   */
  const handleImport = async () => {
    if (!isElectron() || !window.electronAPI) {
      setStatusMessage({ type: 'error', text: 'Electron 환경에서만 사용 가능합니다.' });
      return;
    }

    try {
      setIsImporting(true);
      setStatusMessage({ type: 'info', text: '백업 파일을 선택하세요...' });

      // Create file input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.xml';

      input.onchange = async (e: any) => {
        const file = e.target?.files?.[0];
        if (!file) {
          setIsImporting(false);
          return;
        }

        try {
          setStatusMessage({ type: 'info', text: '백업 파일을 읽는 중...' });

          const text = await file.text();
          const backupData = parseXML(text);

          setStatusMessage({ type: 'info', text: '대화 데이터를 복원하는 중...' });

          // Restore conversations
          let conversationsRestored = 0;
          for (const conv of backupData.conversations) {
            const result = await window.electronAPI.chat.saveConversation(conv);
            if (result.success) {
              conversationsRestored++;
            }
          }

          // Restore messages
          let messagesRestored = 0;
          for (const msg of backupData.messages) {
            const result = await window.electronAPI.chat.saveMessage(msg);
            if (result.success) {
              messagesRestored++;
            }
          }

          setStatusMessage({
            type: 'success',
            text: `${conversationsRestored}개의 대화와 ${messagesRestored}개의 메시지를 복원했습니다.`,
          });

          // Reload the page to reflect changes
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        } catch (error: any) {
          console.error('Import error:', error);
          setStatusMessage({ type: 'error', text: `가져오기 실패: ${error.message}` });
        } finally {
          setIsImporting(false);
        }
      };

      input.click();
    } catch (error: any) {
      console.error('Import error:', error);
      setStatusMessage({ type: 'error', text: `가져오기 실패: ${error.message}` });
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
      xml += `      <id>${escapeXML(msg.id)}</id>\n`;
      xml += `      <conversation-id>${escapeXML(msg.conversation_id)}</conversation-id>\n`;
      xml += `      <role>${escapeXML(msg.role)}</role>\n`;
      xml += `      <content>${escapeXML(msg.content)}</content>\n`;
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
    const conversations: any[] = [];
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
    const messages: any[] = [];
    const messageNodes = root.querySelectorAll('messages > message');
    messageNodes.forEach((node) => {
      const msg: any = {
        id: node.querySelector('id')?.textContent || '',
        conversation_id: node.querySelector('conversation-id')?.textContent || '',
        role: node.querySelector('role')?.textContent || 'user',
        content: node.querySelector('content')?.textContent || '',
        created_at: parseInt(node.querySelector('created-at')?.textContent || '0'),
      };

      // Parse images
      const imageNodes = node.querySelectorAll('images > image');
      if (imageNodes.length > 0) {
        msg.images = [];
        imageNodes.forEach((imgNode) => {
          msg.images.push({
            id: imgNode.querySelector('id')?.textContent || '',
            filename: imgNode.querySelector('filename')?.textContent || '',
            mimeType: imgNode.querySelector('mime-type')?.textContent || '',
            base64: imgNode.querySelector('base64')?.textContent || '',
          });
        });
      }

      // Parse referenced documents
      const docNodes = node.querySelectorAll('referenced-documents > document');
      if (docNodes.length > 0) {
        msg.referenced_documents = [];
        docNodes.forEach((docNode) => {
          msg.referenced_documents.push({
            id: docNode.querySelector('id')?.textContent || '',
            title: docNode.querySelector('title')?.textContent || '',
            source: docNode.querySelector('source')?.textContent || '',
            content: docNode.querySelector('content')?.textContent || '',
          });
        });
      }

      messages.push(msg);
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
        <h3 className="text-lg font-medium mb-4">백업 및 복구</h3>
        <p className="text-sm text-muted-foreground mb-6">
          모든 대화 내용을 XML 파일로 내보내거나 가져올 수 있습니다.
        </p>
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
              <Label className="text-base font-medium">내보내기</Label>
              <p className="text-sm text-muted-foreground mt-1">
                모든 대화와 메시지를 XML 파일로 내보냅니다.
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
                내보내는 중...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                XML로 내보내기
              </>
            )}
          </Button>
        </div>

        {/* Import */}
        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Upload className="w-5 h-5 mt-0.5 text-muted-foreground" />
            <div className="flex-1">
              <Label className="text-base font-medium">가져오기</Label>
              <p className="text-sm text-muted-foreground mt-1">
                XML 백업 파일에서 대화를 복원합니다.
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
                가져오는 중...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                XML에서 가져오기
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
            <p className="font-medium">주의사항</p>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li>가져오기는 기존 대화에 추가됩니다 (덮어쓰지 않음)</li>
              <li>중복된 ID가 있을 경우 최신 데이터로 업데이트됩니다</li>
              <li>가져오기 후 자동으로 페이지가 새로고침됩니다</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
