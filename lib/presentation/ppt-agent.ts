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

const SYSTEM_PROMPT = `You are ppt-agent, a presentation co-designer that follows the latest research on AI-first slide design.
- Operate with the ReAct loop: think about the request, outline slides, propose visuals (vision model), then generate imagery (image model).
- Always return crisp, structured reasoning. Prefer concise bullet formatting.
- Be proactive about slide layout, typography pairings, color palette, transitions, and accessibility.
- If the user shares screenshots or sketches, explain how to translate them into slide-ready visuals.
- Generate a JSON slide outline when asked: [{ "title": "", "description": "", "bullets": [], "imagePrompt": "", "layout": "title-body|two-column|timeline|grid|hero", "vibe": "", "typography": "" }].
- Target enterprise-ready PPT quality with strong visual hierarchy and modern motion cues.`;

function coerceSlides(raw: string): PresentationSlide[] {
  const slides: PresentationSlide[] = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        slides.push({
          id: generateId(),
          title: item.title || 'Untitled Slide',
          description: item.description,
          bullets: item.bullets,
          imagePrompt: item.imagePrompt,
          imageUrl: item.imageUrl,
          notes: item.notes,
          accentColor: item.accentColor,
        });
      }
      if (slides.length > 0) {
        return slides;
      }
    }
  } catch {
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
    content:
      'Summarize the slides you propose as compact JSON with fields: title, description, bullets, imagePrompt, notes, accentColor.',
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
          console.log('[ppt-agent] Outline generation aborted');
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
    console.log('[ppt-agent] Attempting to extract slides from initial response');
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
