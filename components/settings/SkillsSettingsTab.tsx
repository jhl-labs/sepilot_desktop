'use client';

import { useState } from 'react';
import { SkillManager } from '@/components/skills/SkillManager';
import { Button } from '@/components/ui/button';
import { Store, Plus, Info } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';

export function SkillsSettingsTab() {
  const [skillsRefreshKey, setSkillsRefreshKey] = useState(0);

  const handleOpenMarketplace = () => {
    // TODO: Phase 2에서 마켓플레이스 다이얼로그 구현
    console.log('[SkillsSettings] Open marketplace - Not yet implemented');
  };

  const handleImportLocal = () => {
    // TODO: Phase 2에서 로컬 스킬 가져오기 구현
    console.log('[SkillsSettings] Import local skill - Not yet implemented');
  };

  return (
    <div className="space-y-6">
      {/* 안내 메시지 */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Skills 시스템</AlertTitle>
        <AlertDescription>
          Skills는 AI 에이전트에 특정 도메인 지식을 주입하여 전문성을 향상시킵니다.
          <br />
          마켓플레이스에서 커뮤니티가 제작한 스킬을 다운로드하거나 직접 제작할 수 있습니다.
        </AlertDescription>
      </Alert>

      {/* 액션 버튼 */}
      <div className="flex items-center gap-2">
        <Button onClick={handleOpenMarketplace} disabled>
          <Store className="mr-2 h-4 w-4" />
          마켓플레이스 열기
          <span className="ml-2 rounded bg-primary/20 px-1.5 py-0.5 text-xs">준비 중</span>
        </Button>
        <Button variant="outline" onClick={handleImportLocal} disabled>
          <Plus className="mr-2 h-4 w-4" />
          로컬에서 가져오기
          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">준비 중</span>
        </Button>
      </div>

      {/* 스킬 목록 */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">설치된 스킬</h3>
          <p className="text-sm text-muted-foreground">
            현재 설치된 스킬을 관리하고 활성화/비활성화할 수 있습니다.
          </p>
        </div>
        <SkillManager
          key={skillsRefreshKey}
          onRefresh={() => {
            setSkillsRefreshKey((prev) => prev + 1);
          }}
        />
      </div>
    </div>
  );
}
