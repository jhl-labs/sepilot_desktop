import type { PresentationSlide } from '../types';

/**
 * PPT Agent Tools
 * 사용자 요청을 구조화된 작업으로 변환하는 Built-in Tools
 */

export interface PptTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

// Tool 정의
export const PPT_TOOLS: PptTool[] = [
  {
    name: 'generate_presentation',
    description: `프레젠테이션을 처음부터 생성합니다. 브리핑이나 주제가 주어지면 이 도구를 사용하세요.
- 한국어 요청이면 한국어로 모든 내용을 생성합니다
- 영어 요청이면 영어로 생성합니다
- 요청 언어를 명시적으로 따릅니다`,
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: '프레젠테이션 주제 (사용자가 요청한 언어로)',
        },
        language: {
          type: 'string',
          enum: ['ko', 'en', 'ja', 'zh'],
          description: '프레젠테이션 언어 (사용자 요청에서 감지)',
        },
        slideCount: {
          type: 'number',
          description: '생성할 슬라이드 수 (기본값: 8)',
        },
        tone: {
          type: 'string',
          description: '톤/분위기 (예: professional, casual, bold, friendly)',
        },
        targetAudience: {
          type: 'string',
          description: '대상 청중 (예: executives, developers, students)',
        },
        designStyle: {
          type: 'string',
          description: '디자인 스타일 (예: modern tech, elegant, minimal)',
        },
      },
      required: ['topic', 'language'],
    },
  },
  {
    name: 'modify_slide',
    description: `특정 슬라이드를 수정합니다. 슬라이드 번호나 제목을 언급하면 이 도구를 사용하세요.
예: "첫 번째 슬라이드 제목 바꿔줘", "Timeline 슬라이드에 2025년 추가해"`,
    parameters: {
      type: 'object',
      properties: {
        slideIndex: {
          type: 'number',
          description: '수정할 슬라이드 인덱스 (0부터 시작)',
        },
        modifications: {
          type: 'object',
          description: '수정할 내용 (title, bullets, layout, colors 등)',
          properties: {
            title: { type: 'string' },
            subtitle: { type: 'string' },
            bullets: { type: 'array', items: { type: 'string' } },
            layout: { type: 'string' },
            accentColor: { type: 'string' },
            backgroundColor: { type: 'string' },
          },
        },
        reason: {
          type: 'string',
          description: '수정 이유 (사용자에게 설명)',
        },
      },
      required: ['slideIndex', 'modifications'],
    },
  },
  {
    name: 'add_slide',
    description:
      '새 슬라이드를 추가합니다. 특정 위치에 새 슬라이드가 필요하면 이 도구를 사용하세요.',
    parameters: {
      type: 'object',
      properties: {
        position: {
          type: 'number',
          description: '추가할 위치 (-1이면 맨 끝)',
        },
        slide: {
          type: 'object',
          description: '새 슬라이드 내용 (PresentationSlide 형식)',
        },
      },
      required: ['slide'],
    },
  },
  {
    name: 'delete_slide',
    description: '슬라이드를 삭제합니다.',
    parameters: {
      type: 'object',
      properties: {
        slideIndex: {
          type: 'number',
          description: '삭제할 슬라이드 인덱스',
        },
        reason: {
          type: 'string',
          description: '삭제 이유',
        },
      },
      required: ['slideIndex'],
    },
  },
  {
    name: 'reorder_slides',
    description: '슬라이드 순서를 변경합니다.',
    parameters: {
      type: 'object',
      properties: {
        newOrder: {
          type: 'array',
          items: { type: 'number' },
          description: '새로운 순서 (인덱스 배열)',
        },
      },
      required: ['newOrder'],
    },
  },
  {
    name: 'translate_presentation',
    description: '전체 프레젠테이션을 다른 언어로 번역합니다.',
    parameters: {
      type: 'object',
      properties: {
        targetLanguage: {
          type: 'string',
          enum: ['ko', 'en', 'ja', 'zh'],
          description: '번역할 언어',
        },
      },
      required: ['targetLanguage'],
    },
  },
  {
    name: 'change_design_theme',
    description: '전체 프레젠테이션의 디자인 테마를 변경합니다.',
    parameters: {
      type: 'object',
      properties: {
        theme: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: '테마 이름 (예: Dark Tech, Warm Organic, Professional)',
            },
            accentColor: { type: 'string' },
            backgroundColor: { type: 'string' },
            textColor: { type: 'string' },
            titleFont: { type: 'string' },
            bodyFont: { type: 'string' },
          },
          required: ['name'],
        },
      },
      required: ['theme'],
    },
  },
  {
    name: 'add_chart_to_slide',
    description: '특정 슬라이드에 차트를 추가하거나 수정합니다.',
    parameters: {
      type: 'object',
      properties: {
        slideIndex: { type: 'number' },
        chart: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['bar', 'line', 'pie', 'area', 'donut', 'radar'] },
            title: { type: 'string' },
            data: {
              type: 'object',
              properties: {
                labels: { type: 'array', items: { type: 'string' } },
                values: { type: 'array', items: { type: 'number' } },
                colors: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
      required: ['slideIndex', 'chart'],
    },
  },
  {
    name: 'suggest_improvements',
    description: '현재 프레젠테이션을 분석하고 개선 제안을 합니다.',
    parameters: {
      type: 'object',
      properties: {
        focus: {
          type: 'string',
          enum: ['design', 'content', 'structure', 'data-viz', 'all'],
          description: '개선 초점 영역',
        },
      },
      required: ['focus'],
    },
  },
];

/**
 * Tool 실행 함수
 */
export interface ToolExecutionContext {
  currentSlides: PresentationSlide[];
  userLanguage: 'ko' | 'en' | 'ja' | 'zh';
}

export interface ToolExecutionResult {
  success: boolean;
  slides?: PresentationSlide[];
  message: string;
  error?: string;
}

interface GeneratePresentationArgs {
  topic: string;
  language: 'ko' | 'en' | 'ja' | 'zh';
  slideCount?: number;
}

interface ModifySlideArgs {
  slideIndex: number;
  modifications: Partial<PresentationSlide>;
}

interface AddSlideArgs {
  position?: number;
  slide: PresentationSlide;
}

interface DeleteSlideArgs {
  slideIndex: number;
}

interface ReorderSlidesArgs {
  newOrder: number[];
}

interface TranslatePresentationArgs {
  targetLanguage: 'ko' | 'en' | 'ja' | 'zh';
}

interface ChangeDesignThemeArgs {
  theme: {
    name: string;
    accentColor?: string;
    backgroundColor?: string;
    textColor?: string;
    titleFont?: string;
    bodyFont?: string;
  };
}

interface AddChartToSlideArgs {
  slideIndex: number;
  chart: NonNullable<PresentationSlide['slots']>['chart'];
}

interface SuggestImprovementsArgs {
  focus: 'design' | 'content' | 'structure' | 'data-viz' | 'all';
}

export async function executePptTool(
  toolName: string,
  toolArgs: unknown,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  try {
    switch (toolName) {
      case 'generate_presentation':
        return await generatePresentation(toolArgs as GeneratePresentationArgs, context);

      case 'modify_slide':
        return modifySlide(toolArgs as ModifySlideArgs, context);

      case 'add_slide':
        return addSlide(toolArgs as AddSlideArgs, context);

      case 'delete_slide':
        return deleteSlide(toolArgs as DeleteSlideArgs, context);

      case 'reorder_slides':
        return reorderSlides(toolArgs as ReorderSlidesArgs, context);

      case 'translate_presentation':
        return translatePresentation(toolArgs as TranslatePresentationArgs);

      case 'change_design_theme':
        return changeDesignTheme(toolArgs as ChangeDesignThemeArgs, context);

      case 'add_chart_to_slide':
        return addChartToSlide(toolArgs as AddChartToSlideArgs, context);

      case 'suggest_improvements':
        return suggestImprovements(toolArgs as SuggestImprovementsArgs);

      default:
        return {
          success: false,
          message: `Unknown tool: ${toolName}`,
          error: 'UNKNOWN_TOOL',
        };
    }
  } catch (error) {
    return {
      success: false,
      message: `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error: 'EXECUTION_ERROR',
    };
  }
}

// Tool 구현
async function generatePresentation(
  args: GeneratePresentationArgs,
  _context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  // generate_presentation은 ppt-agent.ts에서 outline 요청으로 처리됨
  // 여기서는 메시지만 반환하고, 실제 슬라이드 생성은 outline 단계에서 수행
  return {
    success: true,
    message:
      args.language === 'ko'
        ? `"${args.topic}"에 대한 ${args.slideCount || 8}개의 슬라이드를 생성하고 있습니다...`
        : `Generating ${args.slideCount || 8} slides about "${args.topic}"...`,
  };
}

function modifySlide(args: ModifySlideArgs, context: ToolExecutionContext): ToolExecutionResult {
  const { slideIndex, modifications } = args;
  const slides = [...context.currentSlides];

  if (slideIndex < 0 || slideIndex >= slides.length) {
    return {
      success: false,
      message: `Invalid slide index: ${slideIndex}`,
      error: 'INVALID_INDEX',
    };
  }

  slides[slideIndex] = { ...slides[slideIndex], ...modifications };

  return {
    success: true,
    slides,
    message: `Slide ${slideIndex + 1} modified successfully.`,
  };
}

function addSlide(args: AddSlideArgs, context: ToolExecutionContext): ToolExecutionResult {
  const { position = -1, slide } = args;
  const slides = [...context.currentSlides];

  if (position === -1) {
    slides.push(slide);
  } else {
    slides.splice(position, 0, slide);
  }

  return {
    success: true,
    slides,
    message: `New slide added at position ${position === -1 ? slides.length : position + 1}.`,
  };
}

function deleteSlide(args: DeleteSlideArgs, context: ToolExecutionContext): ToolExecutionResult {
  const { slideIndex } = args;
  const slides = [...context.currentSlides];

  if (slideIndex < 0 || slideIndex >= slides.length) {
    return {
      success: false,
      message: `Invalid slide index: ${slideIndex}`,
      error: 'INVALID_INDEX',
    };
  }

  slides.splice(slideIndex, 1);

  return {
    success: true,
    slides,
    message: `Slide ${slideIndex + 1} deleted.`,
  };
}

function reorderSlides(
  args: ReorderSlidesArgs,
  context: ToolExecutionContext
): ToolExecutionResult {
  const { newOrder } = args;
  const slides = [...context.currentSlides];

  if (newOrder.length !== slides.length) {
    return {
      success: false,
      message: 'New order length must match current slide count',
      error: 'INVALID_ORDER',
    };
  }

  const reordered = newOrder.map((idx: number) => slides[idx]);

  return {
    success: true,
    slides: reordered,
    message: 'Slides reordered successfully.',
  };
}

function translatePresentation(args: TranslatePresentationArgs): ToolExecutionResult {
  // 실제 번역은 LLM에게 요청
  return {
    success: true,
    message: `Translating presentation to ${args.targetLanguage}...`,
  };
}

function changeDesignTheme(
  args: ChangeDesignThemeArgs,
  context: ToolExecutionContext
): ToolExecutionResult {
  const { theme } = args;
  const slides = context.currentSlides.map((slide) => ({
    ...slide,
    accentColor: theme.accentColor || slide.accentColor,
    backgroundColor: theme.backgroundColor || slide.backgroundColor,
    textColor: theme.textColor || slide.textColor,
    titleFont: theme.titleFont || slide.titleFont,
    bodyFont: theme.bodyFont || slide.bodyFont,
  }));

  return {
    success: true,
    slides,
    message: `Theme changed to "${theme.name}".`,
  };
}

function addChartToSlide(
  args: AddChartToSlideArgs,
  context: ToolExecutionContext
): ToolExecutionResult {
  const { slideIndex, chart } = args;
  const slides = [...context.currentSlides];

  if (slideIndex < 0 || slideIndex >= slides.length) {
    return {
      success: false,
      message: `Invalid slide index: ${slideIndex}`,
      error: 'INVALID_INDEX',
    };
  }

  slides[slideIndex] = {
    ...slides[slideIndex],
    slots: {
      ...slides[slideIndex].slots,
      chart,
    },
  };

  return {
    success: true,
    slides,
    message: `Chart added to slide ${slideIndex + 1}.`,
  };
}

function suggestImprovements(args: SuggestImprovementsArgs): ToolExecutionResult {
  // LLM에게 개선 제안 요청
  return {
    success: true,
    message: `Analyzing presentation for ${args.focus} improvements...`,
  };
}
