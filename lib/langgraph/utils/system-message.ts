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

## Plotly 차트 (중요: JSON 형식만 사용!)

**⚠️ 절대 Python 코드(import plotly, px.pie() 등)를 사용하지 마세요!**
**반드시 아래와 같이 JSON 데이터 형식으로 작성해야 차트가 렌더링됩니다.**

### 예제 1: 선 차트 (Scatter)
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

### 예제 2: 파이 차트 (Pie)
\`\`\`plotly
{
  "data": [{
    "labels": ["사과", "바나나", "오렌지", "포도"],
    "values": [45, 30, 15, 10],
    "type": "pie",
    "hole": 0.4,
    "textinfo": "percent+label"
  }],
  "layout": {
    "title": "과일 판매 비율"
  }
}
\`\`\`

### 예제 3: 막대 차트 (Bar)
\`\`\`plotly
{
  "data": [{
    "x": ["A", "B", "C", "D"],
    "y": [20, 35, 30, 25],
    "type": "bar"
  }],
  "layout": {
    "title": "막대 차트"
  }
}
\`\`\`

지원하는 Plotly 타입: scatter, bar, pie, line, heatmap, histogram, box, violin, scatter3d 등

**핵심 규칙:**
- \`\`\`plotly 블록 안에는 **순수 JSON 데이터만** 작성
- Python import문, px.pie(), fig.show() 등의 **코드는 절대 사용 금지**
- JSON 데이터는 자동으로 인터랙티브 차트로 렌더링됨

시각화 도구는 **사용자의 이해를 돕거나 데이터의 패턴을 파악하는 데 필수적인 경우에만** 사용하세요.

가이드라인:
- **데이터가 복잡할 때만 사용**: 단순한 수치 나열이나 간단한 비교는 텍스트나 표(Markdown Table)를 사용하는 것이 더 명확하고 빠릅니다.
- **억지로 사용하지 않기**: 모든 답변에 시각화를 포함할 필요는 없습니다. 텍스트로 충분히 설명 가능한 경우 시각화를 생략하세요.
- **Mermaid**: 복잡한 워크플로우, 시스템 아키텍처, 클래스 관계 등 구조적인 설명이 필요할 때 선택적으로 사용하세요.
- **Plotly**: 5개 이상의 데이터 포인트가 있거나, 추세/분포/상관관계를 보여주는 것이 중요한 경우에만 사용하세요.`;

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
  if (documents.length === 0) {
    return createBaseSystemMessage();
  }

  // 문서 컨텍스트를 명확하게 구조화
  const context = documents
    .map((doc, i) => {
      const title = doc.metadata?.title || '제목 없음';
      const source = doc.metadata?.source || 'manual';
      const folderPath = doc.metadata?.folderPath || '';
      const folderInfo = folderPath ? ` (폴더: ${folderPath})` : '';

      return `[문서 ${i + 1}] ${title} (출처: ${source})${folderInfo}\n${doc.content}`;
    })
    .join('\n\n---\n\n');

  // RAG 지시사항을 더 강력하게 작성
  const ragInstructions = `# 중요: 반드시 아래 문서들을 참고하여 답변하세요!

다음은 사용자의 질문과 관련된 문서들입니다. **반드시 이 문서들의 내용을 기반으로** 답변을 작성하세요.

## 답변 작성 규칙
1. **문서의 정보를 최대한 활용**하여 구체적으로 답변
2. 문서에 없는 내용은 일반 지식으로 보완 가능하지만, 문서 내용을 우선시
3. 출처 표기는 하지 마세요 (자동으로 표시됨)
4. 문서의 내용을 그대로 복사하지 말고, 자연스럽게 재구성하여 설명

## 참조 문서들

${context}

---

위 문서들의 내용을 바탕으로 사용자의 질문에 답변하세요.`;

  return createBaseSystemMessage(ragInstructions);
}
