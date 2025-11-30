/**
 * 시스템 메시지 생성 유틸리티
 */

const VISUALIZATION_INSTRUCTIONS = `# 시각화 기능

응답에 다이어그램이나 차트를 포함할 때 다음 형식을 사용할 수 있습니다:

## Mermaid 다이어그램
\`\`\`mermaid
graph TD
    A[시작] --> B[처리]
    B --> C[종료]
\`\`\`

지원하는 Mermaid 타입: flowchart, sequenceDiagram, classDiagram, stateDiagram, erDiagram, gantt, pie 등

## Plotly 차트
\`\`\`plotly
{
  "data": [{
    "x": [1, 2, 3, 4, 5],
    "y": [2, 5, 3, 8, 6],
    "type": "scatter",
    "mode": "lines+markers",
    "name": "데이터"
  }],
  "layout": {
    "title": "차트 제목",
    "xaxis": {"title": "X축"},
    "yaxis": {"title": "Y축"}
  }
}
\`\`\`

지원하는 Plotly 타입: scatter, bar, pie, line, heatmap, histogram, box, violin, scatter3d 등

데이터 분석, 통계, 수치 비교가 필요한 질문에는 적극적으로 Plotly 차트를 활용하세요.
프로세스나 구조 설명이 필요하면 Mermaid 다이어그램을 사용하세요.`;

/**
 * 기본 시스템 메시지 생성
 */
export function createBaseSystemMessage(additionalContext?: string): string {
  let content = `당신은 도움이 되는 AI 어시스턴트입니다.\n\n${VISUALIZATION_INSTRUCTIONS}`;

  if (additionalContext) {
    content += `\n\n${additionalContext}`;
  }

  return content;
}

/**
 * Vision 모델용 간단한 시스템 메시지 생성
 * (긴 시각화 예제는 제외 - Ollama vision 호환성을 위해)
 */
export function createVisionSystemMessage(): string {
  return '당신은 도움이 되는 AI 어시스턴트입니다. 이미지를 분석하고 사용자의 질문에 답변하세요.';
}

/**
 * RAG용 시스템 메시지 생성
 */
export function createRAGSystemMessage(documents: any[]): string {
  const context =
    documents.length > 0
      ? documents
          .map((doc, i) => {
            const title = doc.metadata?.title || '제목 없음';
            const source = doc.metadata?.source || 'manual';
            return `[문서 ${i + 1}: ${source} - ${title}]\n${doc.content}`;
          })
          .join('\n\n')
      : '';

  const ragInstructions = context
    ? `# 문서 컨텍스트\n\n다음 문서들을 참고하여 사용자의 질문에 답변하세요. 문서의 정보를 바탕으로 정확하게 답변하되, 출처 표기는 하지 마세요. 참조된 문서는 자동으로 표시됩니다.\n\n${context}`
    : '';

  return createBaseSystemMessage(ragInstructions);
}
