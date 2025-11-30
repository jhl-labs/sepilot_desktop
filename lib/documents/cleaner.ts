import { getLLMClient } from '@/lib/llm/client';

/**
 * LLM을 사용하여 문서 내용을 정제합니다
 * HTML 태그, 광고, 불필요한 텍스트를 제거하고 핵심 내용만 추출합니다
 */
export async function cleanDocumentWithLLM(
  content: string,
  metadata: Record<string, any>
): Promise<{ content: string; metadata: Record<string, any> }> {
  try {
    const llmClient = getLLMClient();

    if (!llmClient.isConfigured()) {
      throw new Error('LLM이 설정되지 않았습니다. 먼저 설정에서 LLM을 구성해주세요.');
    }

    const provider = llmClient.getProvider();

    const systemPrompt = `You are a document cleaning assistant. Your task is to:
1. Remove HTML tags, scripts, styles, and other markup
2. Remove advertisements, navigation menus, headers, footers
3. Remove duplicate or redundant content
4. Extract only the main, meaningful content
5. Preserve the original structure and formatting where it adds value
6. Keep code blocks, tables, and lists intact
7. Maintain markdown formatting if present

Output ONLY the cleaned content without any explanation or commentary.`;

    const userPrompt = `Clean and extract the main content from this document:

Title: ${metadata.title || 'Untitled'}
Source: ${metadata.url || metadata.repoUrl || 'Unknown'}

Content:
${content}

---
Provide only the cleaned content:`;

    const response = await provider.chat(
      [
        {
          id: 'system-1',
          role: 'system',
          content: systemPrompt,
          created_at: Date.now(),
        },
        {
          id: 'user-1',
          role: 'user',
          content: userPrompt,
          created_at: Date.now(),
        },
      ],
      {
        temperature: 0.3,
        maxTokens: 4000,
      }
    );

    const cleanedContent = response.content.trim();

    // 정제 전후 길이 비교
    const originalLength = content.length;
    const cleanedLength = cleanedContent.length;
    const reductionPercent = Math.round(((originalLength - cleanedLength) / originalLength) * 100);

    return {
      content: cleanedContent,
      metadata: {
        ...metadata,
        cleaned: true,
        cleanedAt: Date.now(),
        originalLength,
        cleanedLength,
        reductionPercent,
      },
    };
  } catch (error: any) {
    console.error('Failed to clean document with LLM:', error);
    throw new Error(`문서 정제 실패: ${error.message}`);
  }
}

/**
 * 여러 문서를 배치로 정제합니다
 */
export async function cleanDocumentsWithLLM(
  documents: { content: string; metadata: Record<string, any> }[],
  onProgress?: (current: number, total: number) => void
): Promise<{ content: string; metadata: Record<string, any> }[]> {
  const cleanedDocuments: { content: string; metadata: Record<string, any> }[] = [];

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];

    if (onProgress) {
      onProgress(i + 1, documents.length);
    }

    try {
      const cleaned = await cleanDocumentWithLLM(doc.content, doc.metadata);
      cleanedDocuments.push(cleaned);
    } catch (error) {
      console.error(`Failed to clean document ${i + 1}:`, error);
      // 정제 실패 시 원본 유지
      cleanedDocuments.push(doc);
    }
  }

  return cleanedDocuments;
}
