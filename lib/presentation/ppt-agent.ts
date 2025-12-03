import { generateId } from '@/lib/utils';
import { LLMService } from '@/lib/llm/service';
import type { PresentationSlide, PresentationExportFormat } from '@/types/presentation';
import type { Message } from '@/types';
import { executePptTool, type ToolExecutionContext } from './ppt-tools';

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
    ko: `# ⚠️ 절대 규칙: 한국어 사용 필수 ⚠️
**사용자가 한국어로 요청했습니다. 당신은 반드시 한국어로만 응답해야 합니다.**

✅ 올바른 응답:
- "네, 알겠습니다. 논문 요약 발표 자료를 만들어드리겠습니다."
- Tool 호출: language: "ko"
- 슬라이드 제목: "연구 배경", "방법론", "결과 분석"

❌ 잘못된 응답:
- "Sure, I'll create a presentation..." (영어 사용 금지!)
- Tool 호출: language: "en" (절대 안됨!)
- 슬라이드 제목: "Introduction", "Methods" (영어 제목 금지!)

**지금 당장 한국어로 응답을 시작하세요. 영어를 사용하면 안됩니다.**`,
    en: `# CRITICAL: Language Rule
**The user requested in English, so ALL your responses and slide content must be in English.**
- Conversation responses: English
- Slide titles, content, bullets: All in English
- Tool call language parameter: "en"

Never respond in other languages. Everything must be in English.`,
    ja: `# 重要: 言語ルール
**ユーザーが日本語でリクエストしたので、すべての応答とスライドコンテンツを日本語で作成してください。**
- 会話の応答: 日本語
- スライドのタイトル、内容、箇条書き: すべて日本語
- ツール呼び出しのlanguageパラメータ: "ja"

他の言語で応答しないでください。すべて日本語で作成してください。`,
    zh: `# 重要: 语言规则
**用户用中文请求，因此您的所有回复和幻灯片内容必须使用中文。**
- 对话回复: 中文
- 幻灯片标题、内容、要点: 全部中文
- 工具调用language参数: "zh"

不要用其他语言回复。所有内容必须用中文。`,
  };

  return `You are ppt-agent, an expert presentation designer with access to powerful tools.

${languageInstructions[userLanguage]}

# Your Role & Available Tools
You have access to specialized tools for presentation tasks. ALWAYS use the appropriate tool:

**generate_presentation**: Create a new presentation from scratch
- Use when: User wants a new presentation, gives a topic/brief
- Parameters:
  - topic (in user's language!)
  - language (MUST match user's request language!)
  - slideCount: **Extract from user's request!**
    - "15페이지 이내" → slideCount: 15
    - "10 slides" → slideCount: 10
    - "약 20장" → slideCount: 20
    - Not specified → slideCount: 8 (default)
  - tone, targetAudience, designStyle

**modify_slide**: Edit a specific slide
- Use when: User mentions slide number/title and wants changes
- Parameters: slideIndex, modifications (title, bullets, layout, colors, etc.)

**add_slide**: Insert a new slide
- Use when: User wants to add content between existing slides
- Parameters: position, slide (full slide object)

**delete_slide**: Remove a slide
- Use when: User wants to remove a specific slide
- Parameters: slideIndex, reason

**reorder_slides**: Change slide order
- Use when: User wants to reorganize slides
- Parameters: newOrder (array of indices)

**translate_presentation**: Convert entire presentation to another language
- Use when: User asks to translate the whole presentation
- Parameters: targetLanguage

**change_design_theme**: Apply a new design theme to all slides
- Use when: User wants to change colors/fonts across all slides
- Parameters: theme (name, colors, fonts)

**add_chart_to_slide**: Add/update charts with data
- Use when: User mentions adding a chart with specific data
- Parameters: slideIndex, chart (type, data, labels, values)

**suggest_improvements**: Analyze and provide improvement suggestions
- Use when: User asks for feedback or improvements
- Parameters: focus (design/content/structure/data-viz/all)

# Tool Usage Guidelines
1. **ALWAYS respond in ${userLanguage === 'ko' ? '한국어' : userLanguage === 'ja' ? '日本語' : userLanguage === 'zh' ? '中文' : 'English'}** when explaining what you're doing
2. **Use tools for actions**, not for explanations
3. **One tool call per user request** (unless they ask for multiple things)

# How to Call Tools
When you need to use a tool, output it in this format:
<tool_call>
name: tool_name
args: {
  "parameter1": "value1",
  "parameter2": "value2"
}
</tool_call>

${
  userLanguage === 'ko'
    ? `Example - 한국어로 프레젠테이션 생성:
<tool_call>
name: generate_presentation
args: {
  "topic": "AI의 미래",
  "language": "ko",
  "slideCount": 8,
  "tone": "professional",
  "targetAudience": "executives",
  "designStyle": "modern tech"
}
</tool_call>

Example - 슬라이드 수정:
<tool_call>
name: modify_slide
args: {
  "slideIndex": 0,
  "modifications": {
    "title": "새로운 제목",
    "bullets": ["수정된 포인트 1", "수정된 포인트 2"]
  },
  "reason": "사용자 요청에 따라 제목과 내용 수정"
}
</tool_call>`
    : userLanguage === 'ja'
      ? `Example - 日本語でプレゼンテーション生成:
<tool_call>
name: generate_presentation
args: {
  "topic": "AIの未来",
  "language": "ja",
  "slideCount": 8,
  "tone": "professional",
  "targetAudience": "executives",
  "designStyle": "modern tech"
}
</tool_call>`
      : userLanguage === 'zh'
        ? `Example - 用中文生成演示文稿:
<tool_call>
name: generate_presentation
args: {
  "topic": "AI的未来",
  "language": "zh",
  "slideCount": 8,
  "tone": "professional",
  "targetAudience": "executives",
  "designStyle": "modern tech"
}
</tool_call>`
        : `Example - Generate presentation in English:
<tool_call>
name: generate_presentation
args: {
  "topic": "The Future of AI",
  "language": "en",
  "slideCount": 8,
  "tone": "professional",
  "targetAudience": "executives",
  "designStyle": "modern tech"
}
</tool_call>`
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

// 사용자 언어 감지
function detectLanguage(text: string): 'ko' | 'en' | 'ja' | 'zh' {
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

  return 'en';
}

// Tool 호출 파싱
interface ToolCall {
  name: string;
  arguments: any;
}

function parseToolCalls(text: string): ToolCall[] {
  const toolCalls: ToolCall[] = [];

  // Tool 호출 패턴 감지: <tool_call>name: tool_name, args: {...}</tool_call>
  // 또는 JSON 형식: {"tool": "name", "arguments": {...}}

  // 패턴 1: XML-like 형식
  const xmlPattern = /<tool_call>([\s\S]*?)<\/tool_call>/g;
  let match;

  while ((match = xmlPattern.exec(text)) !== null) {
    try {
      const content = match[1].trim();
      // name: xxx, args: {...} 형식 파싱
      const nameMatch = content.match(/name:\s*['"]?(\w+)['"]?/);
      const argsMatch = content.match(/args:\s*({[\s\S]*})/);

      if (nameMatch && argsMatch) {
        toolCalls.push({
          name: nameMatch[1],
          arguments: JSON.parse(argsMatch[1]),
        });
      }
    } catch (e) {
      console.warn('[ppt-agent] Failed to parse tool call:', match[1], e);
    }
  }

  // 패턴 2: JSON 형식
  if (toolCalls.length === 0) {
    const jsonPattern =
      /\{[\s]*"tool"[\s]*:[\s]*"(\w+)"[\s]*,[\s]*"arguments"[\s]*:[\s]*(\{[\s\S]*?\})[\s]*\}/g;

    while ((match = jsonPattern.exec(text)) !== null) {
      try {
        toolCalls.push({
          name: match[1],
          arguments: JSON.parse(match[2]),
        });
      } catch (e) {
        console.warn('[ppt-agent] Failed to parse JSON tool call:', match[0], e);
      }
    }
  }

  return toolCalls;
}

export async function runPresentationAgent(
  messages: ChatMessage[],
  options: PresentationAgentOptions,
  callbacks: PresentationAgentCallbacks = {},
  currentSlides: PresentationSlide[] = []
): Promise<{ response: string; slides: PresentationSlide[] }> {
  // 마지막 사용자 메시지에서 언어 감지
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  const userLanguage = lastUserMessage ? detectLanguage(lastUserMessage.content) : 'en';

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
      content: `# ⚠️ CRITICAL REMINDER ⚠️

**USER LANGUAGE: ${userLanguage.toUpperCase()}**
${
  userLanguage === 'ko'
    ? '→ 모든 응답을 한국어로 작성하세요! 영어 사용 절대 금지!'
    : userLanguage === 'ja'
      ? '→ すべての応答を日本語で作成してください！'
      : userLanguage === 'zh'
        ? '→ 用中文回复所有内容！'
        : '→ Respond in English only!'
}

# Current Context
Target format: ${options.targetFormat || 'pptx'}
Tone: ${options.tone || 'bold'}
Slides: ${options.slideCount || 'auto (extract from user request!)'}
Brand voice: ${options.brandVoice || 'unspecified'}
Visual direction: ${options.visualDirection || 'sleek, high contrast'}
Theme palette: ${(options.theme?.palette || []).join(', ') || 'TBD'}
Typography: ${options.theme?.typography || 'modern sans (e.g., Sora/Inter)'}
Layout guidelines: ${options.theme?.layoutGuidelines || '16:9 grids, consistent margins, readable hierarchy'}`,
      created_at: Date.now(),
    },
  ];

  let fullResponse = '';
  // Tool 실행에서 사용할 슬라이드 상태 (초기값은 전달받은 currentSlides)
  let workingSlides: PresentationSlide[] = [...currentSlides];

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

  // Tool 호출 감지 및 실행
  const toolCalls = parseToolCalls(fullResponse);

  if (toolCalls.length > 0) {
    console.log(
      '[ppt-agent] Detected tool calls:',
      toolCalls.map((t) => t.name)
    );

    const toolContext: ToolExecutionContext = {
      currentSlides: workingSlides,
      userLanguage,
    };

    for (const toolCall of toolCalls) {
      try {
        const result = await executePptTool(toolCall.name, toolCall.arguments, toolContext);

        if (result.success && result.slides) {
          workingSlides = result.slides;
          toolContext.currentSlides = result.slides;
          callbacks.onSlides?.(result.slides);
        }

        // Tool 실행 결과를 사용자에게 알림
        const resultMessage = result.success ? `✅ ${result.message}` : `❌ ${result.message}`;
        callbacks.onToken?.(`\n\n${resultMessage}`);
      } catch (error) {
        console.error('[ppt-agent] Tool execution error:', error);
        callbacks.onToken?.(
          `\n\n❌ Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    // Tool이 슬라이드를 생성했다면 바로 반환
    if (workingSlides.length > 0) {
      return { response: fullResponse, slides: workingSlides };
    }
  }

  // Request explicit slide outline to keep UI in sync
  const outlinePromptContent =
    userLanguage === 'ko'
      ? `이제 슬라이드 개요를 JSON 배열로 출력하세요. 모든 디자인 필드를 포함하세요:

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

JSON만 반환하세요 (마크다운 펜스 없이, 설명 없이):
[{"title": "...", "subtitle": "...", ...}]`
      : `Now output the slide outline as a JSON array. Include ALL design fields you decided on:

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

  const slides = coerceSlides(outline);
  if (slides.length > 0) {
    callbacks.onSlides?.(slides);
  } else if (!outlineSuccess) {
    console.warn('[ppt-agent] No slides generated. Response may not contain slide data.');
  }

  return { response: fullResponse, slides };
}
