'use client';

import { ChevronLeft, Wrench, Navigation, Eye, MousePointer, Layers, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/lib/store/chat-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * Browser Agent 사용 가능한 도구 목록 전체 화면
 */
export function BrowserToolsList() {
  const { setBrowserViewMode } = useChatStore();

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="p-3 border-b bg-muted/30 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setBrowserViewMode('chat')}
          title="뒤로 가기"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Wrench className="h-5 w-5" />
          <span className="text-base font-semibold">Browser Agent 도구</span>
        </div>
      </div>

      {/* Tools List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="text-xs text-muted-foreground mb-3">
          Browser Agent가 사용할 수 있는 총 18개의 도구입니다.
        </div>

        {/* Navigation Tools */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Navigation className="h-4 w-4" />
              <CardTitle className="text-sm">Navigation (1)</CardTitle>
            </div>
            <CardDescription className="text-xs">페이지 이동</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <ToolItem
              name="browser_navigate"
              description="URL로 직접 이동 (http/https 자동 추가)"
            />
          </CardContent>
        </Card>

        {/* Page Inspection Tools */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              <CardTitle className="text-sm">Page Inspection (5)</CardTitle>
            </div>
            <CardDescription className="text-xs">페이지 정보 파악</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <ToolItem
              name="get_page_content"
              description="현재 페이지의 내용 파악 (제목, URL, 텍스트, HTML)"
            />
            <ToolItem
              name="get_interactive_elements"
              description="클릭/입력 가능한 요소 찾기 (버튼, 링크, 입력창 등)"
            />
            <ToolItem name="search_elements" description="자연어로 요소 검색" badge="NEW" />
            <ToolItem name="get_selected_text" description="사용자가 선택/드래그한 텍스트 읽기" />
            <ToolItem name="take_screenshot" description="화면 캡처 + 텍스트 미리보기" />
          </CardContent>
        </Card>

        {/* Page Interaction Tools */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <MousePointer className="h-4 w-4" />
              <CardTitle className="text-sm">Page Interaction (3)</CardTitle>
            </div>
            <CardDescription className="text-xs">페이지 조작</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <ToolItem name="click_element" description="특정 요소 클릭 (가시성/상태 검증)" />
            <ToolItem name="type_text" description="입력창에 텍스트 입력 (이벤트 트리거링)" />
            <ToolItem name="scroll" description="페이지 스크롤 (위/아래)" />
          </CardContent>
        </Card>

        {/* Tab Management Tools */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              <CardTitle className="text-sm">Tab Management (4)</CardTitle>
            </div>
            <CardDescription className="text-xs">탭 관리</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <ToolItem name="list_tabs" description="열린 탭 목록 조회 (ID, 제목, URL)" />
            <ToolItem name="create_tab" description="새 탭 열기" />
            <ToolItem name="switch_tab" description="특정 탭으로 전환" />
            <ToolItem name="close_tab" description="탭 닫기 (마지막 탭 제외)" />
          </CardContent>
        </Card>

        {/* Vision-based Tools */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4" />
              <CardTitle className="text-sm">Vision-based Tools (5)</CardTitle>
            </div>
            <CardDescription className="text-xs">시각 기반 도구</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <ToolItem
              name="capture_annotated_screenshot"
              description="Set-of-Mark 스크린샷 캡처"
              badge="NEW"
            />
            <ToolItem name="click_coordinate" description="좌표로 클릭" badge="NEW" />
            <ToolItem name="click_marker" description="마커로 클릭" badge="NEW" />
            <ToolItem
              name="get_clickable_coordinate"
              description="클릭 가능한 좌표 추출"
              badge="NEW"
            />
            <ToolItem
              name="analyze_with_vision"
              description="Vision LLM으로 화면 분석 (향후 지원)"
              badge="SOON"
            />
          </CardContent>
        </Card>

        {/* Info */}
        <div className="text-xs text-muted-foreground text-center p-4 bg-muted/20 rounded-lg">
          <p>이 도구들은 Browser Agent가 자동으로 선택하여 사용합니다.</p>
          <p className="mt-1">사용자는 자연어로 명령만 입력하면 됩니다.</p>
        </div>
      </div>
    </div>
  );
}

/**
 * 개별 도구 아이템 컴포넌트
 */
function ToolItem({
  name,
  description,
  badge,
}: {
  name: string;
  description: string;
  badge?: 'NEW' | 'SOON';
}) {
  return (
    <div className="text-xs p-2 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-2 mb-1">
        <code className="font-mono font-semibold text-foreground">{name}</code>
        {badge === 'NEW' && (
          <Badge variant="default" className="h-4 text-[10px] px-1">
            NEW
          </Badge>
        )}
        {badge === 'SOON' && (
          <Badge variant="secondary" className="h-4 text-[10px] px-1">
            SOON
          </Badge>
        )}
      </div>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}
