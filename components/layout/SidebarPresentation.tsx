'use client';

import { Bot, Download, Image, Layers, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/lib/store/chat-store';

export function SidebarPresentation() {
  const {
    presentationSlides,
    presentationChatMessages,
    presentationViewMode,
    setPresentationViewMode,
    clearPresentationSession,
  } = useChatStore();

  const totalSlides = presentationSlides.length;
  const totalTurns = presentationChatMessages.length;

  return (
    <div className="flex h-full w-full flex-col">
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="h-5 w-5 text-primary" />
          AI Presentation Lab
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          비전+이미지 생성 모델을 조율해 최고의 슬라이드를 함께 설계하세요.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 p-3">
        <div className="rounded-lg border bg-muted/40 p-3">
          <div className="flex items-center justify-between text-sm font-semibold">
            현재 세션 상태
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => {
                if (totalSlides > 0 || totalTurns > 0) {
                  if (window.confirm('모든 슬라이드와 대화 내용이 삭제됩니다. 계속하시겠습니까?')) {
                    clearPresentationSession();
                  }
                } else {
                  clearPresentationSession();
                }
              }}
            >
              리셋
            </Button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div className="rounded-md border bg-background/60 p-2">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Layers className="h-4 w-4" />
                슬라이드
              </div>
              <p className="mt-1 text-lg font-semibold text-foreground">{totalSlides}장</p>
            </div>
            <div className="rounded-md border bg-background/60 p-2">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Bot className="h-4 w-4" />
                대화 턴
              </div>
              <p className="mt-1 text-lg font-semibold text-foreground">{totalTurns}</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-background p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Image className="h-4 w-4" />
            비전·이미지 활용 가이드
          </div>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground leading-relaxed">
            <li>ㆍ 브랜드 톤, 색상, 폰트를 먼저 지정하면 일관된 시각 언어를 유지합니다.</li>
            <li>
              ㆍ 이미지 생성 모델에 장면/조명/구도를 구체적으로 요청해 슬라이드용 비주얼을
              확보하세요.
            </li>
            <li>
              ㆍ 표, 차트, 도형은 텍스트로 구조를 설명하면 에이전트가 SVG/HTML 대안을 제안합니다.
            </li>
            <li>ㆍ ReAct 방식으로 단계별 설계 → 아트 방향 → 레이아웃 → 내보내기를 반복합니다.</li>
          </ul>
        </div>

        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Download className="h-4 w-4" />
            Export 파이프라인
          </div>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            ppt-agent가 생성한 JSON 슬라이드 스키마를 즉시 HTML/PDF/PPTX 렌더링 단계로 넘깁니다.
            내보내기 전에 프레젠테이션 뷰에서 미리보기를 확인하세요.
          </p>
        </div>
      </div>

      <div className="shrink-0 border-t p-2">
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPresentationViewMode('chat')}
            className={presentationViewMode === 'chat' ? 'bg-accent' : ''}
            title="AI 디자이너와 대화"
          >
            <Bot className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPresentationViewMode('outline')}
            className={presentationViewMode === 'outline' ? 'bg-accent' : ''}
            title="슬라이드 개요 보기"
          >
            <Layers className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (totalSlides > 0 || totalTurns > 0) {
                if (window.confirm('모든 슬라이드와 대화 내용이 삭제됩니다. 계속하시겠습니까?')) {
                  clearPresentationSession();
                }
              } else {
                clearPresentationSession();
              }
            }}
            title="세션 초기화"
          >
            <Trash2 className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
