/**
 * VectorDB Import 헬퍼 함수
 * client.ts와 IPC 핸들러에서 공통 사용
 */

import type { ExportData, VectorDocument } from './types';

export interface ImportHelperOptions {
  overwrite?: boolean;
}

export interface ImportResult {
  imported: number;
  overwritten: number;
  skipped: number;
}

export interface VectorDBOperations {
  getAllDocuments: () => Promise<VectorDocument[]>;
  deleteDocuments: (ids: string[]) => Promise<void>;
  insertDocuments: (docs: VectorDocument[]) => Promise<void>;
}

/**
 * VectorDB Import 로직 (공통)
 * @param exportData Export된 데이터
 * @param operations VectorDB 작업 인터페이스
 * @param options Import 옵션
 */
export async function processImportDocuments(
  exportData: ExportData,
  operations: VectorDBOperations,
  options?: ImportHelperOptions
): Promise<ImportResult> {
  const overwrite = options?.overwrite ?? true;

  const existingDocuments = await operations.getAllDocuments();
  let imported = 0;
  let overwritten = 0;
  let skipped = 0;

  // 중복 판단을 위한 맵 생성
  const existingMap = new Map<string, VectorDocument>();
  for (const doc of existingDocuments) {
    const originalId = doc.metadata?.originalId || doc.id;
    existingMap.set(originalId, doc);

    // title + source 조합도 체크
    if (doc.metadata?.title && doc.metadata?.source) {
      const key = `${doc.metadata.title}::${doc.metadata.source}`;
      existingMap.set(key, doc);
    }
  }

  // Import할 문서 처리
  const documentsToDelete: string[] = [];
  const documentsToInsert: VectorDocument[] = [];

  for (const doc of exportData.documents) {
    const originalId = doc.metadata?.originalId || doc.id;
    const titleSourceKey =
      doc.metadata?.title && doc.metadata?.source
        ? `${doc.metadata.title}::${doc.metadata.source}`
        : null;

    // 중복 체크
    const isDuplicate =
      existingMap.has(originalId) || (titleSourceKey && existingMap.has(titleSourceKey));

    if (isDuplicate) {
      if (overwrite) {
        // 기존 문서의 모든 청크 찾기
        const chunkIdsToDelete = existingDocuments
          .filter((existingDoc) => {
            const existingOriginalId = existingDoc.metadata?.originalId || existingDoc.id;
            return existingOriginalId === originalId;
          })
          .map((d) => d.id);

        documentsToDelete.push(...chunkIdsToDelete);
        documentsToInsert.push(doc);
        overwritten++;
      } else {
        skipped++;
      }
    } else {
      documentsToInsert.push(doc);
      imported++;
    }
  }

  // 기존 문서 삭제 (overwrite 모드)
  if (documentsToDelete.length > 0) {
    await operations.deleteDocuments(documentsToDelete);
  }

  // 새 문서 삽입
  if (documentsToInsert.length > 0) {
    await operations.insertDocuments(documentsToInsert);
  }

  return { imported, overwritten, skipped };
}
