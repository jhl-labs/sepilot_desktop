import { generateId } from '@/lib/utils';
import { getWebLLMClient } from '@/lib/llm/web-client';
import type { PresentationSlide, PresentationExportFormat } from '@/types/presentation';

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

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

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
  const webClient = getWebLLMClient();
  const chatHistory: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages,
    {
      role: 'system',
      content: `Target format: ${options.targetFormat || 'pptx'} | Tone: ${options.tone || 'bold'} | Slides: ${
        options.slideCount || 'auto'
      }
- Respect brand voice: ${options.brandVoice || 'unspecified'}
- Preferred visual direction: ${options.visualDirection || 'sleek, high contrast'}
- Theme palette: ${(options.theme?.palette || []).join(', ') || 'TBD'}
- Typography: ${options.theme?.typography || 'modern sans (e.g., Sora/Inter)'}
- Layout guidelines: ${options.theme?.layoutGuidelines || '16:9 grids, consistent margins, readable hierarchy'}`,
    },
  ];

  let fullResponse = '';
  for await (const chunk of webClient.stream(chatHistory)) {
    if (callbacks.signal?.aborted) {
      break;
    }
    if (!chunk.done && chunk.content) {
      fullResponse += chunk.content;
      callbacks.onToken?.(chunk.content);
    }
  }

  if (callbacks.signal?.aborted) {
    return { response: fullResponse, slides: [] };
  }

  // Request explicit slide outline to keep UI in sync
  const outlinePrompt: ChatMessage = {
    role: 'user',
    content:
      'Summarize the slides you propose as compact JSON with fields: title, description, bullets, imagePrompt, notes, accentColor.',
  };

  const outline = await webClient.generate([
    ...chatHistory,
    { role: 'assistant', content: fullResponse },
    outlinePrompt,
  ]);
  const slides = coerceSlides(outline);
  if (slides.length > 0) {
    callbacks.onSlides?.(slides);
  }

  return { response: fullResponse, slides };
}
