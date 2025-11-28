'use client';

import { Message } from '@/types';
import { cn } from '@/lib/utils';
import { User, Bot, Edit2, RefreshCw, Copy, Check, X, FileText, ChevronDown, ChevronUp, ImageIcon } from 'lucide-react';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useChatStore } from '@/lib/store/chat-store';
import { ImageGenerationProgressBar } from './ImageGenerationProgressBar';

interface MessageBubbleProps {
  message: Message;
  onEdit?: (messageId: string, newContent: string) => void;
  onRegenerate?: (messageId: string) => void;
  isLastAssistantMessage?: boolean;
  isStreaming?: boolean;
}

export function MessageBubble({
  message,
  onEdit,
  onRegenerate,
  isLastAssistantMessage = false,
  isStreaming = false,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [isHovered, setIsHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());

  const { addMessage, imageGenerationProgress } = useChatStore();

  // Check if this message has image generation in progress
  const messageImageGenProgress = Array.from(imageGenerationProgress.values()).find(
    (progress) => progress.messageId === message.id && progress.status !== 'completed'
  );

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEditSave = () => {
    if (editContent.trim() && onEdit) {
      onEdit(message.id, editContent.trim());
      setIsEditing(false);
    }
  };

  const handleEditCancel = () => {
    setEditContent(message.content);
    setIsEditing(false);
  };

  const handleRegenerate = () => {
    if (onRegenerate) {
      onRegenerate(message.id);
    }
  };

  const handleViewDocument = (docId: string, docTitle: string, docContent: string) => {
    // 문서 전문을 새 메시지로 추가
    const documentMessage: Message = {
      id: `doc-${Date.now()}`,
      role: 'system',
      content: `**📄 참조 문서: ${docTitle}**\n\n${docContent}`,
      created_at: Date.now(),
    };
    addMessage(documentMessage);
  };

  const toggleDocumentExpand = (docId: string) => {
    const newExpanded = new Set(expandedDocs);
    if (newExpanded.has(docId)) {
      newExpanded.delete(docId);
    } else {
      newExpanded.add(docId);
    }
    setExpandedDocs(newExpanded);
  };

  return (
    <div
      className={cn(
        'group relative flex gap-4 py-6 px-4 transition-colors',
        isUser ? 'flex-row' : 'flex-row',
        !isUser && 'hover:bg-muted/30'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-2 ring-background shadow-sm',
          isUser
            ? 'bg-gradient-to-br from-blue-600 to-blue-500 dark:from-blue-500 dark:to-blue-400 text-white'
            : 'bg-gradient-to-br from-secondary to-secondary/80 text-secondary-foreground'
        )}
      >
        {isUser ? <User className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
      </div>

      {/* Message Content */}
      <div className="flex flex-col gap-2 flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-sm font-semibold',
            isUser ? 'text-blue-700 dark:text-blue-400' : 'text-left'
          )}>
            {isUser ? 'You' : 'Assistant'}
          </span>
        </div>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          {isEditing ? (
            <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="min-h-[100px] text-sm resize-none"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={handleEditCancel}>
                  <X className="h-3 w-3 mr-1" />
                  취소
                </Button>
                <Button size="sm" onClick={handleEditSave}>
                  <Check className="h-3 w-3 mr-1" />
                  저장
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Display attached/generated images */}
              {message.images && message.images.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {message.images.map((image, index) => (
                    <div key={image.id} className="group relative">
                      <img
                        src={image.base64}
                        alt={image.filename}
                        className="rounded-lg max-h-64 w-auto border border-border shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => {
                          // Open image in larger view
                          window.open(image.base64, '_blank');
                        }}
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs px-2 py-1 rounded-b-lg opacity-0 group-hover:opacity-100 transition-opacity">
                        {image.filename}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Image Generation Progress */}
              {messageImageGenProgress && (
                <ImageGenerationProgressBar
                  progress={messageImageGenProgress}
                  className="mb-3"
                />
              )}

              {isAssistant ? (
                <MarkdownRenderer
                  content={message.content}
                  isStreaming={isStreaming}
                  referencedDocuments={message.referenced_documents}
                  onSourceClick={(doc) => handleViewDocument(doc.id, doc.title, doc.content)}
                />
              ) : (
                <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-blue-700 dark:text-blue-400">
                  {message.content}
                </div>
              )}
            </>
          )}
        </div>

        {/* Referenced Documents */}
        {isAssistant && message.referenced_documents && message.referenced_documents.length > 0 && !isEditing && (
          <div className="mt-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-3 w-3" />
              참조 문서 ({message.referenced_documents.length}개)
            </div>
            <div className="space-y-1.5">
              {message.referenced_documents.map((doc, index) => {
                const isExpanded = expandedDocs.has(doc.id);
                const preview = doc.content.slice(0, 100);
                return (
                  <div
                    key={doc.id}
                    className="text-xs bg-muted/30 rounded-lg p-2.5 border border-border/50 hover:border-primary/30 transition-colors cursor-pointer"
                    onClick={() => handleViewDocument(doc.id, doc.title, doc.content)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-primary hover:underline mb-0.5">
                          【출처: {doc.source} - {doc.title}】
                        </div>
                        {isExpanded && (
                          <div className="mt-2 pt-2 border-t border-border/30 text-[11px] leading-relaxed whitespace-pre-wrap">
                            {doc.content}
                          </div>
                        )}
                        {!isExpanded && (
                          <div className="text-[11px] text-muted-foreground line-clamp-2">
                            {preview}...
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 mt-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleDocumentExpand(doc.id);
                        }}
                        className="h-6 px-2 text-[10px] hover:bg-muted"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="h-3 w-3 mr-1" />
                            접기
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-3 w-3 mr-1" />
                            펼치기
                          </>
                        )}
                      </Button>
                      <div className="text-[10px] text-muted-foreground flex items-center px-2">
                        클릭하여 대화창에 표시
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* Action Buttons - Float on top right */}
      {!isEditing && isHovered && (
        <div className="absolute top-4 right-4 flex gap-1 bg-background/80 backdrop-blur-sm rounded-lg border shadow-sm p-0.5">
          {/* 복사 버튼 - 모든 메시지에 표시 */}
          <Button
            size="icon"
            variant="ghost"
            onClick={handleCopy}
            className="h-7 w-7 rounded-md hover:bg-muted"
            title={copied ? '복사됨' : '복사'}
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>

          {/* 편집 버튼 - 사용자 메시지에 표시 */}
          {isUser && onEdit && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setIsEditing(true)}
              className="h-7 w-7 rounded-md hover:bg-muted"
              title="편집"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
          )}

          {/* 재생성 버튼 - 마지막 assistant 메시지에 표시 */}
          {isAssistant && isLastAssistantMessage && onRegenerate && (
            <Button
              size="icon"
              variant="ghost"
              onClick={handleRegenerate}
              className="h-7 w-7 rounded-md hover:bg-muted"
              title="재생성"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
