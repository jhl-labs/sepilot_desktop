/**
 * Terminal Settings Component
 *
 * Terminal extension 설정 탭
 */

'use client';

import React from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useChatStore } from '@/lib/store/chat-store';
import { Separator } from '@/components/ui/separator';

export function TerminalSettings() {
  const {
    showAISuggestions,
    enableAutoAnalysis,
    maxHistoryBlocks,
    terminalViewMode,
    toggleAISuggestions,
    setEnableAutoAnalysis,
    setTerminalViewMode,
  } = useChatStore();

  return (
    <div className="space-y-6 p-6">
      <div>
        <h3 className="text-lg font-medium">터미널 설정</h3>
        <p className="text-sm text-muted-foreground">AI 터미널의 동작 방식을 설정합니다</p>
      </div>

      <Separator />

      {/* AI 기능 */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium">AI 기능</h4>

        <div className="flex items-center justify-between space-x-2">
          <Label htmlFor="ai-suggestions" className="flex flex-col space-y-1">
            <span>AI 명령어 제안</span>
            <span className="font-normal text-xs text-muted-foreground">
              자연어 입력 시 AI가 명령어를 제안합니다
            </span>
          </Label>
          <Switch
            id="ai-suggestions"
            checked={showAISuggestions}
            onCheckedChange={toggleAISuggestions}
          />
        </div>

        <div className="flex items-center justify-between space-x-2">
          <Label htmlFor="auto-analysis" className="flex flex-col space-y-1">
            <span>에러 자동 분석</span>
            <span className="font-normal text-xs text-muted-foreground">
              명령어 실행 실패 시 자동으로 원인을 분석합니다
            </span>
          </Label>
          <Switch
            id="auto-analysis"
            checked={enableAutoAnalysis}
            onCheckedChange={setEnableAutoAnalysis}
          />
        </div>
      </div>

      <Separator />

      {/* UI 설정 */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium">UI 설정</h4>

        <div className="space-y-2">
          <Label htmlFor="view-mode">뷰 모드</Label>
          <Select
            value={terminalViewMode}
            onValueChange={(value: 'blocks' | 'traditional') => setTerminalViewMode(value)}
          >
            <SelectTrigger id="view-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="blocks">블록 모드 (Warp 스타일)</SelectItem>
              <SelectItem value="traditional">전통적 터미널</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            블록 모드: 명령어를 개별 블록으로 표시
            <br />
            전통적 터미널: 연속적인 출력 화면
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="max-history">최대 히스토리 블록 수</Label>
          <Input
            id="max-history"
            type="number"
            value={maxHistoryBlocks}
            onChange={(e) => {
              // TODO: Store에 setMaxHistoryBlocks 액션 추가 필요
              const value = parseInt(e.target.value);
              if (!isNaN(value) && value > 0) {
                // 임시로 로컬 상태로만 처리
              }
            }}
            min={10}
            max={1000}
            step={10}
          />
          <p className="text-xs text-muted-foreground">저장할 최대 명령어 블록 수 (10-1000)</p>
        </div>
      </div>

      <Separator />

      {/* 고급 설정 */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium">고급 설정</h4>

        <div className="space-y-2">
          <Label htmlFor="shell">기본 셸</Label>
          <Select defaultValue="bash">
            <SelectTrigger id="shell">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bash">Bash</SelectItem>
              <SelectItem value="zsh">Zsh</SelectItem>
              <SelectItem value="fish">Fish</SelectItem>
              <SelectItem value="powershell">PowerShell</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">명령어 실행에 사용할 기본 셸</p>
        </div>

        <div className="flex items-center justify-between space-x-2">
          <Label htmlFor="rag-search" className="flex flex-col space-y-1">
            <span>RAG 기반 명령어 검색</span>
            <span className="font-normal text-xs text-muted-foreground">
              유사한 명령어를 벡터 검색으로 찾습니다 (Phase 5)
            </span>
          </Label>
          <Switch id="rag-search" disabled />
        </div>
      </div>
    </div>
  );
}
