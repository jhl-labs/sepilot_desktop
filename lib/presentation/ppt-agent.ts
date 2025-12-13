import { generateId } from '@/lib/utils';
import { LLMService } from '@/lib/llm/service';
import type {
  PresentationSlide,
  PresentationAgentState,
  PresentationBrief,
  PresentationDesignMaster,
  PresentationStructure,
  PresentationWorkflowStep,
} from '@/types/presentation';
import type { Message } from '@/types';

import { logger } from '@/lib/utils/logger';
export interface PresentationAgentCallbacks {
  onToken?: (chunk: string) => void;
  onStateUpdate?: (state: PresentationAgentState) => void;
  onSlides?: (slides: PresentationSlide[]) => void;
  signal?: AbortSignal;
}

export interface PresentationAgentOptions {
  /** 전체 슬라이드를 한번에 자동 생성할지 여부 */
  bulkCreation?: boolean;
}

type ChatMessage = Message;

/**
 * Step별 시스템 프롬프트 생성
 */
function getStepPrompt(
  step: PresentationWorkflowStep,
  state: PresentationAgentState,
  userLanguage: 'ko' | 'en' | 'ja' | 'zh',
  options?: PresentationAgentOptions
): string {
  const lang = userLanguage;

  const prompts = {
    briefing: {
      ko: `# 단계: 브리핑 수집

당신은 친절한 프레젠테이션 디자이너입니다. 사용자와 대화하며 프레젠테이션 요구사항을 파악하세요.

## 현재 목표
사용자로부터 다음 정보를 수집하세요:
1. **주제**: 무엇에 대한 프레젠테이션인가요?
2. **목적**: 설득? 정보 전달? 교육?
3. **청중**: 누구를 위한 발표인가요? (임원, 개발자, 학생 등)
4. **슬라이드 수**: 몇 장 정도 필요한가요? (기본 8장)
5. **발표 시간**: 몇 분 분량인가요? (선택사항)

## 대화 스타일
- 한 번에 모든 걸 묻지 마세요
- 사용자가 이미 말한 정보는 다시 묻지 마세요
- 자연스럽게 부족한 정보만 물어보세요
- 사용자가 "다 말했어" 또는 "이제 만들어줘"라고 하면 다음 단계로 넘어가세요

## 응답 형식
대화형으로 응답하고, 정보가 충분히 모이면:

\`\`\`json
{
  "action": "complete_briefing",
  "brief": {
    "topic": "...",
    "purpose": "...",
    "audience": "...",
    "slideCount": 8,
    "language": "ko"
  }
}
\`\`\`

정보가 부족하면 계속 대화하세요.`,
      en: `# Step: Briefing Collection

You are a friendly presentation designer. Have a conversation to understand the user's needs.

## Current Goal
Collect the following information:
1. **Topic**: What is this presentation about?
2. **Purpose**: Persuade? Inform? Educate?
3. **Audience**: Who is this for? (executives, developers, students, etc.)
4. **Slide count**: How many slides? (default 8)
5. **Duration**: How many minutes? (optional)

## Conversation Style
- Don't ask everything at once
- Don't repeat questions about info already provided
- Naturally ask only what's missing
- When user says "that's all" or "let's create it", move to next step

## Response Format
Respond conversationally, and when you have enough info:

\`\`\`json
{
  "action": "complete_briefing",
  "brief": {
    "topic": "...",
    "purpose": "...",
    "audience": "...",
    "slideCount": 8,
    "language": "en"
  }
}
\`\`\`

If info is insufficient, continue the conversation.`,
    },

    'design-master': {
      ko: `# 단계: 디자인 마스터 설정

브리핑 정보:
- 주제: ${state.brief?.topic}
- 청중: ${state.brief?.audience || '일반'}
- 목적: ${state.brief?.purpose || '정보 전달'}

## 현재 목표
사용자와 함께 프레젠테이션의 **통일된 디자인 시스템**을 만드세요:

1. **분위기 (Vibe)**: 어떤 느낌을 원하나요?
   - 예: "프로페셔널하고 모던한", "다크 테크 느낌", "따뜻하고 친근한", "미니멀 화이트"

2. **색상 (Color Palette)**: 선호하는 색상이 있나요?
   - 메인 색상, 강조 색상, 배경색, 텍스트 색상
   - 예: 다크 배경 (#0f172a) + 네온 블루 강조 (#0ea5e9)

3. **폰트 (Typography)**: 어떤 스타일의 폰트를 원하나요?
   - 제목: 굵고 임팩트 있는 vs 우아하고 세련된
   - 본문: 깔끔하고 읽기 쉬운
   - 예: "Sora Bold / Inter Regular", "Playfair Display / Source Sans Pro"

4. **레이아웃 선호**: 이미지 많이 vs 텍스트 위주 vs 균형

## 제안 방식
사용자의 주제와 청중을 고려해 **3가지 디자인 옵션**을 제안하고, 사용자가 선택하거나 커스터마이징하게 하세요.

**IMPORTANT**: 옵션을 제안할 때 반드시 아래 JSON 형식으로 옵션들을 함께 제공하세요.

예:
"${state.brief?.topic}"에 어울리는 디자인을 3가지 제안드립니다:

**Option 1: Dark Tech** 🌃
- 다크 네이비 배경 + 네온 블루/퍼플 강조
- Sora Bold / Inter Regular
- 현대적이고 기술적인 느낌

**Option 2: Minimal White** ⚪
- 화이트 배경 + 블랙/그레이 텍스트 + 포인트 컬러
- Helvetica / Roboto
- 깔끔하고 전문적

**Option 3: Warm Organic** 🌿
- 크림/베이지 배경 + 오렌지/브라운 강조
- Playfair Display / Source Sans Pro
- 따뜻하고 친근한 느낌

어떤 스타일이 마음에 드시나요? 또는 다른 아이디어가 있으신가요?

\`\`\`json
{
  "action": "propose_design_options",
  "options": [
    {
      "name": "Dark Tech",
      "vibe": "modern tech professional",
      "palette": { "primary": "#0ea5e9", "accent": "#7c3aed", "background": "#0f172a", "text": "#ffffff" },
      "fonts": { "title": "Sora Bold", "body": "Inter Regular", "titleSize": "large" }
    },
    {
      "name": "Minimal White",
      "vibe": "clean professional minimal",
      "palette": { "primary": "#000000", "accent": "#3b82f6", "background": "#ffffff", "text": "#000000" },
      "fonts": { "title": "Helvetica Bold", "body": "Roboto Regular", "titleSize": "medium" }
    },
    {
      "name": "Warm Organic",
      "vibe": "warm friendly approachable",
      "palette": { "primary": "#ea580c", "accent": "#78350f", "background": "#fef3c7", "text": "#78350f" },
      "fonts": { "title": "Playfair Display Bold", "body": "Source Sans Pro", "titleSize": "large" }
    }
  ]
}
\`\`\`

## 응답 형식
옵션 제안 시: 위의 propose_design_options 액션 사용

사용자가 선택하거나 승인하면:

\`\`\`json
{
  "action": "complete_design_master",
  "designMaster": {
    "name": "Dark Tech",
    "vibe": "modern tech professional",
    "palette": {
      "primary": "#0ea5e9",
      "accent": "#7c3aed",
      "background": "#0f172a",
      "text": "#ffffff"
    },
    "fonts": {
      "title": "Sora Bold",
      "body": "Inter Regular",
      "titleSize": "large"
    },
    "layoutPreferences": {
      "imageStyle": "balanced"
    }
  }
}
\`\`\``,
      en: `# Step: Design Master Setup

Briefing:
- Topic: ${state.brief?.topic}
- Audience: ${state.brief?.audience || 'general'}
- Purpose: ${state.brief?.purpose || 'inform'}

## Current Goal
Work with the user to create a **unified design system**:

1. **Vibe**: What feeling do you want?
   - e.g., "professional modern", "dark tech", "warm friendly", "minimal white"

2. **Color Palette**: Preferred colors?
   - Primary, accent, background, text colors
   - e.g., Dark bg (#0f172a) + Neon blue accent (#0ea5e9)

3. **Typography**: Font style?
   - Title: bold impactful vs elegant sophisticated
   - Body: clean readable
   - e.g., "Sora Bold / Inter Regular"

4. **Layout preference**: Image-heavy vs text-heavy vs balanced

## Suggestion Approach
Propose **3 design options** based on topic and audience, let user choose or customize.

**IMPORTANT**: When proposing options, provide them in JSON format as shown below.

Example:
"Here are 3 design suggestions for '${state.brief?.topic}':

**Option 1: Dark Tech** 🌃
- Dark navy background + neon blue/purple accents
- Sora Bold / Inter Regular
- Modern and technical

**Option 2: Minimal White** ⚪
- White background + black/gray text + accent color
- Helvetica / Roboto
- Clean and professional

**Option 3: Warm Organic** 🌿
- Cream/beige background + orange/brown accents
- Playfair Display / Source Sans Pro
- Warm and friendly

Which style do you prefer? Or do you have other ideas?"

\`\`\`json
{
  "action": "propose_design_options",
  "options": [
    {
      "name": "Dark Tech",
      "vibe": "modern tech professional",
      "palette": { "primary": "#0ea5e9", "accent": "#7c3aed", "background": "#0f172a", "text": "#ffffff" },
      "fonts": { "title": "Sora Bold", "body": "Inter Regular", "titleSize": "large" }
    },
    {
      "name": "Minimal White",
      "vibe": "clean professional minimal",
      "palette": { "primary": "#000000", "accent": "#3b82f6", "background": "#ffffff", "text": "#000000" },
      "fonts": { "title": "Helvetica Bold", "body": "Roboto Regular", "titleSize": "medium" }
    },
    {
      "name": "Warm Organic",
      "vibe": "warm friendly approachable",
      "palette": { "primary": "#ea580c", "accent": "#78350f", "background": "#fef3c7", "text": "#78350f" },
      "fonts": { "title": "Playfair Display Bold", "body": "Source Sans Pro", "titleSize": "large" }
    }
  ]
}
\`\`\`

## Response Format
When proposing options: Use propose_design_options action above

When user chooses or approves:

\`\`\`json
{
  "action": "complete_design_master",
  "designMaster": {
    "name": "Dark Tech",
    "vibe": "modern tech professional",
    "palette": {
      "primary": "#0ea5e9",
      "accent": "#7c3aed",
      "background": "#0f172a",
      "text": "#ffffff"
    },
    "fonts": {
      "title": "Sora Bold",
      "body": "Inter Regular",
      "titleSize": "large"
    }
  }
}
\`\`\``,
    },

    structure: {
      ko: `# 단계: 슬라이드 구조 계획

브리핑:
- 주제: ${state.brief?.topic}
- 슬라이드 수: ${state.brief?.slideCount || 8}장
- 청중: ${state.brief?.audience || '일반'}
- 목적: ${state.brief?.purpose || '정보 전달'}

디자인:
- 스타일: ${state.designMaster?.name || state.designMaster?.vibe}
- 색상: ${state.designMaster?.palette.primary} / ${state.designMaster?.palette.accent}

## 현재 목표
${state.brief?.slideCount || 8}장의 슬라이드 **구조(목차)**를 만들어 사용자와 함께 검토하고 확정하세요.

⚠️ **중요**: 우측에 디자인 템플릿이 표시되고 있습니다. 사용자는 선택한 디자인을 보면서 구조를 결정할 수 있습니다.

## 구조 제안 방식
각 슬라이드마다 **상세하게** 설명하세요:

1. **슬라이드 번호와 제목**: 명확하고 구체적인 제목
2. **레이아웃**: 어떤 레이아웃을 사용할지 (hero, title-body, two-column, timeline, grid, stats, quote 등)
3. **목적**: 이 슬라이드가 전달할 핵심 메시지
4. **담을 내용**: 어떤 내용이 들어갈지 2-3개 핵심 포인트
5. **이유**: 왜 이 순서에 이 슬라이드가 필요한지

### 제안 형식 예시:
"${state.brief?.topic}"을 ${state.brief?.slideCount || 8}장으로 구성해봤습니다:

---
**슬라이드 1: ${state.brief?.topic} 소개** 🎬
- **레이아웃**: Hero (전체 화면 강조)
- **목적**: 주제를 강렬하게 소개하고 청중의 관심 유도
- **담을 내용**:
  • 프레젠테이션 제목
  • 핵심 가치 제안 (한 문장)
  • 발표자 정보
- **이유**: 첫인상이 중요하므로 hero 레이아웃으로 임팩트 있게 시작

---
**슬라이드 2: 문제 정의** 📊
- **레이아웃**: Title-Body (제목 + 내용)
- **목적**: 해결하려는 문제를 명확히 제시
- **담을 내용**:
  • 현재 상황 설명
  • 문제의 심각성 (통계/데이터)
  • 청중에게 미치는 영향
- **이유**: 솔루션을 제시하기 전에 문제 인식이 필요

---
**슬라이드 3: 솔루션 개요** 💡
- **레이아웃**: Two-Column (좌우 비교)
- **목적**: 우리의 접근 방법을 간결하게 제시
- **담을 내용**:
  • 왼쪽: 기존 방식의 한계
  • 오른쪽: 우리의 새로운 접근
  • 핵심 차별점
- **이유**: 비교를 통해 솔루션의 가치를 명확히 전달

---
... (나머지 슬라이드도 동일한 형식으로)

---

이 구조가 괜찮으신가요?
- 슬라이드 순서를 바꾸고 싶으신가요?
- 추가하거나 제거할 슬라이드가 있나요?
- 특정 슬라이드의 내용이나 레이아웃을 변경하고 싶으신가요?

**사용자와 충분히 논의하고 합의한 후에만 구조를 확정하세요!**

## 응답 형식
사용자가 승인하면:

\`\`\`json
{
  "action": "complete_structure",
  "structure": {
    "totalSlides": 8,
    "outline": [
      { "index": 0, "title": "...", "layout": "hero", "keyPoints": ["..."] },
      { "index": 1, "title": "...", "layout": "title-body", "keyPoints": ["..."] },
      ...
    ]
  }
}
\`\`\`

사용자가 수정 요청하면 대화로 조율하세요.`,
      en: `# Step: Structure Planning

⚠️ **Important**: The design template is displayed on the right side. Users can see the selected design while deciding on the structure.

Briefing:
- Topic: ${state.brief?.topic}
- Slide count: ${state.brief?.slideCount || 8}
- Audience: ${state.brief?.audience || 'general'}

Design:
- Style: ${state.designMaster?.name || state.designMaster?.vibe}

## Current Goal
Create a **structure (outline)** for ${state.brief?.slideCount || 8} slides and confirm with user.

## How to Propose Structure
For each slide, explain **in detail**:

1. **Slide Number & Title**: Clear and specific title
2. **Layout**: Which layout to use
3. **Purpose**: Core message this slide will deliver
4. **Content**: 2-3 key points that will be included
5. **Reasoning**: Why this slide is needed in this order

**Example:**

### Slide 3: Our Solution 💡
- **Layout**: Two-Column (left-right comparison)
- **Purpose**: Present our approach concisely
- **Content**:
  • Left: Limitations of existing methods
  • Right: Our new approach
  • Key differentiators
- **Reasoning**: Clearly communicate solution value through comparison

---
... (same format for remaining slides)

---

Does this structure work for you?
- Would you like to change the slide order?
- Any slides to add or remove?
- Want to modify content or layout of specific slides?

**Only finalize the structure after thorough discussion and agreement with the user!**

## Response Format
When user approves:

\`\`\`json
{
  "action": "complete_structure",
  "structure": {
    "totalSlides": 8,
    "outline": [
      { "index": 0, "title": "...", "layout": "hero", "keyPoints": ["..."] },
      { "index": 1, "title": "...", "layout": "title-body", "keyPoints": ["..."] },
      ...
    ]
  }
}
\`\`\`

If user requests changes, negotiate through conversation.`,
    },

    'slide-creation': {
      ko: `# 단계: 슬라이드 작성

## ⚠️ 필수 규칙: 승인된 구조를 정확히 따르세요
사용자와 함께 만든 아래 구조에서 **절대로 벗어나지 마세요**:
${state.structure?.outline.map((s) => `${s.index + 1}. ${s.title} (${s.layout})`).join('\n')}

- 위 구조에 없는 슬라이드는 **절대 생성 금지**
- 제목, 레이아웃, 순서를 **정확히** 따르세요
- 사용자가 명시적으로 요청하지 않으면 구조를 변경하지 마세요

디자인 마스터:
- 색상: ${state.designMaster?.palette.primary} (메인), ${state.designMaster?.palette.accent} (강조)
- 폰트: ${state.designMaster?.fonts.title} / ${state.designMaster?.fonts.body}
- 분위기: ${state.designMaster?.vibe}

${
  state.webSearchEnabled
    ? `**웹검색 활성화됨** 🌐
- 주제와 관련된 최신 정보, 통계, 사실을 웹검색을 통해 확인하세요
- 정확한 수치, 날짜, 인용구가 필요한 경우 반드시 검색 후 사용하세요
- 검색 결과를 바탕으로 더 신뢰할 수 있는 내용을 작성하세요
- 검색한 정보의 출처를 슬라이드 노트나 하단에 간단히 표기하세요`
    : `**웹검색 비활성화됨**
- 일반적인 지식과 주제에 대한 이해를 바탕으로 내용을 작성하세요
- 구체적인 통계나 수치는 예시로 표현하세요 (예: "약 70%", "최근 연구에 따르면")
- 실제 데이터가 필요한 경우 사용자에게 확인을 요청할 수 있습니다`
}

## 현재 목표
${
  options?.bulkCreation
    ? `**모든 슬라이드를 한번에 자동 생성**하세요.`
    : `**슬라이드 ${(state.currentSlideIndex || 0) + 1}/${state.structure?.totalSlides || 0}**를 작성하세요.`
}

${
  state.currentSlideIndex !== undefined && state.structure && !options?.bulkCreation
    ? `
### 지금 만들어야 할 슬라이드 (구조 ${state.currentSlideIndex + 1}번)
**제목**: "${state.structure.outline[state.currentSlideIndex]?.title}"
**레이아웃**: ${state.structure.outline[state.currentSlideIndex]?.layout}
**핵심 포인트**: ${state.structure.outline[state.currentSlideIndex]?.keyPoints?.join(', ') || '(구조에서 계획한 내용으로 작성)'}

⚠️ **이 슬라이드만 만드세요. 다른 슬라이드는 생성하지 마세요!**
`
    : ''
}

## 작성 방식
${
  options?.bulkCreation
    ? `**BULK CREATION MODE**: 사용자가 "전체 자동 생성" 또는 "모두 만들어줘"라고 요청했습니다.

1. **즉시 모든 슬라이드를 순서대로 생성**하세요
   - ⚠️ **중요**: slideIndex는 0부터 시작해서 순차적으로 증가시켜야 합니다 (0, 1, 2, 3, ...)
   - 구조의 outline 배열 순서대로 정확히 생성하세요
   - 각 슬라이드를 create_slide 액션으로 생성
   - 사용자 확인 없이 연속으로 생성
   - 구조의 제목, 레이아웃, keyPoints를 활용
   - 주제와 청중에 맞는 내용을 자동 작성
   - 적절한 이미지 프롬프트 생성

2. 모든 슬라이드 생성 후 complete_all_slides 액션 전송

3. 간단한 완료 메시지와 함께 결과 전달`
    : `**INTERACTIVE MODE**: 사용자와 대화하며 한 장씩 생성합니다.

1. **현재 슬라이드만 생성**:
   - ⚠️ **중요**: slideIndex는 currentSlideIndex 값(${state.currentSlideIndex || 0})을 **반드시** 사용
   - ⚠️ **중요**: 구조에서 정의한 제목 "${state.structure?.outline[state.currentSlideIndex || 0]?.title}"을 **정확히** 사용
   - ⚠️ **중요**: 레이아웃 "${state.structure?.outline[state.currentSlideIndex || 0]?.layout}"을 **반드시** 사용
   - 구조에서 계획한 내용을 바탕으로 슬라이드 작성
   - 적절한 이미지 프롬프트 생성

2. **사용자가 구체적 내용 제공 시**:
   - 구조의 제목과 레이아웃은 유지하고 내용만 사용자 요청대로 수정

3. **응답 형식**:
   - 생성한 슬라이드를 간단히 설명
   - 다음 슬라이드 정보 미리보기: "${state.structure?.outline[(state.currentSlideIndex || 0) + 1]?.title || '(마지막 슬라이드)'}"
   - "다음 슬라이드를 만들까요?" 물어보기`
}

## 응답 형식
슬라이드를 생성하면:

\`\`\`json
{
  "action": "create_slide",
  "slideIndex": ${state.currentSlideIndex || 0},
  "slide": {
    "title": "...",
    "subtitle": "...",
    "bullets": ["...", "...", "..."],
    "layout": "${state.structure?.outline[state.currentSlideIndex || 0]?.layout || 'title-body'}",
    "accentColor": "${state.designMaster?.palette.accent}",
    "backgroundColor": "${state.designMaster?.palette.background}",
    "textColor": "${state.designMaster?.palette.text}",
    "titleFont": "${state.designMaster?.fonts.title}",
    "bodyFont": "${state.designMaster?.fonts.body}",
    "imagePrompt": "professional image for ${state.structure?.outline[state.currentSlideIndex || 0]?.title}, ${state.designMaster?.vibe} style",
    "vibe": "${state.designMaster?.vibe}"
  }
}
\`\`\`

${options?.bulkCreation ? '**BULK MODE에서는 여러 개의 create_slide 액션을 연속으로 생성**하세요.\n\n' : ''}모든 슬라이드가 완성되면:
\`\`\`json
{ "action": "complete_all_slides" }
\`\`\``,
      en: `# Step: Slide Creation

## ⚠️ CRITICAL RULE: Follow the Approved Structure Exactly
**NEVER deviate** from the structure created with the user:
${state.structure?.outline.map((s) => `${s.index + 1}. ${s.title} (${s.layout})`).join('\n')}

- **NEVER create slides not in this structure**
- Follow titles, layouts, and order **exactly**
- Do not modify structure unless user explicitly requests

Design Master:
- Colors: ${state.designMaster?.palette.primary} (primary), ${state.designMaster?.palette.accent} (accent)
- Fonts: ${state.designMaster?.fonts.title} / ${state.designMaster?.fonts.body}
- Vibe: ${state.designMaster?.vibe}

## Current Goal
${
  options?.bulkCreation
    ? `**Generate ALL slides automatically at once**.`
    : `Create **Slide ${(state.currentSlideIndex || 0) + 1}/${state.structure?.totalSlides || 0}**.`
}

${
  state.currentSlideIndex !== undefined && state.structure && !options?.bulkCreation
    ? `
### Slide to Create Now (Structure #${state.currentSlideIndex + 1})
**Title**: "${state.structure.outline[state.currentSlideIndex]?.title}"
**Layout**: ${state.structure.outline[state.currentSlideIndex]?.layout}
**Key Points**: ${state.structure.outline[state.currentSlideIndex]?.keyPoints?.join(', ') || '(Use planned content from structure)'}

⚠️ **Create ONLY this slide. Do not create other slides!**
`
    : ''
}

## Creation Process
${
  options?.bulkCreation
    ? `**BULK CREATION MODE**: User requested "generate all" or "create all slides".

1. **Immediately generate all slides in sequence**
   - ⚠️ **IMPORTANT**: slideIndex must start from 0 and increment sequentially (0, 1, 2, 3, ...)
   - Create slides in exact order of structure outline array
   - Create each slide with create_slide action
   - No user confirmation needed between slides
   - Use title, layout, and keyPoints from structure
   - Write content appropriate for topic and audience
   - Create suitable image prompts

2. Send complete_all_slides action after all slides

3. Provide brief completion message with results`
    : `**INTERACTIVE MODE**: Create one slide at a time with user.

1. **Create ONLY the current slide**:
   - ⚠️ **CRITICAL**: slideIndex MUST be currentSlideIndex value (${state.currentSlideIndex || 0})
   - ⚠️ **CRITICAL**: Use EXACT title from structure: "${state.structure?.outline[state.currentSlideIndex || 0]?.title}"
   - ⚠️ **CRITICAL**: Use EXACT layout from structure: "${state.structure?.outline[state.currentSlideIndex || 0]?.layout}"
   - Write content based on planned structure
   - Create suitable image prompts

2. **When user provides specific content**:
   - Keep structure title and layout, modify content only per user request

3. **Response format**:
   - Briefly explain the created slide
   - Preview next slide: "${state.structure?.outline[(state.currentSlideIndex || 0) + 1]?.title || '(Last slide)'}"
   - Ask "Shall I create the next slide?"`
}

## Response Format
When creating a slide:

\`\`\`json
{
  "action": "create_slide",
  "slideIndex": ${state.currentSlideIndex || 0},
  "slide": {
    "title": "...",
    "subtitle": "...",
    "bullets": ["...", "...", "..."],
    "layout": "${state.structure?.outline[state.currentSlideIndex || 0]?.layout || 'title-body'}",
    "accentColor": "${state.designMaster?.palette.accent}",
    "backgroundColor": "${state.designMaster?.palette.background}",
    "textColor": "${state.designMaster?.palette.text}",
    "titleFont": "${state.designMaster?.fonts.title}",
    "bodyFont": "${state.designMaster?.fonts.body}",
    "imagePrompt": "professional image for ${state.structure?.outline[state.currentSlideIndex || 0]?.title}, ${state.designMaster?.vibe} style",
    "vibe": "${state.designMaster?.vibe}"
  }
}
\`\`\`

${options?.bulkCreation ? '**In BULK MODE, generate multiple create_slide actions consecutively**.\n\n' : ''}When all slides are done:
\`\`\`json
{ "action": "complete_all_slides" }
\`\`\``,
    },

    review: {
      ko: `# 단계: 검토 및 수정

생성된 슬라이드: ${state.slides.length}장

${
  state.webSearchEnabled
    ? `**웹검색 활성화됨** 🌐
- 슬라이드 내용의 정확성을 웹검색으로 검증할 수 있습니다
- 잘못된 정보, 오래된 통계, 부정확한 날짜 등을 확인하고 수정하세요`
    : ''
}

## 현재 목표
사용자와 함께 프레젠테이션을 검토하고 수정하세요.

## 가능한 작업
1. **일반 수정**
   - "슬라이드 3 수정해줘" → 특정 슬라이드 수정
   - "전체적으로 색상을 더 밝게" → 디자인 마스터 수정
   - "슬라이드 2와 3 사이에 새 슬라이드 추가" → 슬라이드 추가
   - "슬라이드 5 삭제" → 슬라이드 삭제

2. **내용 검증/보정** ${state.webSearchEnabled ? '(웹검색 사용 가능)' : '(일반 지식 기반)'}
   - "모든 슬라이드의 데이터 정확성 확인해줘" → 전체 검증
   - "슬라이드 4의 통계가 맞는지 확인해줘" → 특정 슬라이드 검증
   - "틀린 내용 찾아서 수정해줘" → 오류 찾기 및 자동 수정
   ${
     state.webSearchEnabled
       ? '- 웹검색을 통해 최신 정보로 업데이트하고 출처를 명시합니다'
       : '- 일반 지식을 바탕으로 명백한 오류를 수정합니다'
   }

3. **완료**
   - "완료" → 최종 완료

## 응답 형식
수정 작업:
\`\`\`json
{
  "action": "modify_slide",
  "slideIndex": 2,
  "modifications": { "title": "...", "bullets": [...], ... }
}
\`\`\`

검증 작업 (웹검색 결과나 일반 지식 기반):
\`\`\`json
{
  "action": "verify_and_correct",
  "slideIndex": 2,
  "findings": "슬라이드 2의 통계 수치가 2020년 데이터입니다. 최신 2025년 데이터로 업데이트했습니다.",
  "modifications": { "bullets": ["업데이트된 내용..."] }
}
\`\`\`

완료:
\`\`\`json
{ "action": "finalize_presentation" }
\`\`\``,
      en: `# Step: Review and Revise

Generated slides: ${state.slides.length}

## Current Goal
Review and revise the presentation with the user.

## Possible Actions
- "Revise slide 3" → Modify specific slide
- "Make colors brighter overall" → Update design master
- "Add new slide between 2 and 3" → Insert slide
- "Delete slide 5" → Remove slide
- "Done" → Finalize

## Response Format
Modify:
\`\`\`json
{
  "action": "modify_slide",
  "slideIndex": 2,
  "modifications": { "title": "...", ... }
}
\`\`\`

Finalize:
\`\`\`json
{ "action": "finalize_presentation" }
\`\`\``,
    },

    complete: {
      ko: '프레젠테이션이 완성되었습니다! 내보내기 하시거나 추가 수정이 필요하면 말씀해주세요.',
      en: 'Presentation complete! Export it or let me know if you need any changes.',
      ja: 'プレゼンテーションが完成しました！エクスポートするか、追加の変更が必要な場合はお知らせください。',
      zh: '演示文稿完成！导出或告诉我是否需要任何更改。',
    },
  };

  const stepPrompts = prompts[step];
  if (!stepPrompts) {
    return '';
  }

  // lang에 해당하는 프롬프트가 있으면 반환, 없으면 en 또는 ko 반환
  return stepPrompts[lang as keyof typeof stepPrompts] || stepPrompts.en || stepPrompts.ko || '';
}

/**
 * 사용자 언어 감지
 */
function detectLanguage(text: string): 'ko' | 'en' | 'ja' | 'zh' {
  const lowerText = text.toLowerCase();

  // 1순위: 명시적 언어 지정
  if (
    lowerText.includes('in english') ||
    lowerText.includes('영어로') ||
    lowerText.includes('english version')
  ) {
    return 'en';
  }
  if (
    lowerText.includes('in japanese') ||
    lowerText.includes('일본어로') ||
    lowerText.includes('日本語で')
  ) {
    return 'ja';
  }
  if (
    lowerText.includes('in chinese') ||
    lowerText.includes('중국어로') ||
    lowerText.includes('中文')
  ) {
    return 'zh';
  }

  // 2순위: 작성 언어 감지
  const koreanChars = text.match(/[가-힣]/g);
  if (koreanChars && koreanChars.length / text.length > 0.3) {
    return 'ko';
  }

  const japaneseChars = text.match(/[ぁ-んァ-ン]/g);
  if (japaneseChars && japaneseChars.length / text.length > 0.2) {
    return 'ja';
  }

  const chineseChars = text.match(/[\u4e00-\u9fa5]/g);
  if (chineseChars && chineseChars.length / text.length > 0.2) {
    return 'zh';
  }

  const englishChars = text.match(/[a-zA-Z]/g);
  if (englishChars && englishChars.length / text.length > 0.5) {
    return 'en';
  }

  return 'ko';
}

/**
 * LLM 응답에서 JSON Action 추출
 */
function extractAction(text: string): Record<string, any> | null {
  try {
    // ```json ... ``` 블록 찾기 (non-greedy에서 최대한 긴 매치로 변경)
    const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)```/);
    if (jsonBlockMatch) {
      const jsonContent = jsonBlockMatch[1].trim();
      try {
        const parsed = JSON.parse(jsonContent);
        if (parsed.action) {
          logger.info('[ppt-agent] Successfully parsed JSON from code block');
          return parsed;
        }
      } catch (e) {
        console.warn('[ppt-agent] Failed to parse JSON from code block:', e);
      }
    }

    // 직접 JSON 객체 찾기 (중괄호 균형 맞추기)
    const startIndex = text.indexOf('{');
    if (startIndex !== -1) {
      let depth = 0;
      let endIndex = -1;

      for (let i = startIndex; i < text.length; i++) {
        if (text[i] === '{') {
          depth++;
        }
        if (text[i] === '}') {
          depth--;
          if (depth === 0) {
            endIndex = i + 1;
            break;
          }
        }
      }

      if (endIndex !== -1) {
        const jsonStr = text.substring(startIndex, endIndex);
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.action) {
            logger.info('[ppt-agent] Successfully parsed JSON from direct match');
            return parsed;
          }
        } catch (e) {
          console.warn('[ppt-agent] Failed to parse JSON from direct match:', e);
        }
      }
    }
  } catch (e) {
    console.warn('[ppt-agent] Failed to extract action:', e);
  }

  console.warn('[ppt-agent] No valid action found in response');
  return null;
}

/**
 * 초기 상태 생성
 */
export function createInitialState(): PresentationAgentState {
  return {
    currentStep: 'briefing',
    completedSlideIndices: [],
    slides: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Step-by-Step 대화형 PPT Agent
 */
export async function runPresentationAgent(
  messages: ChatMessage[],
  currentState: PresentationAgentState,
  callbacks: PresentationAgentCallbacks = {},
  options: PresentationAgentOptions = {}
): Promise<{ response: string; state: PresentationAgentState }> {
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  const userLanguage = lastUserMessage ? detectLanguage(lastUserMessage.content) : 'ko';

  // 현재 단계에 맞는 시스템 프롬프트 생성
  const systemPrompt = getStepPrompt(currentState.currentStep, currentState, userLanguage, options);

  const chatHistory: ChatMessage[] = [
    {
      id: generateId(),
      conversation_id: 'presentation-agent',
      role: 'system',
      content: systemPrompt,
      created_at: Date.now(),
    },
    ...messages,
  ];

  let fullResponse = '';

  try {
    for await (const chunk of LLMService.streamChat(chatHistory)) {
      if (callbacks.signal?.aborted) {
        break;
      }
      fullResponse += chunk;
      callbacks.onToken?.(chunk);
    }
  } catch (error) {
    console.error('[ppt-agent] Stream error:', error);
    // 에러 발생 시에도 현재 상태 유지 및 에러 메시지 반환
    const errorMessage =
      error instanceof Error
        ? `오류가 발생했습니다: ${error.message}`
        : '알 수 없는 오류가 발생했습니다.';
    return { response: errorMessage, state: currentState };
  }

  if (callbacks.signal?.aborted) {
    // Abort 시 현재까지의 응답과 상태 반환
    return { response: fullResponse || '응답이 중단되었습니다.', state: currentState };
  }

  // 응답이 비어있는 경우 처리
  if (!fullResponse.trim()) {
    console.warn('[ppt-agent] Empty response from LLM');
    return { response: '응답을 생성할 수 없습니다. 다시 시도해주세요.', state: currentState };
  }

  // LLM 응답에서 Action 추출
  logger.info('[ppt-agent] Full response length:', fullResponse.length);
  logger.info(
    '[ppt-agent] Response preview:',
    fullResponse.substring(0, 200).replace(/\n/g, '\\n')
  );
  const action = extractAction(fullResponse);
  let newState = { ...currentState, updatedAt: Date.now() };

  if (action) {
    logger.info('[ppt-agent] Extracted action:', action.action, action);
    // Action에 따라 상태 업데이트
    switch (action.action) {
      case 'complete_briefing':
        newState = {
          ...newState,
          brief: action.brief as PresentationBrief,
          currentStep: 'design-master',
        };
        callbacks.onStateUpdate?.(newState);
        break;

      case 'propose_design_options':
        // 디자인 옵션 제안 - 상태에 저장하고 사용자 선택 대기
        newState = {
          ...newState,
          designOptions: action.options as PresentationDesignMaster[],
        };
        callbacks.onStateUpdate?.(newState);
        break;

      case 'complete_design_master':
        newState = {
          ...newState,
          designMaster: action.designMaster as PresentationDesignMaster,
          currentStep: 'structure',
        };
        callbacks.onStateUpdate?.(newState);
        break;

      case 'complete_structure':
        newState = {
          ...newState,
          structure: action.structure as PresentationStructure,
          currentStep: 'slide-creation',
          currentSlideIndex: 0,
        };
        callbacks.onStateUpdate?.(newState);
        break;

      case 'create_slide': {
        const slideData = action.slide;
        logger.info('[ppt-agent] Creating slide with data:', slideData);
        const newSlide: PresentationSlide = {
          id: generateId(),
          ...slideData,
        };
        logger.info('[ppt-agent] Generated slide with ID:', newSlide.id);

        const requestedIndex = action.slideIndex ?? newState.currentSlideIndex ?? 0;
        logger.info(
          '[ppt-agent] Requested slide index:',
          requestedIndex,
          'Current slides array length:',
          newState.slides.length
        );

        // 슬라이드를 순차적으로 배열 끝에 추가 (순서 유지)
        const newSlides = [...newState.slides, newSlide];

        const completed = [...newState.completedSlideIndices];
        if (!completed.includes(requestedIndex)) {
          completed.push(requestedIndex);
        }

        const totalSlides = newState.structure?.totalSlides || 8;
        const nextIndex = requestedIndex + 1;

        newState = {
          ...newState,
          slides: newSlides,
          completedSlideIndices: completed,
          currentSlideIndex: nextIndex < totalSlides ? nextIndex : undefined,
          currentStep: nextIndex < totalSlides ? 'slide-creation' : 'review',
        };

        logger.info(
          '[ppt-agent] Created slide at array position',
          newSlides.length - 1,
          '(requested index:',
          requestedIndex,
          ') Total slides:',
          newSlides.length
        );
        callbacks.onSlides?.(newSlides);
        callbacks.onStateUpdate?.(newState);
        break;
      }

      case 'complete_all_slides':
        newState = {
          ...newState,
          currentStep: 'review',
        };
        callbacks.onStateUpdate?.(newState);
        break;

      case 'modify_slide': {
        const slideIndex = action.slideIndex;
        const modifications = action.modifications;
        const newSlides = [...newState.slides];

        // 인덱스 유효성 검증
        if (slideIndex < 0 || slideIndex >= newSlides.length) {
          console.warn(
            `[ppt-agent] Invalid slide index ${slideIndex} for modification (total: ${newSlides.length})`
          );
          break;
        }

        if (newSlides[slideIndex]) {
          newSlides[slideIndex] = {
            ...newSlides[slideIndex],
            ...modifications,
          };
          newState = { ...newState, slides: newSlides };
          callbacks.onSlides?.(newSlides);
          callbacks.onStateUpdate?.(newState);
        }
        break;
      }

      case 'verify_and_correct': {
        // 슬라이드 검증 및 보정 (modify_slide와 동일하게 처리하되 findings 정보 포함)
        const slideIndex = action.slideIndex;
        const modifications = action.modifications;
        const findings = action.findings; // 검증 결과 메시지
        const newSlides = [...newState.slides];

        // 인덱스 유효성 검증
        if (slideIndex < 0 || slideIndex >= newSlides.length) {
          console.warn(
            `[ppt-agent] Invalid slide index ${slideIndex} for verification (total: ${newSlides.length})`
          );
          break;
        }

        if (newSlides[slideIndex]) {
          newSlides[slideIndex] = {
            ...newSlides[slideIndex],
            ...modifications,
          };
          newState = { ...newState, slides: newSlides };
          callbacks.onSlides?.(newSlides);
          callbacks.onStateUpdate?.(newState);
        }

        // findings는 응답 메시지에 포함되어 사용자에게 전달됨
        logger.info('[ppt-agent] Verification findings:', findings);
        break;
      }

      case 'finalize_presentation':
        newState = {
          ...newState,
          currentStep: 'complete',
        };
        callbacks.onStateUpdate?.(newState);
        break;
    }
  }

  callbacks.onStateUpdate?.(newState);

  return { response: fullResponse, state: newState };
}
