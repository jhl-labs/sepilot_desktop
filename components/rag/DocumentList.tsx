'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
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
} from 'lucide-react';
import {
  getAllDocuments,
  exportDocuments,
  importDocuments,
  updateDocumentMetadata,
} from '@/lib/vectordb/client';
import { VectorDocument, DocumentTreeNode } from '@/lib/vectordb/types';
import { FolderManageDialog } from './FolderManageDialog';

type ViewMode = 'grid' | 'list' | 'tree';

interface DocumentListProps {
  onDelete?: (ids: string[]) => Promise<void>;
  onEdit?: (doc: VectorDocument) => void;
  onRefresh?: (refreshFn: () => Promise<void>) => void;
  disabled?: boolean;
}

export function DocumentList({ onDelete, onEdit, onRefresh, disabled = false }: DocumentListProps) {
  const [documents, setDocuments] = useState<VectorDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [draggedDoc, setDraggedDoc] = useState<VectorDocument | null>(null);
  const [emptyFolders, setEmptyFolders] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 빈 폴더 로드
  const loadEmptyFolders = () => {
    try {
      const stored = localStorage.getItem('sepilot_rag_empty_folders');
      if (stored) {
        setEmptyFolders(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load empty folders:', error);
    }
  };

  // 빈 폴더 저장
  const saveEmptyFolders = (folders: string[]) => {
    try {
      localStorage.setItem('sepilot_rag_empty_folders', JSON.stringify(folders));
      setEmptyFolders(folders);
    } catch (error) {
      console.error('Failed to save empty folders:', error);
    }
  };

  const loadDocuments = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const docs = await getAllDocuments();

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
      console.log(
        `[DocumentList] Loaded ${docs.length} chunks, grouped into ${mergedDocs.length} documents`
      );
      console.log(
        '[DocumentList] Documents with folderPath:',
        mergedDocs.map((d) => ({
          id: d.id,
          title: d.metadata?.title,
          folderPath: d.metadata?.folderPath,
        }))
      );
    } catch (error: any) {
      console.error('Failed to load documents:', error);
      setMessage({ type: 'error', text: error.message || '문서 목록 로드 실패' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
    loadEmptyFolders();
    if (onRefresh) {
      onRefresh(loadDocuments);
    }
  }, []);

  const handleDelete = async (id: string) => {
    if (!onDelete) {
      return;
    }
    if (!window.confirm('이 문서를 삭제하시겠습니까?')) {
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
      setMessage({ type: 'success', text: '문서가 삭제되었습니다.' });
      await loadDocuments(); // Reload list
    } catch (error: any) {
      console.error('Failed to delete document:', error);
      setMessage({ type: 'error', text: error.message || '문서 삭제 실패' });
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
        text: `${exportData.totalCount}개의 문서를 Export했습니다.`,
      });
    } catch (error: any) {
      console.error('Failed to export documents:', error);
      setMessage({ type: 'error', text: error.message || '문서 Export 실패' });
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
        text: `Import 완료: 신규 ${result.imported}개, 덮어쓰기 ${result.overwritten}개, 건너뛰기 ${result.skipped}개`,
      });

      // 문서 목록 새로고침
      await loadDocuments();
    } catch (error: any) {
      console.error('Failed to import documents:', error);
      setMessage({ type: 'error', text: error.message || '문서 Import 실패' });
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
        name: (doc.metadata?.title as string) || '제목 없음',
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
            text: '문서가 있는 폴더는 삭제할 수 없습니다. 먼저 문서를 이동하거나 삭제해주세요.',
          });
          return;
        }
      }

      // 빈 폴더 목록에서 제거
      const newEmptyFolders = emptyFolders.filter((f) => f !== folderPath);
      saveEmptyFolders(newEmptyFolders);

      setMessage({
        type: 'success',
        text: `폴더 "${folderPath}"가 삭제되었습니다.`,
      });
    } catch (error: any) {
      console.error('Failed to delete folder:', error);
      setMessage({ type: 'error', text: error.message || '폴더 삭제 실패' });
    }
  };

  // 폴더 생성 핸들러
  const handleCreateFolder = (folderPath: string) => {
    // 빈 폴더 목록에 추가
    const trimmedPath = folderPath.trim();
    if (!trimmedPath) {
      setMessage({ type: 'error', text: '폴더 경로를 입력해주세요.' });
      return;
    }

    // 이미 존재하는 폴더인지 확인
    if (emptyFolders.includes(trimmedPath)) {
      setMessage({ type: 'error', text: '이미 존재하는 폴더입니다.' });
      return;
    }

    // 문서에서 사용 중인 폴더인지 확인
    const existingFolder = documents.some((doc) => {
      const docFolderPath = doc.metadata?.folderPath as string | undefined;
      return docFolderPath === trimmedPath || docFolderPath?.startsWith(`${trimmedPath}/`);
    });

    if (existingFolder) {
      setMessage({ type: 'error', text: '이미 문서가 있는 폴더입니다.' });
      return;
    }

    // 빈 폴더 추가
    const newEmptyFolders = [...emptyFolders, trimmedPath];
    saveEmptyFolders(newEmptyFolders);

    setMessage({
      type: 'success',
      text: `폴더 "${trimmedPath}"가 생성되었습니다.`,
    });
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
        const newEmptyFolders = emptyFolders.filter((f) => f !== targetFolderPath);
        saveEmptyFolders(newEmptyFolders);
      }

      setMessage({
        type: 'success',
        text: `"${doc.metadata?.title || doc.id}"를 "${targetFolderPath}"로 이동했습니다.`,
      });

      // 문서 목록 새로고침
      await loadDocuments();
    } catch (error: any) {
      console.error('Failed to move document:', error);
      setMessage({ type: 'error', text: error.message || '문서 이동 실패' });
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
                {doc.metadata?.title || '제목 없음'}
              </h4>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              출처: {doc.metadata?.source || 'manual'}
              {doc.metadata?.cleaned && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  LLM 정제됨
                </span>
              )}
              {' • '}
              {doc.metadata?.uploadedAt
                ? new Date(doc.metadata.uploadedAt).toLocaleString('ko-KR')
                : '알 수 없음'}
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
                    {isExpanded ? '접기' : '더 보기'}
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
              title="편집"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDelete(doc.id)}
              disabled={!onDelete || disabled}
              title="삭제"
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
      <div className="space-y-2">{documents.map((doc) => renderDocumentCard(doc, false))}</div>
    );
  };

  // List 뷰 렌더링 (컴팩트)
  const renderListView = () => {
    return <div className="space-y-1">{documents.map((doc) => renderDocumentCard(doc, true))}</div>;
  };

  // Tree 뷰 렌더링
  const renderTreeView = () => {
    const treeNodes = buildDocumentTree(documents);

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
                  title="빈 폴더 삭제"
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <FileText className="h-5 w-5" />
          <h3>업로드된 문서</h3>
          <span className="text-sm font-normal text-muted-foreground">({documents.length}개)</span>
        </div>
        <div className="flex items-center gap-2">
          {/* 뷰 모드 토글 */}
          <div className="flex items-center gap-1 border rounded-md p-0.5">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              disabled={isLoading || disabled}
              title="그리드 뷰"
              className="h-7 px-2"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              disabled={isLoading || disabled}
              title="리스트 뷰"
              className="h-7 px-2"
            >
              <ListIcon className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'tree' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('tree')}
              disabled={isLoading || disabled}
              title="트리 뷰"
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
                title="새 폴더 생성"
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
            title="문서 Export (JSON)"
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleImportClick}
            disabled={isLoading || disabled}
            title="문서 Import (JSON)"
          >
            <Upload className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={loadDocuments}
            disabled={isLoading || disabled}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Hidden file input for import */}
      <input
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
          업로드된 문서가 없습니다.
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
    </div>
  );
}
