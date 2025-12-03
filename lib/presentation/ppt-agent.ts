import { generateId } from '@/lib/utils';
import { LLMService } from '@/lib/llm/service';
import type { PresentationSlide, PresentationExportFormat } from '@/types/presentation';
import type { Message } from '@/types';

export interface PresentationAgentOptions {
  tone?: string;
  targetFormat?: PresentationExportFormat;
  slideCount?: number;
  brandVoice?: string;
  visualDirection?: string;
  theme?: {
    palette?: string[];
    typography?: string;
    layoutGuidelines?: string;
  };
}

export interface PresentationAgentCallbacks {
  onToken?: (chunk: string) => void;
  onSlides?: (slides: PresentationSlide[]) => void;
  signal?: AbortSignal;
}

// ChatMessage는 Message 타입과 호환되도록 변경
type ChatMessage = Message;

function getSystemPrompt(userLanguage: 'ko' | 'en' | 'ja' | 'zh'): string {
  const languageInstructions = {
    ko: `# 감지된 언어: 한국어
**사용자가 한국어로 요청했으므로, 모든 응답과 슬라이드 내용을 한국어로 작성하세요.**

응답 예시:
- "네, 알겠습니다. 논문 요약 발표 자료를 만들어드리겠습니다."
- Tool 호출: language: "ko"
- 슬라이드 제목: "연구 배경", "방법론", "결과 분석"

참고: 사용자가 "영어로", "in English" 등을 명시하면 해당 언어를 사용하세요.`,
    en: `# Detected Language: English
**The user requested in English, so respond and create all slide content in English.**

Response example:
- "Sure, I'll create a presentation about your topic."
- Tool call: language: "en"
- Slide titles: "Background", "Methodology", "Results"

Note: If the user specifies another language (e.g., "한국어로", "in Korean"), use that language instead.`,
    ja: `# 検出された言語: 日本語
**ユーザーが日本語でリクエストしたので、すべての応答とスライドコンテンツを日本語で作成してください。**

応答例:
- "はい、わかりました。プレゼンテーションを作成します。"
- ツール呼び出し: language: "ja"
- スライドタイトル: "背景", "方法論", "結果"

注: ユーザーが別の言語を指定した場合（例: "英語で", "in English"）、その言語を使用してください。`,
    zh: `# 检测到的语言: 中文
**用户用中文请求，因此请用中文回复并创建所有幻灯片内容。**

回复示例:
- "好的，我将为您创建演示文稿。"
- 工具调用: language: "zh"
- 幻灯片标题: "背景", "方法", "结果"

注意: 如果用户指定了其他语言（例如: "英文", "in English"），请使用该语言。`,
  };

  return `You are ppt-agent, an expert presentation designer.

${languageInstructions[userLanguage]}

# Your Workflow
1. User requests a presentation (e.g., "논문 요약 발표 자료, 15페이지")
2. Extract: topic, slide count, language
3. IMMEDIATELY output JSON slides - do NOT use tools, do NOT ask questions
4. Generate slides one by one in streaming fashion

# How to Extract Parameters
- **Slide count**: "15페이지" → 15, "10 slides" → 10, "약 20장" → 20, default → 8
- **Topic**: Main subject (e.g., "논문 요약", "AI의 미래", "Company Overview")
- **Language**: Auto-detected (already provided to you)

# Response Format
${
  userLanguage === 'ko'
    ? `간단한 확인 메시지 + 즉시 JSON 배열 출력:

"네, 논문 요약 발표 자료를 15장으로 만들어드리겠습니다."

\`\`\`json
[
  {
    "title": "논문 소개",
    "subtitle": "연구의 배경과 목적",
    ...
  },
  ...
]
\`\`\``
    : userLanguage === 'ja'
      ? `簡単な確認メッセージ + すぐにJSON配列を出力:

"はい、論文要約プレゼンテーションを15枚作成します。"

\`\`\`json
[
  {
    "title": "論文紹介",
    ...
  }
]
\`\`\``
      : `Brief confirmation + immediate JSON array:

"Sure, I'll create a 15-slide presentation."

\`\`\`json
[
  {
    "title": "Introduction",
    ...
  }
]
\`\`\``
}

# Your Design Philosophy
- **Think like a designer first**: Consider visual hierarchy, contrast, whitespace, and rhythm
- **Be creative and diverse**: Each slide should have a unique personality while maintaining coherence
- **Data visualization matters**: Use charts, tables, and stats to make numbers compelling
- **Images are powerful**: Suggest relevant, high-quality images that enhance the message
- **Typography creates emotion**: Mix fonts strategically (e.g., bold serif titles + clean sans body)

# Available Layouts (use variety!)
1. **hero**: Full-screen impact slide (opening/closing, big statements)
2. **title-body**: Classic content slide (text + bullets + optional image)
3. **two-column**: Split content (comparison, before/after, pros/cons)
4. **timeline**: Process, roadmap, history (horizontal steps)
5. **grid**: Multiple items showcase (features, team, portfolio)
6. **split-image**: 50/50 text and large image
7. **quote**: Highlight testimonials or important statements
8. **stats**: Big numbers with impact (KPIs, achievements)

# Design Elements You Can Control
**Colors**: Choose accentColor, backgroundColor, textColor to create mood
- Dark tech: #0f172a bg, #0ea5e9 accent, white text
- Warm organic: cream bg, #f97316 accent, dark text
- Professional: white bg, #7c3aed accent, gray text

**Typography**: titleFont + bodyFont + titleSize
- Modern: "Sora Bold" / "Inter Regular"
- Elegant: "Playfair Display" / "Source Sans Pro"
- Tech: "Space Grotesk" / "JetBrains Mono"
- Size: small/medium/large/xl based on importance

**Content Slots** (use these to enrich slides!):
- \`chart\`: Bar, line, pie, area charts with real data
- \`table\`: Structured data with headers and rows
- \`stats\`: Big numbers (e.g., [{ value: "95%", label: "Satisfaction", icon: "❤️" }])
- \`quote\`: Testimonials or key statements
- \`timeline\`: Steps with titles, descriptions, dates

**Visual Focus** (emphasis field):
- "title": Text-heavy, minimal visuals
- "visual": Image-dominant, minimal text
- "data": Chart/table focused
- "balanced": Equal text and visual

# Your Creative Process
1. **Analyze the brief**: Understand audience, tone, purpose
2. **Plan visual rhythm**: Alternate between text-heavy and visual-heavy slides
3. **Choose diverse layouts**: Don't use the same layout twice in a row
4. **Add data visualization**: Use charts/tables for any numbers or comparisons
5. **Suggest powerful images**: Describe images that enhance each message
6. **Apply design system**: Consistent colors/fonts but varied execution

# Examples of Creative Thinking

**Bad (boring)**: All title-body layouts, no images, plain bullets
**Good**: Hero intro → stats slide with big numbers → split-image for problem → chart comparing solutions → timeline roadmap → quote testimonial → grid features → hero conclusion

**Bad**: Generic "increase revenue" bullet point
**Good**: Chart showing revenue growth trend + stat card "127% YoY" + image prompt "upward trending graph with celebration"

**Bad**: "Our team" with bullet list of names
**Good**: Grid layout with team photos, or stats showing team size/experience, or timeline of company milestones

# JSON Output Format
Return slides as JSON array with ALL relevant fields:
\`\`\`json
[
  {
    "title": "Slide Title",
    "subtitle": "Optional subtitle for context",
    "description": "Brief description for preview",
    "bullets": ["Key point 1", "Key point 2"],
    "imagePrompt": "Detailed description for image generation",
    "layout": "hero|title-body|two-column|timeline|grid|split-image|quote|stats",
    "vibe": "dark neon tech|minimal white|warm organic|professional clean",
    "accentColor": "#0ea5e9",
    "backgroundColor": "#0f172a",
    "textColor": "white",
    "titleFont": "Sora Bold",
    "bodyFont": "Inter Regular",
    "titleSize": "large|xl",
    "textAlign": "center|left|right",
    "emphasis": "title|visual|data|balanced",
    "slots": {
      "chart": {
        "type": "bar|line|pie|area",
        "title": "Chart Title",
        "data": {
          "labels": ["Q1", "Q2", "Q3", "Q4"],
          "values": [45, 67, 89, 102],
          "colors": ["#0ea5e9", "#7c3aed"]
        }
      },
      "stats": [
        { "value": "95%", "label": "Customer Satisfaction", "icon": "❤️" }
      ],
      "quote": {
        "text": "This changed everything for us",
        "author": "Jane Doe",
        "role": "CEO, TechCorp"
      }
    },
    "notes": "Speaker notes for this slide"
  }
]
\`\`\`

Remember: Be bold, be creative, use all the tools at your disposal. Make presentations that WOW!`;
}

function coerceSlides(raw: string): PresentationSlide[] {
  const slides: PresentationSlide[] = [];

  // Try to extract JSON from markdown code blocks
  let jsonContent = raw.trim();

  // Remove markdown code fences (```json ... ``` or ``` ... ```)
  const codeBlockMatch = jsonContent.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
  if (codeBlockMatch) {
    jsonContent = codeBlockMatch[1];
  } else {
    // Try to find JSON array directly
    const arrayMatch = jsonContent.match(/(\[\s*\{[\s\S]*\}\s*\])/);
    if (arrayMatch) {
      jsonContent = arrayMatch[1];
    }
  }

  try {
    const parsed = JSON.parse(jsonContent);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        slides.push({
          id: generateId(),
          title: item.title || 'Untitled Slide',
          subtitle: item.subtitle,
          description: item.description,
          bullets: item.bullets,
          imagePrompt: item.imagePrompt,
          imageUrl: item.imageUrl,
          notes: item.notes,

          // 디자인 시스템
          accentColor: item.accentColor,
          backgroundColor: item.backgroundColor,
          textColor: item.textColor,
          layout: item.layout,
          vibe: item.vibe,

          // 타이포그래피
          titleFont: item.titleFont,
          bodyFont: item.bodyFont,
          titleSize: item.titleSize,
          textAlign: item.textAlign,

          // 고급 콘텐츠 슬롯
          slots: item.slots,

          // 애니메이션/전환
          transition: item.transition,
          emphasis: item.emphasis,
        });
      }
      if (slides.length > 0) {
        return slides;
      }
    }
  } catch (e) {
    console.warn('[ppt-agent] JSON parse failed, trying heuristic parsing:', e);
    // Fall back to heuristic parsing
  }

  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  let current: PresentationSlide | null = null;

  for (const line of lines) {
    const match = line.match(/^Slide\s*\d+[-:]\s*(.*)$/i);
    if (match) {
      if (current) {
        slides.push(current);
      }
      current = {
        id: generateId(),
        title: match[1] || 'Untitled Slide',
      };
      continue;
    }
    if (!current) {
      current = { id: generateId(), title: line };
      continue;
    }
    current.bullets = [...(current.bullets || []), line];
  }

  if (current) {
    slides.push(current);
  }

  return slides;
}

// 사용자 언어 감지 (우선순위: 1. 명시적 언급 2. 작성 언어 3. 기본값 한국어)
function detectLanguage(text: string): 'ko' | 'en' | 'ja' | 'zh' {
  const lowerText = text.toLowerCase();

  // 1순위: 사용자가 명시적으로 언어를 지정한 경우
  // 영어 요청
  if (
    lowerText.includes('in english') ||
    lowerText.includes('영어로') ||
    lowerText.includes('영문으로') ||
    lowerText.includes('english version')
  ) {
    return 'en';
  }
  // 일본어 요청
  if (
    lowerText.includes('in japanese') ||
    lowerText.includes('일본어로') ||
    lowerText.includes('日本語で') ||
    lowerText.includes('japanese version')
  ) {
    return 'ja';
  }
  // 중국어 요청
  if (
    lowerText.includes('in chinese') ||
    lowerText.includes('중국어로') ||
    lowerText.includes('中文') ||
    lowerText.includes('chinese version')
  ) {
    return 'zh';
  }
  // 한국어 요청
  if (
    lowerText.includes('in korean') ||
    lowerText.includes('한국어로') ||
    lowerText.includes('korean version')
  ) {
    return 'ko';
  }

  // 2순위: 사용자가 작성한 메시지의 언어 자동 감지
  // 한글 비율 체크
  const koreanChars = text.match(/[가-힣]/g);
  if (koreanChars && koreanChars.length / text.length > 0.3) {
    return 'ko';
  }

  // 일본어 체크
  const japaneseChars = text.match(/[ぁ-んァ-ン]/g);
  if (japaneseChars && japaneseChars.length / text.length > 0.2) {
    return 'ja';
  }

  // 중국어 체크
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g);
  if (chineseChars && chineseChars.length / text.length > 0.2) {
    return 'zh';
  }

  // 영어 체크 (알파벳이 대부분인 경우)
  const englishChars = text.match(/[a-zA-Z]/g);
  if (englishChars && englishChars.length / text.length > 0.5) {
    return 'en';
  }

  // 3순위: 기본값 한국어
  return 'ko';
}

// 사용자 요청에서 슬라이드 개수 추출
function extractSlideCount(text: string): number {
  // 숫자 + 페이지/슬라이드/장 패턴
  const patterns = [
    /(\d+)\s*페이지/,
    /(\d+)\s*슬라이드/,
    /(\d+)\s*장/,
    /(\d+)\s*slides?/i,
    /(\d+)\s*pages?/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const count = parseInt(match[1], 10);
      // 합리적인 범위 체크 (1-50)
      if (count >= 1 && count <= 50) {
        return count;
      }
    }
  }

  return 8; // 기본값
}

export async function runPresentationAgent(
  messages: ChatMessage[],
  options: PresentationAgentOptions,
  callbacks: PresentationAgentCallbacks = {},
  _currentSlides: PresentationSlide[] = []
): Promise<{ response: string; slides: PresentationSlide[] }> {
  // 마지막 사용자 메시지에서 언어 및 슬라이드 개수 감지
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  const userLanguage = lastUserMessage ? detectLanguage(lastUserMessage.content) : 'en';
  const requestedSlideCount = lastUserMessage ? extractSlideCount(lastUserMessage.content) : 8;

  // LLMService를 사용하여 설정된 activeBaseModel을 IPC를 통해 호출
  const chatHistory: ChatMessage[] = [
    {
      id: generateId(),
      conversation_id: 'presentation-agent',
      role: 'system',
      content: getSystemPrompt(userLanguage),
      created_at: Date.now(),
    },
    ...messages,
    {
      id: generateId(),
      conversation_id: 'presentation-agent',
      role: 'system',
      content: `# Current Request Context

**Detected Language: ${userLanguage.toUpperCase()}**
${
  userLanguage === 'ko'
    ? '→ 감지된 언어로 응답하세요. 사용자가 다른 언어를 명시하면 해당 언어를 사용하세요.'
    : userLanguage === 'ja'
      ? '→ 検出された言語で応答してください。ユーザーが別の言語を指定した場合は、その言語を使用してください。'
      : userLanguage === 'zh'
        ? '→ 用检测到的语言回复。如果用户指定了其他语言，请使用该语言。'
        : '→ Respond in detected language. If user specifies another language, use that language.'
}

# Current Context
**Requested Slide Count: ${requestedSlideCount} slides** (MUST generate exactly this many slides)
Target format: ${options.targetFormat || 'pptx'}
Tone: ${options.tone || 'bold'}
Brand voice: ${options.brandVoice || 'unspecified'}
Visual direction: ${options.visualDirection || 'sleek, high contrast'}
Theme palette: ${(options.theme?.palette || []).join(', ') || 'TBD'}
Typography: ${options.theme?.typography || 'modern sans (e.g., Sora/Inter)'}
Layout guidelines: ${options.theme?.layoutGuidelines || '16:9 grids, consistent margins, readable hierarchy'}`,
      created_at: Date.now(),
    },
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
    throw error;
  }

  if (callbacks.signal?.aborted) {
    return { response: fullResponse, slides: [] };
  }

  // 첫 번째 응답에서 바로 슬라이드 추출 시도
  const slides = coerceSlides(fullResponse);

  if (slides.length > 0) {
    // 슬라이드를 실시간으로 UI에 전달
    callbacks.onSlides?.(slides);
    return { response: fullResponse, slides };
  }

  // JSON이 없으면 두 번째 요청으로 명시적 JSON 요청
  const outlinePromptContent =
    userLanguage === 'ko'
      ? `이제 정확히 ${requestedSlideCount}개의 슬라이드 개요를 JSON 배열로 출력하세요. 모든 디자인 필드를 포함하세요:

**필수 필드** (각 슬라이드마다):
- title, subtitle, description, bullets (3-5개, 한국어로!)
- layout (hero/title-body/two-column/timeline/grid/split-image/quote/stats 중 다양하게)
- imagePrompt (구체적이고 상세한 설명)
- accentColor, backgroundColor, textColor
- titleFont, bodyFont, titleSize, textAlign
- vibe, emphasis

**선택 필드** (권장):
- slots.chart (실제 데이터: labels, values, colors)
- slots.stats (큰 숫자와 레이블)
- slots.table (구조화된 데이터)
- slots.quote (인용구)
- slots.timeline (상세 단계)
- notes (발표자 노트)

**중요**: 모든 텍스트 내용(title, bullets 등)을 한국어로 작성하세요!

**중요**: ${requestedSlideCount}개의 슬라이드를 모두 생성하세요!

JSON만 반환하세요 (마크다운 펜스 없이, 설명 없이):
[{"title": "...", "subtitle": "...", ...}]`
      : `Now output exactly ${requestedSlideCount} slides as a JSON array. Include ALL design fields you decided on:

**REQUIRED for each slide**:
- title, subtitle, description, bullets (3-5 per slide, in ${userLanguage.toUpperCase()}!)
- layout (vary between hero/title-body/two-column/timeline/grid/split-image/quote/stats)
- imagePrompt (detailed, specific descriptions)
- accentColor, backgroundColor, textColor
- titleFont, bodyFont, titleSize, textAlign
- vibe, emphasis

**OPTIONAL but encouraged**:
- slots.chart (with real data: labels, values, colors)
- slots.stats (big numbers with labels and icons)
- slots.table (structured data)
- slots.quote (testimonials)
- slots.timeline (detailed steps)
- notes (speaker notes)

**IMPORTANT**: Write all text content (title, bullets, etc.) in ${userLanguage.toUpperCase()}!
**IMPORTANT**: Generate exactly ${requestedSlideCount} slides!

Return ONLY valid JSON, no markdown fences, no explanation:
[{"title": "...", "subtitle": "...", ...}]`;

  const outlinePrompt: ChatMessage = {
    id: generateId(),
    conversation_id: 'presentation-agent',
    role: 'user',
    content: outlinePromptContent,
    created_at: Date.now(),
  };

  const outlineHistory: ChatMessage[] = [
    ...chatHistory,
    {
      id: generateId(),
      conversation_id: 'presentation-agent',
      role: 'assistant',
      content: fullResponse,
      created_at: Date.now(),
    },
    outlinePrompt,
  ];

  let outline = '';
  let outlineSuccess = false;

  try {
    // 타임아웃 설정 (60초)
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('Outline generation timeout after 60s')), 60000);
    });

    const streamPromise = (async () => {
      for await (const chunk of LLMService.streamChat(outlineHistory)) {
        if (callbacks.signal?.aborted) {
          break;
        }
        outline += chunk;
      }
    })();

    await Promise.race([streamPromise, timeoutPromise]);
    outlineSuccess = true;
  } catch (error) {
    console.error('[ppt-agent] Outline generation error:', error);
    // Fallback: 첫 응답에서 슬라이드 추출 시도
    console.warn('[ppt-agent] Attempting to extract slides from initial response');
    outline = fullResponse;
  }

  const outlineSlides = coerceSlides(outline);
  if (outlineSlides.length > 0) {
    callbacks.onSlides?.(outlineSlides);
  } else if (!outlineSuccess) {
    console.warn('[ppt-agent] No slides generated. Response may not contain slide data.');
  }

  return { response: fullResponse, slides: outlineSlides };
}
