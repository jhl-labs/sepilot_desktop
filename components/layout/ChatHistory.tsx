'use client';

import {
  MessageSquare,
  Pencil,
  Trash2,
  Search,
  X,
  User,
  Check,
  BookOpen,
  Copy,
  FileArchive,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useChatStore } from '@/lib/store/chat-store';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Conversation, Message } from '@/types';
import { MoreHorizontal } from 'lucide-react';
import { SaveKnowledgeDialog } from '@/components/chat/SaveKnowledgeDialog';
import { CompressConversationDialog } from '@/components/chat/CompressConversationDialog';
import { isElectron } from '@/lib/platform';
import { useTranslation } from 'react-i18next';
import type { Persona } from '@/types/persona';

import { logger } from '@/lib/utils/logger';
interface ChatHistoryProps {
  onConversationClick?: () => void;
}

export function ChatHistory({ onConversationClick }: ChatHistoryProps) {
  const { t } = useTranslation();
  const {
    conversations,
    activeConversationId,
    setActiveConversation,
    deleteConversation,
    duplicateConversation,
    updateConversationTitle,
    updateConversationPersona,
    searchConversations,
    personas,
    clearMessagesCache,
  } = useChatStore();

  // Builtin persona의 번역된 이름, 설명을 가져오는 헬퍼 함수
  const getPersonaDisplayText = (persona: Persona, field: 'name' | 'description') => {
    if (persona.isBuiltin) {
      const translationKey = `persona.builtin.${persona.id}.${field}`;
      const translated = t(translationKey);
      // 번역 키가 존재하면 사용, 없으면 원본 사용
      return translated !== translationKey ? translated : persona[field];
    }
    return persona[field];
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<
    Array<{ conversation: Conversation; matchedMessages: Message[] }>
  >([]);
  const [isSearching, setIsSearching] = useState(false);
  const [personaDialogOpen, setPersonaDialogOpen] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [saveKnowledgeDialogOpen, setSaveKnowledgeDialogOpen] = useState(false);
  const [knowledgeConversation, setKnowledgeConversation] = useState<Conversation | null>(null);
  const [knowledgeMessages, setKnowledgeMessages] = useState<Message[]>([]);
  const [compressDialogOpen, setCompressDialogOpen] = useState(false);
  const [compressConversation, setCompressConversation] = useState<Conversation | null>(null);
  const [compressMessages, setCompressMessages] = useState<Message[]>([]);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const handleStartEdit = (id: string, title: string) => {
    setEditingId(id);
    setEditTitle(title);
  };

  const handleSaveEdit = async () => {
    if (editingId && editTitle.trim()) {
      await updateConversationTitle(editingId, editTitle.trim());
    }
    setEditingId(null);
    setEditTitle('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
  };

  const handleDelete = async (id: string) => {
    if (window.confirm(t('chat.confirmDelete'))) {
      await deleteConversation(id);
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const newConversationId = await duplicateConversation(id);
      // Switch to the duplicated conversation
      await setActiveConversation(newConversationId);
      onConversationClick?.();
    } catch (error) {
      console.error('Failed to duplicate conversation:', error);
      // TODO: Show error toast to user
    }
  };

  const handleCompress = async (conversationId: string) => {
    const conversation = conversations.find((c) => c.id === conversationId);
    if (!conversation) {
      return;
    }

    // Load messages for this conversation
    let messages: Message[] = [];

    if (isElectron() && window.electronAPI) {
      try {
        const result = await window.electronAPI.chat.loadMessages(conversationId);
        if (result.success && result.data) {
          messages = result.data;
        }
      } catch (error) {
        console.error('Failed to load messages:', error);
        // TODO: Show error toast to user
        return;
      }
    } else {
      // Web: localStorage에서 로드
      try {
        const allMessages = localStorage.getItem('sepilot_messages');
        if (allMessages) {
          const parsed = JSON.parse(allMessages) as Record<string, Message[]>;
          messages = parsed[conversationId] || [];
        }
      } catch (error) {
        console.error('Failed to load messages from localStorage:', error);
        // TODO: Show error toast to user
        return;
      }
    }

    if (messages.length === 0) {
      console.error('No messages found in conversation');
      // TODO: Show error toast to user
      return;
    }

    setCompressConversation(conversation);
    setCompressMessages(messages);
    setCompressDialogOpen(true);
  };

  const handleOpenPersonaDialog = (conversationId: string) => {
    setSelectedConversationId(conversationId);
    setPersonaDialogOpen(true);
  };

  const handleSetPersona = async (personaId: string | null) => {
    if (selectedConversationId) {
      await updateConversationPersona(selectedConversationId, personaId);
      setPersonaDialogOpen(false);
      setSelectedConversationId(null);
    }
  };

  const handleOpenSaveKnowledgeDialog = async (conversationId: string) => {
    const conversation = conversations.find((c) => c.id === conversationId);
    if (!conversation) {
      return;
    }

    // Load messages for this conversation
    let messages: Message[] = [];

    if (isElectron() && window.electronAPI) {
      try {
        const result = await window.electronAPI.chat.loadMessages(conversationId);
        if (result.success && result.data) {
          messages = result.data;
        }
      } catch (error) {
        console.error('Failed to load messages:', error);
        // TODO: Show error toast to user
        return;
      }
    } else {
      // Web: localStorage에서 로드
      try {
        const allMessages = localStorage.getItem('sepilot_messages');
        if (allMessages) {
          const parsed = JSON.parse(allMessages) as Record<string, Message[]>;
          messages = parsed[conversationId] || [];
        }
      } catch (error) {
        console.error('Failed to load messages from localStorage:', error);
        // TODO: Show error toast to user
        return;
      }
    }

    if (messages.length === 0) {
      console.error('No messages found in conversation');
      // TODO: Show error toast to user
      return;
    }

    setKnowledgeConversation(conversation);
    setKnowledgeMessages(messages);
    setSaveKnowledgeDialogOpen(true);
  };

  const handleSaveKnowledge = async (doc: {
    title: string;
    content: string;
    metadata: Record<string, unknown>;
  }) => {
    try {
      // Create RawDocument
      const rawDoc = {
        id: `knowledge_${Date.now()}`,
        content: doc.content,
        metadata: {
          ...doc.metadata,
          title: doc.title,
          source: 'conversation',
          uploadedAt: Date.now(),
        },
      };

      // Index document via IPC
      if (window.electronAPI?.vectorDB) {
        const result = await window.electronAPI.vectorDB.indexDocuments([rawDoc], {
          chunkSize: 500,
          chunkOverlap: 50,
          batchSize: 10,
        });

        if (!result.success) {
          throw new Error(result.error || '지식 저장에 실패했습니다.');
        }
      } else {
        throw new Error('VectorDB가 초기화되지 않았습니다.');
      }

      logger.info('Knowledge saved successfully:', doc.title);
    } catch (error) {
      console.error('Failed to save knowledge:', error);
      throw new Error(
        error instanceof Error ? error.message : String(error) || '지식 저장에 실패했습니다.'
      );
    }
  };

  const handleCompressConversation = async (compressedMessages: Message[]) => {
    if (!compressConversation) {
      throw new Error('No conversation to compress');
    }

    try {
      // Replace conversation messages atomically
      if (isElectron() && window.electronAPI) {
        // Use atomic replace operation (transaction-based)
        await window.electronAPI.chat.replaceConversationMessages(
          compressConversation.id,
          compressedMessages
        );
      } else {
        // Web: localStorage에 저장
        const allMessages = localStorage.getItem('sepilot_messages');
        const parsed = allMessages ? JSON.parse(allMessages) : {};
        parsed[compressConversation.id] = compressedMessages;
        localStorage.setItem('sepilot_messages', JSON.stringify(parsed));
      }

      // Clear cache to force reload from database
      clearMessagesCache(compressConversation.id);

      // Reload the active conversation if it's the compressed one
      if (activeConversationId === compressConversation.id) {
        await setActiveConversation(compressConversation.id);
      }

      logger.info('Conversation compressed successfully');
    } catch (error) {
      console.error('Failed to compress conversation:', error);
      throw new Error(
        error instanceof Error ? error.message : String(error) || '대화 압축에 실패했습니다.'
      );
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);

    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const results = await searchConversations(query);
      setSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setIsSearching(false);
  };

  const handleSearchResultClick = async (conversationId: string) => {
    await setActiveConversation(conversationId);
    handleClearSearch();
    onConversationClick?.();
  };

  const selectedConversation = selectedConversationId
    ? conversations.find((c) => c.id === selectedConversationId)
    : null;

  return (
    <>
      {/* Search Bar */}
      <div className="border-b px-3 py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder={t('chat.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9 pr-9 h-9"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClearSearch}
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Conversation List or Search Results */}
      <ScrollArea className="flex-1 px-2 py-2">
        {isSearching && searchQuery ? (
          // Search Results
          searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
              <Search className="mb-2 h-8 w-8 opacity-50" />
              <p className="text-sm">{t('chat.noSearchResults')}</p>
              <p className="mt-1 text-xs">&quot;{searchQuery}&quot;</p>
            </div>
          ) : (
            <div className="space-y-3">
              {searchResults.map(({ conversation, matchedMessages }) => (
                <div
                  key={conversation.id}
                  className="rounded-lg border bg-card p-3 hover:bg-accent cursor-pointer transition-colors"
                  onClick={() => handleSearchResultClick(conversation.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {conversation.personaId &&
                          (() => {
                            const persona = personas.find((p) => p.id === conversation.personaId);
                            return persona?.avatar ? (
                              <span className="text-sm flex-shrink-0">{persona.avatar}</span>
                            ) : null;
                          })()}
                        <h3 className="text-sm font-medium line-clamp-1">{conversation.title}</h3>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(conversation.updated_at)}
                      </p>
                    </div>
                    <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full whitespace-nowrap">
                      {t('chat.matchCount', { count: matchedMessages.length })}
                    </span>
                  </div>
                  {matchedMessages.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {matchedMessages.slice(0, 2).map((msg) => (
                        <p
                          key={msg.id}
                          className="text-xs text-muted-foreground line-clamp-2 bg-muted/50 rounded px-2 py-1"
                        >
                          {msg.content}
                        </p>
                      ))}
                      {matchedMessages.length > 2 && (
                        <p className="text-xs text-muted-foreground italic">
                          {t('chat.moreMatches', { count: matchedMessages.length - 2 })}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <MessageSquare className="mb-2 h-8 w-8 opacity-50" />
            <p className="text-sm">{t('chat.noConversations')}</p>
            <p className="mt-1 text-xs">{t('chat.startNewConversation')}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={cn(
                  'group relative flex items-center gap-1 rounded-lg transition-colors hover:bg-accent',
                  activeConversationId === conversation.id && 'bg-accent text-accent-foreground'
                )}
              >
                {editingId === conversation.id ? (
                  <div className="flex-1 px-3 py-2">
                    <Input
                      ref={editInputRef}
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveEdit();
                        } else if (e.key === 'Escape') {
                          handleCancelEdit();
                        }
                      }}
                      onBlur={handleSaveEdit}
                      className="h-7 text-sm"
                    />
                  </div>
                ) : (
                  <>
                    <ContextMenu>
                      <ContextMenuTrigger asChild>
                        <button
                          onClick={async () => {
                            await setActiveConversation(conversation.id);
                            onConversationClick?.();
                          }}
                          className="flex flex-1 flex-col items-start px-3 py-2 text-left"
                        >
                          <div className="flex items-center gap-1.5 w-full">
                            {conversation.personaId &&
                              (() => {
                                const persona = personas.find(
                                  (p) => p.id === conversation.personaId
                                );
                                return persona?.avatar ? (
                                  <span className="text-sm flex-shrink-0">{persona.avatar}</span>
                                ) : null;
                              })()}
                            <span className="text-sm font-medium line-clamp-1">
                              {conversation.title}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(conversation.updated_at)}
                          </span>
                        </button>
                      </ContextMenuTrigger>
                      <ContextMenuContent collisionPadding={8} avoidCollisions={true}>
                        <ContextMenuItem
                          onClick={() => handleStartEdit(conversation.id, conversation.title)}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          {t('chat.rename')}
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => handleOpenPersonaDialog(conversation.id)}>
                          <User className="mr-2 h-4 w-4" />
                          {t('chat.persona')}
                        </ContextMenuItem>
                        <ContextMenuItem
                          onClick={() => handleOpenSaveKnowledgeDialog(conversation.id)}
                        >
                          <BookOpen className="mr-2 h-4 w-4" />
                          {t('chat.saveKnowledge')}
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => handleDuplicate(conversation.id)}>
                          <Copy className="mr-2 h-4 w-4" />
                          {t('chat.duplicate')}
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => handleCompress(conversation.id)}>
                          <FileArchive className="mr-2 h-4 w-4" />
                          {t('chat.compress')}
                        </ContextMenuItem>
                        <ContextMenuItem
                          onClick={() => handleDelete(conversation.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('chat.delete')}
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleStartEdit(conversation.id, conversation.title)}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          {t('chat.rename')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleOpenPersonaDialog(conversation.id)}>
                          <User className="mr-2 h-4 w-4" />
                          {t('chat.persona')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleOpenSaveKnowledgeDialog(conversation.id)}
                        >
                          <BookOpen className="mr-2 h-4 w-4" />
                          {t('chat.saveKnowledge')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(conversation.id)}>
                          <Copy className="mr-2 h-4 w-4" />
                          {t('chat.duplicate')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleCompress(conversation.id)}>
                          <FileArchive className="mr-2 h-4 w-4" />
                          {t('chat.compress')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(conversation.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('chat.delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Persona Selection Dialog */}
      <Dialog open={personaDialogOpen} onOpenChange={setPersonaDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t('chat.selectPersona')}</DialogTitle>
            <DialogDescription>{t('chat.selectPersonaDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            {/* None option */}
            <button
              onClick={() => handleSetPersona(null)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors hover:bg-accent',
                !selectedConversation?.personaId && 'bg-accent border-primary'
              )}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <X className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 text-left">
                <div className="font-medium">{t('chat.noPersona')}</div>
                <div className="text-xs text-muted-foreground">{t('chat.noPersonaDesc')}</div>
              </div>
              {!selectedConversation?.personaId && <Check className="h-5 w-5 text-primary" />}
            </button>

            {/* Persona options */}
            {personas.map((persona) => (
              <button
                key={persona.id}
                onClick={() => handleSetPersona(persona.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors hover:bg-accent',
                  selectedConversation?.personaId === persona.id && 'bg-accent border-primary'
                )}
              >
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full text-lg"
                  style={{ backgroundColor: `${persona.color}20` }}
                >
                  {persona.avatar}
                </div>
                <div className="flex-1 text-left">
                  <div className="font-medium">{getPersonaDisplayText(persona, 'name')}</div>
                  <div className="text-xs text-muted-foreground line-clamp-1">
                    {getPersonaDisplayText(persona, 'description')}
                  </div>
                </div>
                {selectedConversation?.personaId === persona.id && (
                  <Check className="h-5 w-5 text-primary" />
                )}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Save Knowledge Dialog */}
      <SaveKnowledgeDialog
        open={saveKnowledgeDialogOpen}
        onOpenChange={setSaveKnowledgeDialogOpen}
        conversation={knowledgeConversation}
        messages={knowledgeMessages}
        onSave={handleSaveKnowledge}
      />

      {/* Compress Conversation Dialog */}
      <CompressConversationDialog
        open={compressDialogOpen}
        onOpenChange={setCompressDialogOpen}
        conversation={compressConversation}
        messages={compressMessages}
        onCompress={handleCompressConversation}
      />
    </>
  );
}
