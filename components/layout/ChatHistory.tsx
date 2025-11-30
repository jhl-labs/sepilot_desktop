'use client';

import { MessageSquare, Pencil, Trash2, Search, X, User, Check } from 'lucide-react';
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

interface ChatHistoryProps {
  onConversationClick?: () => void;
}

export function ChatHistory({ onConversationClick }: ChatHistoryProps) {
  const {
    conversations,
    activeConversationId,
    setActiveConversation,
    deleteConversation,
    updateConversationTitle,
    updateConversationPersona,
    searchConversations,
    personas,
  } = useChatStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{conversation: Conversation; matchedMessages: Message[]}>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [personaDialogOpen, setPersonaDialogOpen] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
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
    if (window.confirm('이 대화를 삭제하시겠습니까?')) {
      await deleteConversation(id);
    }
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

  const handleSearchResultClick = (conversationId: string) => {
    setActiveConversation(conversationId);
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
            placeholder="대화 검색..."
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
              <p className="text-sm">검색 결과가 없습니다</p>
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
                        {conversation.personaId && (() => {
                          const persona = personas.find(p => p.id === conversation.personaId);
                          return persona?.avatar ? (
                            <span className="text-sm flex-shrink-0">{persona.avatar}</span>
                          ) : null;
                        })()}
                        <h3 className="text-sm font-medium line-clamp-1">
                          {conversation.title}
                        </h3>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(conversation.updated_at)}
                      </p>
                    </div>
                    <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full whitespace-nowrap">
                      {matchedMessages.length}개 일치
                    </span>
                  </div>
                  {matchedMessages.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {matchedMessages.slice(0, 2).map((msg) => (
                        <p key={msg.id} className="text-xs text-muted-foreground line-clamp-2 bg-muted/50 rounded px-2 py-1">
                          {msg.content}
                        </p>
                      ))}
                      {matchedMessages.length > 2 && (
                        <p className="text-xs text-muted-foreground italic">
                          +{matchedMessages.length - 2}개 더...
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
            <p className="text-sm">대화가 없습니다</p>
            <p className="mt-1 text-xs">새 대화를 시작하세요</p>
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={cn(
                  'group relative flex items-center gap-1 rounded-lg transition-colors hover:bg-accent',
                  activeConversationId === conversation.id &&
                    'bg-accent text-accent-foreground'
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
                    <button
                      onClick={() => {
                        setActiveConversation(conversation.id);
                        onConversationClick?.();
                      }}
                      className="flex flex-1 flex-col items-start px-3 py-2 text-left"
                    >
                      <div className="flex items-center gap-1.5 w-full">
                        {conversation.personaId && (() => {
                          const persona = personas.find(p => p.id === conversation.personaId);
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
                          이름 변경
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleOpenPersonaDialog(conversation.id)}
                        >
                          <User className="mr-2 h-4 w-4" />
                          Persona
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(conversation.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          삭제
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
            <DialogTitle>Persona 선택</DialogTitle>
            <DialogDescription>
              이 대화에 적용할 페르소나를 선택하세요
            </DialogDescription>
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
                <div className="font-medium">없음</div>
                <div className="text-xs text-muted-foreground">
                  페르소나를 사용하지 않습니다
                </div>
              </div>
              {!selectedConversation?.personaId && (
                <Check className="h-5 w-5 text-primary" />
              )}
            </button>

            {/* Persona options */}
            {personas.map((persona) => (
              <button
                key={persona.id}
                onClick={() => handleSetPersona(persona.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors hover:bg-accent',
                  selectedConversation?.personaId === persona.id &&
                    'bg-accent border-primary'
                )}
              >
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full text-lg"
                  style={{ backgroundColor: `${persona.color}20` }}
                >
                  {persona.avatar}
                </div>
                <div className="flex-1 text-left">
                  <div className="font-medium">{persona.name}</div>
                  <div className="text-xs text-muted-foreground line-clamp-1">
                    {persona.description}
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
    </>
  );
}
