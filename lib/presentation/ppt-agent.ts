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

## 응답 형식
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

## Response Format
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

디자인:
- 스타일: ${state.designMaster?.name || state.designMaster?.vibe}

## 현재 목표
${state.brief?.slideCount || 8}장의 슬라이드 **구조(목차)**를 만들어 사용자와 확인하세요.

## 구조 제안 방식
1. 각 슬라이드의 제목과 목적을 명확히
2. 다양한 레이아웃 사용 (hero, title-body, two-column, timeline, grid, stats, quote 등)
3. 논리적 흐름 (도입 → 본론 → 결론)

예:
"${state.brief?.topic}"을 ${state.brief?.slideCount || 8}장으로 구성해봤습니다:

**슬라이드 1: Opening (Hero)** 🎬
- 제목 슬라이드
- 강렬한 첫인상

**슬라이드 2: 문제 정의 (Title-Body)** 📊
- 현재 상황 / 해결할 문제
- 핵심 데이터

**슬라이드 3: 솔루션 개요 (Two-Column)** 💡
- 우리의 접근 방법
- Before/After 비교

... (나머지 슬라이드)

이 구조가 괜찮으신가요? 수정하고 싶은 부분이 있나요?

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

Briefing:
- Topic: ${state.brief?.topic}
- Slide count: ${state.brief?.slideCount || 8}
- Audience: ${state.brief?.audience || 'general'}

Design:
- Style: ${state.designMaster?.name || state.designMaster?.vibe}

## Current Goal
Create a **structure (outline)** for ${state.brief?.slideCount || 8} slides and confirm with user.

## Structure Proposal
1. Clear title and purpose for each slide
2. Diverse layouts (hero, title-body, two-column, timeline, grid, stats, quote)
3. Logical flow (intro → body → conclusion)

Example:
"Here's a ${state.brief?.slideCount || 8}-slide structure for '${state.brief?.topic}':

**Slide 1: Opening (Hero)** 🎬
- Title slide
- Strong first impression

**Slide 2: Problem Definition (Title-Body)** 📊
- Current situation / Problem to solve
- Key data

**Slide 3: Solution Overview (Two-Column)** 💡
- Our approach
- Before/After comparison

... (remaining slides)

Does this structure work? Any changes needed?"

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

구조:
${state.structure?.outline.map((s) => `${s.index + 1}. ${s.title} (${s.layout})`).join('\n')}

디자인 마스터:
- 색상: ${state.designMaster?.palette.primary} (메인), ${state.designMaster?.palette.accent} (강조)
- 폰트: ${state.designMaster?.fonts.title} / ${state.designMaster?.fonts.body}
- 분위기: ${state.designMaster?.vibe}

## 현재 목표
${
  options?.bulkCreation
    ? `**모든 슬라이드를 한번에 자동 생성**하세요.`
    : `**${state.currentSlideIndex !== undefined ? `슬라이드 ${state.currentSlideIndex + 1}` : '다음 슬라이드'}**를 작성하세요.`
}

${
  state.currentSlideIndex !== undefined && state.structure && !options?.bulkCreation
    ? `
현재 슬라이드 정보:
- 제목: ${state.structure.outline[state.currentSlideIndex]?.title}
- 레이아웃: ${state.structure.outline[state.currentSlideIndex]?.layout}
- 핵심 포인트: ${state.structure.outline[state.currentSlideIndex]?.keyPoints?.join(', ') || '(미정)'}
`
    : ''
}

## 작성 방식
${
  options?.bulkCreation
    ? `**BULK CREATION MODE**: 사용자가 "전체 자동 생성" 또는 "모두 만들어줘"라고 요청했습니다.

1. **즉시 모든 슬라이드를 순서대로 생성**하세요
   - 각 슬라이드를 create_slide 액션으로 생성
   - 사용자 확인 없이 연속으로 생성
   - 구조의 제목, 레이아웃, keyPoints를 활용
   - 주제와 청중에 맞는 내용을 자동 작성
   - 적절한 이미지 프롬프트 생성

2. 모든 슬라이드 생성 후 complete_all_slides 액션 전송

3. 간단한 완료 메시지와 함께 결과 전달`
    : `**INTERACTIVE MODE**: 사용자와 대화하며 한 장씩 생성합니다.

1. **현재 슬라이드 생성**: 즉시 슬라이드를 생성하세요
   - 구조의 제목, 레이아웃, keyPoints를 활용
   - 주제와 청중에 맞는 내용을 자동 작성
   - 적절한 이미지 프롬프트 생성

2. **사용자가 구체적 내용 제공 시**: 해당 내용으로 슬라이드 생성

3. 생성한 슬라이드를 간단히 설명하고 "다음 슬라이드를 만들까요?" 물어보세요`
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

Structure:
${state.structure?.outline.map((s) => `${s.index + 1}. ${s.title} (${s.layout})`).join('\n')}

Design Master:
- Colors: ${state.designMaster?.palette.primary} (primary), ${state.designMaster?.palette.accent} (accent)
- Fonts: ${state.designMaster?.fonts.title} / ${state.designMaster?.fonts.body}
- Vibe: ${state.designMaster?.vibe}

## Current Goal
${
  options?.bulkCreation
    ? `**Generate ALL slides automatically at once**.`
    : `Create **${state.currentSlideIndex !== undefined ? `Slide ${state.currentSlideIndex + 1}` : 'next slide'}**.`
}

${
  state.currentSlideIndex !== undefined && state.structure && !options?.bulkCreation
    ? `
Current slide info:
- Title: ${state.structure.outline[state.currentSlideIndex]?.title}
- Layout: ${state.structure.outline[state.currentSlideIndex]?.layout}
- Key points: ${state.structure.outline[state.currentSlideIndex]?.keyPoints?.join(', ') || '(TBD)'}
`
    : ''
}

## Creation Process
${
  options?.bulkCreation
    ? `**BULK CREATION MODE**: User requested "generate all" or "create all slides".

1. **Immediately generate all slides in sequence**
   - Create each slide with create_slide action
   - No user confirmation needed between slides
   - Use title, layout, and keyPoints from structure
   - Write content appropriate for topic and audience
   - Create suitable image prompts

2. Send complete_all_slides action after all slides

3. Provide brief completion message with results`
    : `**INTERACTIVE MODE**: Create one slide at a time with user.

1. **Generate current slide**: Create immediately
   - Use title, layout, and keyPoints from structure
   - Write content appropriate for topic and audience
   - Create suitable image prompts

2. **When user provides specific content**: Use that content

3. Briefly explain the created slide and ask "Shall I create the next slide?"`
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

## 현재 목표
사용자와 함께 프레젠테이션을 검토하고 수정하세요.

## 가능한 작업
- "슬라이드 3 수정해줘" → 특정 슬라이드 수정
- "전체적으로 색상을 더 밝게" → 디자인 마스터 수정
- "슬라이드 2와 3 사이에 새 슬라이드 추가" → 슬라이드 추가
- "슬라이드 5 삭제" → 슬라이드 삭제
- "완료" → 최종 완료

## 응답 형식
수정 작업:
\`\`\`json
{
  "action": "modify_slide",
  "slideIndex": 2,
  "modifications": { "title": "...", ... }
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
          console.log('[ppt-agent] Successfully parsed JSON from code block');
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
            console.log('[ppt-agent] Successfully parsed JSON from direct match');
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
  console.log('[ppt-agent] Full response length:', fullResponse.length);
  console.log(
    '[ppt-agent] Response preview:',
    fullResponse.substring(0, 200).replace(/\n/g, '\\n')
  );
  const action = extractAction(fullResponse);
  let newState = { ...currentState, updatedAt: Date.now() };

  if (action) {
    console.log('[ppt-agent] Extracted action:', action.action, action);
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
        console.log('[ppt-agent] Creating slide with data:', slideData);
        const newSlide: PresentationSlide = {
          id: generateId(),
          ...slideData,
        };
        console.log('[ppt-agent] Generated slide with ID:', newSlide.id);

        const slideIndex = action.slideIndex ?? newState.currentSlideIndex ?? 0;
        console.log(
          '[ppt-agent] Inserting at index:',
          slideIndex,
          'Current slides array length:',
          newState.slides.length
        );

        // 배열을 복사하고 undefined를 방지하기 위해 충분한 길이 확보
        const newSlides = [...newState.slides];
        // 배열 길이가 slideIndex보다 작으면 빈 슬롯을 null로 채움 (undefined 방지)
        while (newSlides.length <= slideIndex) {
          newSlides.push(null as any);
        }
        newSlides[slideIndex] = newSlide;
        // null 요소 필터링 (실제 슬라이드만 유지)
        const filteredSlides = newSlides.filter((s) => s !== null) as PresentationSlide[];

        const completed = [...newState.completedSlideIndices];
        if (!completed.includes(slideIndex)) {
          completed.push(slideIndex);
        }

        const totalSlides = newState.structure?.totalSlides || 8;
        const nextIndex = slideIndex + 1;

        newState = {
          ...newState,
          slides: filteredSlides,
          completedSlideIndices: completed,
          currentSlideIndex: nextIndex < totalSlides ? nextIndex : undefined,
          currentStep: nextIndex < totalSlides ? 'slide-creation' : 'review',
        };

        console.log(
          '[ppt-agent] Created slide at index',
          slideIndex,
          'Total slides:',
          filteredSlides.length
        );
        callbacks.onSlides?.(filteredSlides);
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
