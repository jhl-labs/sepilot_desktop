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

const SYSTEM_PROMPT = `You are ppt-agent, an expert presentation designer specializing in enterprise-level, visually stunning slide decks.

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

export async function runPresentationAgent(
  messages: ChatMessage[],
  options: PresentationAgentOptions,
  callbacks: PresentationAgentCallbacks = {}
): Promise<{ response: string; slides: PresentationSlide[] }> {
  // LLMService를 사용하여 설정된 activeBaseModel을 IPC를 통해 호출
  const chatHistory: ChatMessage[] = [
    {
      id: generateId(),
      conversation_id: 'presentation-agent',
      role: 'system',
      content: SYSTEM_PROMPT,
      created_at: Date.now(),
    },
    ...messages,
    {
      id: generateId(),
      conversation_id: 'presentation-agent',
      role: 'system',
      content: `Target format: ${options.targetFormat || 'pptx'} | Tone: ${options.tone || 'bold'} | Slides: ${
        options.slideCount || 'auto'
      }
- Respect brand voice: ${options.brandVoice || 'unspecified'}
- Preferred visual direction: ${options.visualDirection || 'sleek, high contrast'}
- Theme palette: ${(options.theme?.palette || []).join(', ') || 'TBD'}
- Typography: ${options.theme?.typography || 'modern sans (e.g., Sora/Inter)'}
- Layout guidelines: ${options.theme?.layoutGuidelines || '16:9 grids, consistent margins, readable hierarchy'}`,
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

  // Request explicit slide outline to keep UI in sync
  const outlinePrompt: ChatMessage = {
    id: generateId(),
    conversation_id: 'presentation-agent',
    role: 'user',
    content: `Now output the slide outline as a JSON array. Include ALL design fields you decided on:

REQUIRED for each slide:
- title, subtitle (if relevant), description, bullets (3-5 per slide)
- layout (vary between hero/title-body/two-column/timeline/grid/split-image/quote/stats)
- imagePrompt (detailed, specific descriptions)
- accentColor, backgroundColor, textColor
- titleFont, bodyFont, titleSize, textAlign
- vibe, emphasis

OPTIONAL but encouraged:
- slots.chart (with real data: labels, values, colors)
- slots.stats (big numbers with labels and icons)
- slots.table (structured data)
- slots.quote (testimonials)
- slots.timeline (detailed steps)
- notes (speaker notes)

Return ONLY valid JSON, no markdown fences, no explanation:
[{"title": "...", "subtitle": "...", ...}]`,
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
