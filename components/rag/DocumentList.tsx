'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileText,
  Trash2,
  RefreshCw,
  Edit,
  Download,
  Upload,
  LayoutGrid,
  List as ListIcon,
  FolderTree,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FolderPlus,
  Search,
  X,
  User,
  Users,
  Github,
  Loader2,
} from 'lucide-react';
import {
  getAllDocuments,
  exportDocuments,
  importDocuments,
  updateDocumentMetadata,
  getAllEmptyFolders,
  createEmptyFolder,
  deleteEmptyFolder,
} from '@/lib/vectordb/client';
import { VectorDocument, DocumentTreeNode } from '@/lib/vectordb/types';
import { TeamDocsConfig, GitHubSyncConfig } from '@/types';
import { FolderManageDialog } from './FolderManageDialog';
import { DocsSyncDialog } from './DocsSyncDialog';

import { logger } from '@/lib/utils/logger';
type ViewMode = 'grid' | 'list' | 'tree';

interface DocumentListProps {
  onDelete?: (ids: string[]) => Promise<void>;
  onEdit?: (doc: VectorDocument) => void;
  onRefresh?: (refreshFn: () => Promise<void>) => void;
  disabled?: boolean;
}

export function DocumentList({ onDelete, onEdit, onRefresh, disabled = false }: DocumentListProps) {
  const { t } = useTranslation();
  const [documents, setDocuments] = useState<VectorDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('tree');
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [draggedDoc, setDraggedDoc] = useState<VectorDocument | null>(null);
  const [emptyFolders, setEmptyFolders] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'personal' | 'team'>('personal');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Team Docs 관련 상태
  const [teamDocs, setTeamDocs] = useState<TeamDocsConfig[]>([]);
  const [selectedTeamDocsId, setSelectedTeamDocsId] = useState<string>('');
  const [personalRepo, setPersonalRepo] = useState<GitHubSyncConfig | null>(null);
  const [syncingTeamId, setSyncingTeamId] = useState<string | null>(null);
  const [syncingPersonal, setSyncingPersonal] = useState<'pull' | 'push' | null>(null);

  // 빈 폴더 로드 (VectorDB에서)
  const loadEmptyFolders = async () => {
    try {
      const folders = await getAllEmptyFolders();
      setEmptyFolders(folders);
    } catch (error) {
      console.error('Failed to load empty folders:', error);
    }
  };

  // 빈 폴더 추가 (VectorDB에 저장)
  const addEmptyFolder = async (folderPath: string) => {
    try {
      await createEmptyFolder(folderPath);
      await loadEmptyFolders(); // 다시 로드
    } catch (error) {
      console.error('Failed to add empty folder:', error);
      throw error;
    }
  };

  // 빈 폴더 삭제 (VectorDB에서)
  const removeEmptyFolder = async (folderPath: string) => {
    try {
      await deleteEmptyFolder(folderPath);
      await loadEmptyFolders(); // 다시 로드
    } catch (error) {
      console.error('Failed to remove empty folder:', error);
      throw error;
    }
  };

  // 문서 필터링 (Personal 또는 특정 Team Docs)
  const filterByActiveTab = (docs: VectorDocument[]): VectorDocument[] => {
    if (activeTab === 'personal') {
      // Personal Docs만 표시
      return docs.filter((doc) => {
        const docGroup = doc.metadata?.docGroup || 'personal';
        return docGroup === 'personal';
      });
    } else {
      // Team 탭: 선택된 Team Docs만 표시
      if (!selectedTeamDocsId) {
        return [];
      }
      return docs.filter((doc) => {
        return doc.metadata?.teamDocsId === selectedTeamDocsId;
      });
    }
  };

  // 검색 필터링
  const filterDocuments = (docs: VectorDocument[]): VectorDocument[] => {
    // 먼저 activeTab으로 필터링 (Personal 또는 특정 Team Docs)
    const filtered = filterByActiveTab(docs);

    if (!searchQuery.trim()) {
      return filtered;
    }

    const query = searchQuery.toLowerCase();

    return filtered.filter((doc) => {
      // 제목 검색
      const title = doc.metadata?.title?.toLowerCase() || '';
      if (title.includes(query)) {
        return true;
      }

      // 폴더 경로 검색
      const folderPath = doc.metadata?.folderPath?.toLowerCase() || '';
      if (folderPath.includes(query)) {
        return true;
      }

      // 내용 검색 (청크 포함)
      if (doc.content.toLowerCase().includes(query)) {
        return true;
      }

      // 청크 내용 검색
      const chunks = doc.metadata?._chunks || [];
      for (const chunk of chunks) {
        if (chunk.content && chunk.content.toLowerCase().includes(query)) {
          return true;
        }
      }

      return false;
    });
  };

  const loadDocuments = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const allDocs = await getAllDocuments();

      // 특수 문서 (폴더 등) 필터링 - 실제 문서만
      const docs = allDocs.filter((doc) => doc.metadata?._docType !== 'folder');

      // 청크된 문서들을 원본 문서 단위로 그룹화
      const groupedDocs = new Map<string, VectorDocument>();

      for (const doc of docs) {
        const originalId = doc.metadata?.originalId || doc.id;
        const chunkIndex = doc.metadata?.chunkIndex ?? 0;

        if (groupedDocs.has(originalId)) {
          // 기존 그룹에 청크 추가
          const existingDoc = groupedDocs.get(originalId)!;
          const chunks = existingDoc.metadata._chunks || [];
          chunks.push({ index: chunkIndex, content: doc.content });
          chunks.sort((a: any, b: any) => a.index - b.index);
          existingDoc.metadata._chunks = chunks;
        } else {
          // 새 그룹 생성
          groupedDocs.set(originalId, {
            ...doc,
            id: originalId,
            metadata: {
              ...doc.metadata,
              originalId,
              _chunks: [{ index: chunkIndex, content: doc.content }],
            },
          });
        }
      }

      // 청크들을 합쳐서 최종 문서 리스트 생성
      const mergedDocs = Array.from(groupedDocs.values()).map((doc) => {
        const chunks = doc.metadata._chunks || [];
        const mergedContent = chunks.map((c: any) => c.content).join('\n');
        return {
          ...doc,
          content: mergedContent,
        };
      });

      setDocuments(mergedDocs);
      logger.info(
        `[DocumentList] Loaded ${docs.length} chunks, grouped into ${mergedDocs.length} documents`
      );
      logger.info(
        '[DocumentList] Documents with folderPath:',
        mergedDocs.map((d) => ({
          id: d.id,
          title: d.metadata?.title,
          folderPath: d.metadata?.folderPath,
        }))
      );
    } catch (error: any) {
      console.error('Failed to load documents:', error);
      setMessage({ type: 'error', text: error.message || t('documents.errors.loadFailed') });
    } finally {
      setIsLoading(false);
    }
  };

  // Team Docs 설정 로드
  const loadTeamDocsConfigs = async () => {
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.config) {
        const result = await window.electronAPI.config.load();
        logger.info('[DocumentList] Config load result:', result);
        if (result.success && result.data) {
          if (result.data.teamDocs) {
            logger.info('[DocumentList] Team Docs loaded:', result.data.teamDocs);
            setTeamDocs(result.data.teamDocs);
            // 첫 번째 Team Docs를 기본 선택
            if (result.data.teamDocs.length > 0) {
              setSelectedTeamDocsId(result.data.teamDocs[0].id);
            }
          } else {
            logger.info('[DocumentList] No teamDocs in config');
          }
          if (result.data.githubSync) {
            setPersonalRepo(result.data.githubSync);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load team docs configs:', error);
    }
  };

  // 전체 새로고침 함수 (문서 + Team Docs 설정)
  const handleFullRefresh = useCallback(async () => {
    await loadDocuments();
    await loadEmptyFolders();
    await loadTeamDocsConfigs();
  }, []);

  useEffect(() => {
    handleFullRefresh();
    if (onRefresh) {
      onRefresh(handleFullRefresh);
    }
  }, [handleFullRefresh, onRefresh]);

  // teamDocs 변경 감지
  useEffect(() => {
    logger.info('[DocumentList] teamDocs state updated:', teamDocs.length, 'teams');
    teamDocs.forEach((team) => {
      logger.info(`  - ${team.name} (${team.id})`);
    });
  }, [teamDocs]);

  const handleDelete = async (id: string) => {
    if (!onDelete) {
      return;
    }
    if (!window.confirm(t('documents.delete.confirm'))) {
      return;
    }

    try {
      // 원본 문서 ID와 매칭되는 모든 청크 ID 찾기
      const allDocs = await getAllDocuments();
      const chunkIdsToDelete = allDocs
        .filter((doc) => {
          const originalId = doc.metadata?.originalId || doc.id;
          return originalId === id;
        })
        .map((doc) => doc.id);

      // 모든 청크 삭제
      await onDelete(chunkIdsToDelete.length > 0 ? chunkIdsToDelete : [id]);
      setMessage({ type: 'success', text: t('documents.delete.success') });
      await loadDocuments(); // Reload list
    } catch (error: any) {
      console.error('Failed to delete document:', error);
      setMessage({ type: 'error', text: error.message || t('documents.errors.deleteFailed') });
    }
  };

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedDocs);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedDocs(newExpanded);
  };

  const handleExport = async () => {
    try {
      setIsLoading(true);
      setMessage(null);

      const exportData = await exportDocuments();

      // JSON 파일 다운로드
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vectordb-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessage({
        type: 'success',
        text: t('documents.export.success', { count: exportData.totalCount }),
      });
    } catch (error: any) {
      console.error('Failed to export documents:', error);
      setMessage({ type: 'error', text: error.message || t('documents.errors.exportFailed') });
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      setIsLoading(true);
      setMessage(null);

      const text = await file.text();
      const exportData = JSON.parse(text);

      // Import 실행 (중복 시 overwrite)
      const result = await importDocuments(exportData, { overwrite: true });

      setMessage({
        type: 'success',
        text: t('documents.import.success', {
          imported: result.imported,
          overwritten: result.overwritten,
          skipped: result.skipped,
        }),
      });

      // 문서 목록 새로고침
      await loadDocuments();
    } catch (error: any) {
      console.error('Failed to import documents:', error);
      setMessage({ type: 'error', text: error.message || t('documents.errors.importFailed') });
    } finally {
      setIsLoading(false);
      // 파일 입력 초기화
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 문서를 Tree 구조로 변환
  const buildDocumentTree = (docs: VectorDocument[]): DocumentTreeNode[] => {
    const folderMap = new Map<string, DocumentTreeNode>();
    const rootNodes: DocumentTreeNode[] = [];

    // 0. 빈 폴더부터 생성
    emptyFolders.forEach((folderPath) => {
      const pathParts = folderPath.split('/').filter((p) => p.trim());
      let currentPath = '';

      pathParts.forEach((part, index) => {
        const parentPath = currentPath;
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        if (!folderMap.has(currentPath)) {
          const folderNode: DocumentTreeNode = {
            id: `folder:${currentPath}`,
            type: 'folder',
            name: part,
            children: [],
            isExpanded: expandedFolders.has(`folder:${currentPath}`),
            parentId: parentPath ? `folder:${parentPath}` : null,
          };
          folderMap.set(currentPath, folderNode);

          // 부모에 추가
          if (parentPath && folderMap.has(parentPath)) {
            folderMap.get(parentPath)!.children!.push(folderNode);
          } else if (index === 0) {
            rootNodes.push(folderNode);
          }
        }
      });
    });

    // 1. 폴더 경로를 기반으로 폴더 노드 생성
    docs.forEach((doc) => {
      const folderPath = doc.metadata?.folderPath as string | undefined;
      if (folderPath) {
        const pathParts = folderPath.split('/').filter((p) => p.trim());
        let currentPath = '';

        pathParts.forEach((part, index) => {
          const parentPath = currentPath;
          currentPath = currentPath ? `${currentPath}/${part}` : part;

          if (!folderMap.has(currentPath)) {
            const folderNode: DocumentTreeNode = {
              id: `folder:${currentPath}`,
              type: 'folder',
              name: part,
              children: [],
              isExpanded: expandedFolders.has(`folder:${currentPath}`),
              parentId: parentPath ? `folder:${parentPath}` : null,
            };
            folderMap.set(currentPath, folderNode);

            // 부모에 추가
            if (parentPath && folderMap.has(parentPath)) {
              folderMap.get(parentPath)!.children!.push(folderNode);
            } else if (index === 0) {
              rootNodes.push(folderNode);
            }
          }
        });
      }
    });

    // 2. 문서를 해당 폴더 또는 루트에 추가
    docs.forEach((doc) => {
      const folderPath = doc.metadata?.folderPath as string | undefined;
      const docNode: DocumentTreeNode = {
        id: doc.id,
        type: 'document',
        name: (doc.metadata?.title as string) || t('documents.untitled'),
        document: doc,
        parentId: folderPath ? `folder:${folderPath}` : null,
      };

      if (folderPath && folderMap.has(folderPath)) {
        folderMap.get(folderPath)!.children!.push(docNode);
      } else {
        rootNodes.push(docNode);
      }
    });

    // 3. 정렬 (폴더 먼저, 그 다음 문서)
    const sortNodes = (nodes: DocumentTreeNode[]): DocumentTreeNode[] => {
      return nodes.sort((a, b) => {
        if (a.type === 'folder' && b.type === 'document') {
          return -1;
        }
        if (a.type === 'document' && b.type === 'folder') {
          return 1;
        }
        return a.name.localeCompare(b.name);
      });
    };

    const sortTree = (node: DocumentTreeNode) => {
      if (node.children && node.children.length > 0) {
        node.children = sortNodes(node.children);
        node.children.forEach(sortTree);
      }
    };

    const sortedRoot = sortNodes(rootNodes);
    sortedRoot.forEach(sortTree);

    return sortedRoot;
  };

  const toggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  // 폴더 삭제 핸들러
  const handleDeleteFolder = async (folderPath: string) => {
    try {
      // 빈 폴더인지 확인
      if (!emptyFolders.includes(folderPath)) {
        // 문서가 있는 폴더인지 확인
        const hasDocuments = documents.some((doc) => {
          const docFolderPath = doc.metadata?.folderPath as string | undefined;
          return docFolderPath === folderPath || docFolderPath?.startsWith(`${folderPath}/`);
        });

        if (hasDocuments) {
          setMessage({
            type: 'error',
            text: t('documents.folder.deleteNotEmpty'),
          });
          return;
        }
      }

      // 빈 폴더 목록에서 제거
      await removeEmptyFolder(folderPath);

      setMessage({
        type: 'success',
        text: t('documents.folder.deleteSuccess', { folderPath }),
      });
    } catch (error: any) {
      console.error('Failed to delete folder:', error);
      setMessage({
        type: 'error',
        text: error.message || t('documents.errors.folderDeleteFailed'),
      });
    }
  };

  // 폴더 생성 핸들러
  const handleCreateFolder = async (folderPath: string) => {
    try {
      // 빈 폴더 목록에 추가
      const trimmedPath = folderPath.trim();
      if (!trimmedPath) {
        setMessage({ type: 'error', text: t('documents.folder.pathRequired') });
        return;
      }

      // 이미 존재하는 폴더인지 확인
      if (emptyFolders.includes(trimmedPath)) {
        setMessage({ type: 'error', text: t('documents.folder.alreadyExists') });
        return;
      }

      // 문서에서 사용 중인 폴더인지 확인
      const existingFolder = documents.some((doc) => {
        const docFolderPath = doc.metadata?.folderPath as string | undefined;
        return docFolderPath === trimmedPath || docFolderPath?.startsWith(`${trimmedPath}/`);
      });

      if (existingFolder) {
        setMessage({ type: 'error', text: t('documents.folder.hasDocuments') });
        return;
      }

      // 빈 폴더 추가
      await addEmptyFolder(trimmedPath);

      setMessage({
        type: 'success',
        text: t('documents.folder.createSuccess', { folderPath: trimmedPath }),
      });
    } catch (error: any) {
      console.error('Failed to create folder:', error);
      setMessage({
        type: 'error',
        text: error.message || t('documents.errors.folderCreateFailed'),
      });
    }
  };

  // 문서를 폴더로 이동
  const handleMoveToFolder = async (doc: VectorDocument, targetFolderPath: string) => {
    try {
      setIsLoading(true);
      setMessage(null);

      // 원본 문서 ID와 매칭되는 모든 청크 ID 찾기
      const allDocs = await getAllDocuments();
      const chunkIdsToUpdate = allDocs
        .filter((d) => {
          const originalId = d.metadata?.originalId || d.id;
          return originalId === doc.id;
        })
        .map((d) => d.id);

      // 업데이트할 ID 목록 (청크가 있으면 청크들, 없으면 원본 문서)
      const idsToUpdate = chunkIdsToUpdate.length > 0 ? chunkIdsToUpdate : [doc.id];

      // 모든 청크의 메타데이터 업데이트
      for (const id of idsToUpdate) {
        const docToUpdate = allDocs.find((d) => d.id === id);
        if (docToUpdate) {
          const updatedMetadata = {
            ...docToUpdate.metadata,
            folderPath: targetFolderPath,
          };
          await updateDocumentMetadata(id, updatedMetadata);
        }
      }

      // 빈 폴더 목록에서 제거 (문서가 있으면 더 이상 빈 폴더가 아님)
      if (emptyFolders.includes(targetFolderPath)) {
        await removeEmptyFolder(targetFolderPath);
      }

      setMessage({
        type: 'success',
        text: t('documents.move.success', {
          title: doc.metadata?.title || doc.id,
          folderPath: targetFolderPath,
        }),
      });

      // 문서 목록 새로고침
      await loadDocuments();
    } catch (error: any) {
      console.error('Failed to move document:', error);
      setMessage({ type: 'error', text: error.message || t('documents.errors.moveFailed') });
    } finally {
      setIsLoading(false);
    }
  };

  // 드래그 시작
  const handleDragStart = (e: React.DragEvent, doc: VectorDocument) => {
    setDraggedDoc(doc);
    e.dataTransfer.effectAllowed = 'move';
  };

  // 드래그 종료
  const handleDragEnd = () => {
    setDraggedDoc(null);
  };

  // 드롭 허용
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // 드롭 처리
  const handleDrop = (e: React.DragEvent, targetFolderPath: string) => {
    e.preventDefault();
    if (draggedDoc) {
      handleMoveToFolder(draggedDoc, targetFolderPath);
    }
  };

  // 문서 카드 렌더링 (공통)
  const renderDocumentCard = (doc: VectorDocument, compact: boolean = false) => {
    const isExpanded = expandedDocs.has(doc.id);
    const content = doc.content || '';
    const contentPreview = content.slice(0, 150);
    const hasMore = content.length > 150;

    return (
      <div
        key={doc.id}
        draggable={viewMode === 'tree'}
        onDragStart={(e) => handleDragStart(e, doc)}
        onDragEnd={handleDragEnd}
        className={`rounded-md border bg-card hover:bg-accent/50 transition-colors ${
          compact ? 'p-3' : 'p-4 min-h-[180px]'
        } ${viewMode === 'tree' ? 'cursor-move' : ''}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <h4 className={`font-medium truncate ${compact ? 'text-xs' : 'text-sm'}`}>
                {doc.metadata?.title || t('documents.untitled')}
              </h4>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              {doc.metadata?.docGroup === 'team' ? (
                <>
                  <Users className="h-3 w-3 inline mr-1" />
                  {t('documents.labels.team')}: {(doc.metadata?.teamName as string) || 'Unknown'}
                  {' • '}
                  {t('documents.labels.source')}: {(doc.metadata?.source as string) || 'manual'}
                </>
              ) : (
                <>
                  <User className="h-3 w-3 inline mr-1" />
                  {t('documents.labels.personalDoc')}
                  {doc.metadata?.source && (doc.metadata.source as string) !== 'manual' && (
                    <>
                      {' '}
                      • {t('documents.labels.source')}: {doc.metadata.source as string}
                    </>
                  )}
                </>
              )}
              {doc.metadata?.cleaned && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  {t('documents.labels.llmCleaned')}
                </span>
              )}
              {doc.metadata?.docGroup === 'team' && !!doc.metadata?.modifiedLocally && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                  {t('documents.labels.modifiedLocally')}
                </span>
              )}
              {' • '}
              {doc.metadata?.uploadedAt
                ? new Date(doc.metadata.uploadedAt).toLocaleString('ko-KR')
                : t('documents.labels.unknown')}
            </p>
            {!compact && (
              <>
                <div
                  className={`text-sm text-muted-foreground ${isExpanded ? '' : 'line-clamp-3 min-h-[60px]'}`}
                >
                  {isExpanded ? content : contentPreview}
                  {!isExpanded && hasMore && '...'}
                </div>
                {hasMore && (
                  <button
                    onClick={() => toggleExpand(doc.id)}
                    className="text-xs text-primary hover:underline mt-1"
                  >
                    {isExpanded ? t('documents.actions.collapse') : t('documents.actions.showMore')}
                  </button>
                )}
              </>
            )}
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit?.(doc)}
              disabled={!onEdit || disabled}
              title={t('documents.actions.edit')}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDelete(doc.id)}
              disabled={!onDelete || disabled}
              title={t('documents.actions.delete')}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // Grid 뷰 렌더링 (기본)
  const renderGridView = () => {
    return (
      <div className="space-y-2">
        {filteredDocuments.map((doc) => renderDocumentCard(doc, false))}
      </div>
    );
  };

  // List 뷰 렌더링 (컴팩트)
  const renderListView = () => {
    return (
      <div className="space-y-1">
        {filteredDocuments.map((doc) => renderDocumentCard(doc, true))}
      </div>
    );
  };

  // Tree 뷰 렌더링
  const renderTreeView = () => {
    const treeNodes = buildDocumentTree(filteredDocuments);

    const renderTreeNode = (node: DocumentTreeNode, level: number = 0): React.ReactNode => {
      const isExpanded = node.type === 'folder' && expandedFolders.has(node.id);
      const paddingLeft = level * 20;

      if (node.type === 'folder') {
        // 폴더 경로 추출 (folder: 접두사 제거)
        const folderPath = node.id.replace(/^folder:/, '');
        const isEmpty = !node.children || node.children.length === 0;

        return (
          <div key={node.id}>
            <div
              className="flex items-center gap-2 p-2 hover:bg-accent rounded-md group"
              style={{ paddingLeft: `${paddingLeft}px` }}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, folderPath)}
            >
              <div
                className="flex items-center gap-2 flex-1 cursor-pointer"
                onClick={() => toggleFolder(node.id)}
              >
                {isExpanded ? (
                  <>
                    <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <FolderOpen className="h-4 w-4 flex-shrink-0 text-amber-500" />
                  </>
                ) : (
                  <>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <Folder className="h-4 w-4 flex-shrink-0 text-amber-500" />
                  </>
                )}
                <span className="text-sm font-medium">{node.name}</span>
                {node.children && node.children.length > 0 && (
                  <span className="text-xs text-muted-foreground">({node.children.length})</span>
                )}
              </div>
              {isEmpty && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteFolder(folderPath);
                  }}
                  title={t('documents.folder.deleteEmpty')}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              )}
            </div>
            {isExpanded && node.children && (
              <div className="mt-1 space-y-1">
                {node.children.map((child) => renderTreeNode(child, level + 1))}
              </div>
            )}
          </div>
        );
      } else {
        // Document node
        return (
          <div key={node.id} style={{ paddingLeft: `${paddingLeft}px` }} className="mt-1">
            {node.document && renderDocumentCard(node.document, true)}
          </div>
        );
      }
    };

    return <div className="space-y-1">{treeNodes.map((node) => renderTreeNode(node, 0))}</div>;
  };

  // Personal Docs Pull 핸들러
  const handlePullPersonalDocs = async () => {
    if (!personalRepo) {
      setMessage({ type: 'error', text: t('documents.personal.setupRequired') });
      return;
    }

    setSyncingPersonal('pull');
    setMessage(null);

    try {
      const result = await window.electronAPI.githubSync.pullDocuments(personalRepo);

      if (result.success && result.documents && result.documents.length > 0) {
        const allDocs = await getAllDocuments();
        const docsToDelete: string[] = [];

        for (const newDoc of result.documents) {
          const matchingDocs = allDocs.filter(
            (existing: any) =>
              existing.metadata?.title === newDoc.title &&
              existing.metadata?.folderPath === newDoc.metadata?.folderPath &&
              existing.metadata?.docGroup !== 'team'
          );
          for (const match of matchingDocs) {
            docsToDelete.push(match.id);
          }
        }

        if (docsToDelete.length > 0) {
          await window.electronAPI.vectorDB.delete(docsToDelete);
        }

        const generateId = () => {
          return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        };

        const documentsWithIds = result.documents.map((doc: any) => ({
          id: generateId(),
          content: doc.content,
          metadata: {
            ...doc.metadata,
            docGroup: 'personal',
            source: `${personalRepo.owner}/${personalRepo.repo}`,
          },
        }));

        const indexResult = await window.electronAPI.vectorDB.indexDocuments(documentsWithIds, {
          chunkSize: 2500,
          chunkOverlap: 250,
          batchSize: 10,
        });

        if (indexResult.success) {
          setMessage({
            type: 'success',
            text: t('documents.personal.syncSuccess', { count: result.documents.length }),
          });
          await loadDocuments();
        } else {
          throw new Error(indexResult.error || t('documents.errors.indexFailed'));
        }
      } else if (result.success && result.documents && result.documents.length === 0) {
        setMessage({ type: 'success', text: t('documents.personal.noDocsToSync') });
      } else {
        throw new Error(result.error || t('documents.errors.fetchFailed'));
      }
    } catch (error: any) {
      console.error('Failed to pull personal docs:', error);
      setMessage({
        type: 'error',
        text: error.message || t('documents.errors.personalSyncFailed'),
      });
    } finally {
      setSyncingPersonal(null);
    }
  };

  // Personal Docs Push 핸들러
  const handlePushPersonalDocs = async () => {
    if (!personalRepo) {
      setMessage({ type: 'error', text: t('documents.personal.setupRequired') });
      return;
    }

    setSyncingPersonal('push');
    setMessage(null);

    try {
      const result = await window.electronAPI.githubSync.syncDocuments(personalRepo);

      if (result.success) {
        setMessage({
          type: 'success',
          text: result.message || t('documents.personal.pushSuccess'),
        });
      } else {
        throw new Error(result.error || t('documents.errors.pushFailed'));
      }
    } catch (error: any) {
      console.error('Failed to push personal docs:', error);
      setMessage({
        type: 'error',
        text: error.message || t('documents.errors.personalPushFailed'),
      });
    } finally {
      setSyncingPersonal(null);
    }
  };

  // Team Docs Pull 핸들러
  const handlePullTeamDoc = async (config: TeamDocsConfig) => {
    setSyncingTeamId(`pull-${config.id}`);
    setMessage(null);

    logger.info('[DocumentList] Starting pull for:', config.name, config.id);
    logger.info('[DocumentList] Config:', config);

    try {
      const result = await window.electronAPI.teamDocs.syncDocuments(config);
      logger.info('[DocumentList] Pull result:', result);

      if (result.success) {
        setMessage({
          type: 'success',
          text: result.message || t('documents.team.pullSuccess', { name: config.name }),
        });
        await loadDocuments();
        await loadTeamDocsConfigs();
      } else {
        throw new Error(result.error || t('documents.errors.syncFailed'));
      }
    } catch (error: any) {
      console.error('Failed to sync team doc:', error);
      setMessage({ type: 'error', text: error.message || t('documents.errors.syncFailed') });
    } finally {
      setSyncingTeamId(null);
    }
  };

  // Team Docs Push 핸들러
  const handlePushTeamDoc = async (config: TeamDocsConfig) => {
    setSyncingTeamId(`push-${config.id}`);
    setMessage(null);

    logger.info('[DocumentList] Pushing to team docs:', config.id, config.name);
    logger.info('[DocumentList] Current documents:', documents.length);
    logger.info(
      '[DocumentList] Documents with this teamDocsId:',
      documents.filter((doc) => doc.metadata?.teamDocsId === config.id).length
    );
    logger.info('[DocumentList] All teamDocsIds:', [
      ...new Set(documents.map((doc) => doc.metadata?.teamDocsId).filter(Boolean)),
    ]);

    try {
      const result = await window.electronAPI.teamDocs.pushDocuments(config);

      if (result.success) {
        setMessage({
          type: 'success',
          text: result.message || t('documents.team.pushSuccess', { name: config.name }),
        });
      } else {
        throw new Error(result.error || t('documents.errors.pushFailed'));
      }
    } catch (error: any) {
      console.error('Failed to push team doc:', error);
      setMessage({ type: 'error', text: error.message || t('documents.errors.pushFailed') });
    } finally {
      setSyncingTeamId(null);
    }
  };

  // 필터링된 문서 목록
  const filteredDocuments = filterDocuments(documents);

  return (
    <div className="space-y-4">
      {/* Personal / Team 탭 */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'personal' | 'team')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="personal" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            {t('documents.tabs.personal')}
          </TabsTrigger>
          <TabsTrigger value="team" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {t('documents.tabs.team')}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Team Docs Repository 선택 */}
      {activeTab === 'team' && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2">
              <Github className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              {teamDocs.length > 0 ? (
                <>
                  <select
                    title="Team Docs Repository"
                    className="flex-1 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm font-medium"
                    value={selectedTeamDocsId}
                    onChange={(e) => setSelectedTeamDocsId(e.target.value)}
                  >
                    {teamDocs.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name} ({team.owner}/{team.repo})
                      </option>
                    ))}
                  </select>
                  {(() => {
                    const currentTeam = teamDocs.find((td) => td.id === selectedTeamDocsId);
                    const teamDocCount = currentTeam ? filteredDocuments.length : 0;
                    const hasModifiedDocs = currentTeam
                      ? filteredDocuments.some((doc) => doc.metadata?.modifiedLocally)
                      : false;
                    return (
                      <>
                        {currentTeam && (
                          <>
                            <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded whitespace-nowrap">
                              {t('documents.labels.count', { count: teamDocCount })}
                            </span>
                            {hasModifiedDocs && (
                              <span className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 px-2 py-1 rounded whitespace-nowrap">
                                {t('documents.labels.modified')}
                              </span>
                            )}
                          </>
                        )}
                      </>
                    );
                  })()}
                </>
              ) : (
                <div className="text-sm text-muted-foreground">
                  {t('documents.team.addRepository')}
                </div>
              )}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {teamDocs.length > 0 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const currentTeam = teamDocs.find((td) => td.id === selectedTeamDocsId);
                      if (currentTeam) {
                        handlePullTeamDoc(currentTeam);
                      }
                    }}
                    disabled={syncingTeamId !== null || isLoading}
                  >
                    {syncingTeamId === `pull-${selectedTeamDocsId}` ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Pull...
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Pull
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const currentTeam = teamDocs.find((td) => td.id === selectedTeamDocsId);
                      if (currentTeam) {
                        handlePushTeamDoc(currentTeam);
                      }
                    }}
                    disabled={syncingTeamId !== null || isLoading}
                  >
                    {syncingTeamId === `push-${selectedTeamDocsId}` ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Push...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Push
                      </>
                    )}
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSyncDialogOpen(true)}
                disabled={isLoading || disabled}
                title={t('documents.sync.settings')}
              >
                <Github className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {teamDocs.length > 0 &&
            (() => {
              const currentTeam = teamDocs.find((td) => td.id === selectedTeamDocsId);
              return (
                currentTeam && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {currentTeam.description || t('documents.team.repositoryDefault')}
                    {currentTeam.lastSyncAt && (
                      <span className="ml-2">
                        • {t('documents.sync.lastSync')}:{' '}
                        {new Date(currentTeam.lastSyncAt).toLocaleString('ko-KR')}
                      </span>
                    )}
                  </p>
                )
              );
            })()}
        </div>
      )}

      {/* Personal Docs Sync Controls */}
      {activeTab === 'personal' && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2">
              <Github className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              {personalRepo ? (
                <div className="text-sm font-medium">
                  {personalRepo.owner}/{personalRepo.repo}
                  <span className="text-muted-foreground ml-2">({personalRepo.branch})</span>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  {t('documents.personal.connectRepository')}
                </div>
              )}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {personalRepo && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePullPersonalDocs}
                    disabled={syncingPersonal !== null || isLoading}
                  >
                    {syncingPersonal === 'pull' ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Pull...
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Pull
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePushPersonalDocs}
                    disabled={syncingPersonal !== null || isLoading}
                  >
                    {syncingPersonal === 'push' ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Push...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Push
                      </>
                    )}
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSyncDialogOpen(true)}
                disabled={isLoading || disabled}
                title={t('documents.sync.settings')}
              >
                <Github className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 검색 바 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder={t('documents.search.placeholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 pr-10"
          disabled={isLoading || disabled}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            title={t('documents.search.clear')}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <FileText className="h-5 w-5" />
          <h3>{t('documents.title')}</h3>
          <span className="text-sm font-normal text-muted-foreground">
            ({t('documents.labels.count', { count: filteredDocuments.length })}
            {searchQuery && ` / ${t('documents.labels.count', { count: documents.length })}`})
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* 뷰 모드 토글 */}
          <div className="flex items-center gap-1 border rounded-md p-0.5">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              disabled={isLoading || disabled}
              title={t('documents.view.grid')}
              className="h-7 px-2"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              disabled={isLoading || disabled}
              title={t('documents.view.list')}
              className="h-7 px-2"
            >
              <ListIcon className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'tree' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('tree')}
              disabled={isLoading || disabled}
              title={t('documents.view.tree')}
              className="h-7 px-2"
            >
              <FolderTree className="h-4 w-4" />
            </Button>
          </div>

          <div className="h-6 w-px bg-border" />

          {/* 폴더 생성 버튼 (트리 뷰에서만 표시) */}
          {viewMode === 'tree' && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFolderDialogOpen(true)}
                disabled={isLoading || disabled}
                title={t('documents.folder.create')}
              >
                <FolderPlus className="h-4 w-4" />
              </Button>
              <div className="h-6 w-px bg-border" />
            </>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isLoading || disabled || documents.length === 0}
            title={t('documents.actions.export')}
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleImportClick}
            disabled={isLoading || disabled}
            title={t('documents.actions.import')}
          >
            <Upload className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={loadDocuments}
            disabled={isLoading || disabled}
            title={t('documents.actions.refresh')}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Hidden file input for import */}
      <input
        title={t('documents.actions.import')}
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleImportFile}
        style={{ display: 'none' }}
      />

      {/* Message */}
      {message && (
        <div
          className={`rounded-md px-3 py-2 text-sm ${
            message.type === 'success'
              ? 'bg-green-500/10 text-green-500'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Document List */}
      {documents.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t('documents.empty.noDocuments')}
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          {searchQuery ? (
            <div className="text-sm text-muted-foreground">
              {t('documents.empty.noSearchResults')}
            </div>
          ) : activeTab === 'team' ? (
            teamDocs.length === 0 ? (
              <div className="space-y-4">
                <Users className="h-12 w-12 mx-auto opacity-20" />
                <div>
                  <p className="text-sm text-muted-foreground">{t('documents.empty.noTeamDocs')}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {t('documents.empty.addTeamDocsHint')}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <Users className="h-12 w-12 mx-auto opacity-20" />
                <div>
                  <p className="text-sm text-muted-foreground">
                    {t('documents.empty.noDocsInRepository', {
                      name: (() => {
                        const currentTeam = teamDocs.find((td) => td.id === selectedTeamDocsId);
                        return currentTeam ? currentTeam.name : '';
                      })(),
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {t('documents.empty.pullOrUploadHint')}
                  </p>
                </div>
              </div>
            )
          ) : (
            <div className="space-y-4">
              <User className="h-12 w-12 mx-auto opacity-20" />
              <div>
                <p className="text-sm text-muted-foreground">
                  {t('documents.empty.noPersonalDocs')}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {t('documents.empty.uploadOrSyncHint')}
                </p>
              </div>
            </div>
          )}
        </div>
      ) : viewMode === 'tree' ? (
        renderTreeView()
      ) : viewMode === 'list' ? (
        renderListView()
      ) : (
        renderGridView()
      )}

      {/* 폴더 관리 다이얼로그 */}
      <FolderManageDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        mode="create"
        onConfirm={handleCreateFolder}
      />

      {/* GitHub Sync 다이얼로그 */}
      <DocsSyncDialog
        open={syncDialogOpen}
        onOpenChange={setSyncDialogOpen}
        onRefresh={handleFullRefresh}
      />
    </div>
  );
}
