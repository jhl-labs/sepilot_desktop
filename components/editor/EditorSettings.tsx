'use client';

import { useState } from 'react';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useChatStore } from '@/lib/store/chat-store';
import { EDITOR_AVAILABLE_FONTS } from '@/types/editor-settings';

export function EditorSettings() {
  const {
    setEditorViewMode,
    editorAppearanceConfig,
    setEditorAppearanceConfig,
    resetEditorAppearanceConfig,
    editorLLMPromptsConfig,
    setEditorLLMPromptsConfig,
    resetEditorLLMPromptsConfig,
  } = useChatStore();

  // 외형 설정 로컬 상태
  const [fontSize, setFontSize] = useState(editorAppearanceConfig.fontSize);
  const [fontFamily, setFontFamily] = useState(editorAppearanceConfig.fontFamily);
  const [theme, setTheme] = useState(editorAppearanceConfig.theme);
  const [tabSize, setTabSize] = useState(editorAppearanceConfig.tabSize);
  const [wordWrap, setWordWrap] = useState(editorAppearanceConfig.wordWrap);
  const [minimap, setMinimap] = useState(editorAppearanceConfig.minimap);
  const [lineNumbers, setLineNumbers] = useState(editorAppearanceConfig.lineNumbers);

  // LLM 프롬프트 로컬 상태
  const [autoCompletePrompt, setAutoCompletePrompt] = useState(
    editorLLMPromptsConfig.autoCompletePrompt
  );
  const [explainCodePrompt, setExplainCodePrompt] = useState(
    editorLLMPromptsConfig.explainCodePrompt
  );
  const [refactorCodePrompt, setRefactorCodePrompt] = useState(
    editorLLMPromptsConfig.refactorCodePrompt
  );
  const [fixBugPrompt, setFixBugPrompt] = useState(editorLLMPromptsConfig.fixBugPrompt);
  const [addCommentsPrompt, setAddCommentsPrompt] = useState(
    editorLLMPromptsConfig.addCommentsPrompt
  );
  const [generateTestPrompt, setGenerateTestPrompt] = useState(
    editorLLMPromptsConfig.generateTestPrompt
  );

  // 외형 설정 저장
  const handleSaveAppearance = () => {
    setEditorAppearanceConfig({
      fontSize,
      fontFamily,
      theme,
      tabSize,
      wordWrap,
      minimap,
      lineNumbers,
    });
    // 설정이 즉시 적용되므로 alert 없이 Files 뷰로 자동 전환
    setEditorViewMode('files');
  };

  // 외형 설정 초기화
  const handleResetAppearance = () => {
    if (window.confirm('외형 설정을 기본값으로 초기화하시겠습니까?')) {
      resetEditorAppearanceConfig();
      const config = useChatStore.getState().editorAppearanceConfig;
      setFontSize(config.fontSize);
      setFontFamily(config.fontFamily);
      setTheme(config.theme);
      setTabSize(config.tabSize);
      setWordWrap(config.wordWrap);
      setMinimap(config.minimap);
      setLineNumbers(config.lineNumbers);
      // 초기화 후 자동으로 Files 뷰로 전환
      setEditorViewMode('files');
    }
  };

  // LLM 프롬프트 저장
  const handleSavePrompts = () => {
    setEditorLLMPromptsConfig({
      autoCompletePrompt,
      explainCodePrompt,
      refactorCodePrompt,
      fixBugPrompt,
      addCommentsPrompt,
      generateTestPrompt,
    });
    // 저장 후 자동으로 Files 뷰로 전환
    setEditorViewMode('files');
  };

  // LLM 프롬프트 초기화
  const handleResetPrompts = () => {
    if (window.confirm('LLM 프롬프트 설정을 기본값으로 초기화하시겠습니까?')) {
      resetEditorLLMPromptsConfig();
      const config = useChatStore.getState().editorLLMPromptsConfig;
      setAutoCompletePrompt(config.autoCompletePrompt);
      setExplainCodePrompt(config.explainCodePrompt);
      setRefactorCodePrompt(config.refactorCodePrompt);
      setFixBugPrompt(config.fixBugPrompt);
      setAddCommentsPrompt(config.addCommentsPrompt);
      setGenerateTestPrompt(config.generateTestPrompt);
      window.alert('LLM 프롬프트 설정이 초기화되었습니다.');
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b p-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setEditorViewMode('files')}
            className="h-7 w-7"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-sm font-semibold">Editor 설정</h2>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-6">
        {/* 외형 설정 */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">외형 설정</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetAppearance}
              className="h-7 text-xs gap-1"
            >
              <RotateCcw className="h-3 w-3" />
              초기화
            </Button>
          </div>

          {/* 폰트 크기 */}
          <div className="space-y-1.5">
            <Label className="text-xs">폰트 크기 (px)</Label>
            <Input
              type="number"
              value={fontSize}
              onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
              min={10}
              max={24}
              step={1}
              className="h-8 text-xs"
            />
            <p className="text-xs text-muted-foreground">
              에디터 폰트 크기 (10-24px, 기본값: 14px)
            </p>
          </div>

          {/* 폰트 종류 */}
          <div className="space-y-1.5">
            <Label className="text-xs">폰트</Label>
            <Select value={fontFamily} onValueChange={setFontFamily}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="폰트를 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {EDITOR_AVAILABLE_FONTS.map((font) => (
                  <SelectItem key={font.value} value={font.value}>
                    <span style={{ fontFamily: font.value }}>{font.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">에디터에 사용할 폰트를 선택하세요.</p>
          </div>

          {/* 테마 */}
          <div className="space-y-1.5">
            <Label className="text-xs">테마</Label>
            <Select
              value={theme}
              onValueChange={(value: 'vs-dark' | 'vs-light') => setTheme(value)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vs-dark">Dark</SelectItem>
                <SelectItem value="vs-light">Light</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">에디터 색상 테마 (기본값: Dark)</p>
          </div>

          {/* 탭 크기 */}
          <div className="space-y-1.5">
            <Label className="text-xs">탭 크기</Label>
            <Select
              value={String(tabSize)}
              onValueChange={(value) => setTabSize(parseInt(value, 10))}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">2 spaces</SelectItem>
                <SelectItem value="4">4 spaces</SelectItem>
                <SelectItem value="8">8 spaces</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">들여쓰기 크기 (기본값: 2)</p>
          </div>

          {/* Word Wrap */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">자동 줄바꿈</Label>
              <Switch
                checked={wordWrap === 'on'}
                onCheckedChange={(checked) => setWordWrap(checked ? 'on' : 'off')}
              />
            </div>
            <p className="text-xs text-muted-foreground">긴 줄을 자동으로 줄바꿈 (기본값: Off)</p>
          </div>

          {/* Minimap */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">미니맵 표시</Label>
              <Switch checked={minimap} onCheckedChange={setMinimap} />
            </div>
            <p className="text-xs text-muted-foreground">우측 미니맵 표시 여부 (기본값: On)</p>
          </div>

          {/* Line Numbers */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">줄 번호 표시</Label>
              <Switch
                checked={lineNumbers === 'on'}
                onCheckedChange={(checked) => setLineNumbers(checked ? 'on' : 'off')}
              />
            </div>
            <p className="text-xs text-muted-foreground">좌측 줄 번호 표시 여부 (기본값: On)</p>
          </div>

          {/* 미리보기 */}
          <div className="space-y-1.5">
            <Label className="text-xs">미리보기</Label>
            <div
              className="rounded-md border bg-muted p-3 font-mono overflow-x-auto"
              style={{
                fontSize: `${fontSize}px`,
                fontFamily,
                whiteSpace: wordWrap === 'on' ? 'pre-wrap' : 'pre',
              }}
            >
              <div className="flex gap-2">
                {lineNumbers === 'on' && (
                  <div className="text-muted-foreground select-none">
                    <div>1</div>
                    <div>2</div>
                    <div>3</div>
                  </div>
                )}
                <div className="flex-1">
                  <div>function hello() {'{'}</div>
                  <div> console.log(&apos;Hello, World!&apos;);</div>
                  <div>{'}'}</div>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">현재 설정이 적용된 코드 미리보기</p>
          </div>

          {/* 저장 버튼 */}
          <Button onClick={handleSaveAppearance} className="w-full h-8 text-xs">
            외형 설정 저장
          </Button>
        </div>

        {/* LLM 프롬프트 설정 */}
        <div className="border-t pt-4 space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">LLM 프롬프트 설정</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetPrompts}
              className="h-7 text-xs gap-1"
            >
              <RotateCcw className="h-3 w-3" />
              초기화
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            자동 완성 및 컨텍스트 메뉴에서 사용되는 LLM 프롬프트를 커스터마이징할 수 있습니다.
          </p>

          {/* Auto Complete Prompt */}
          <div className="space-y-1.5">
            <Label className="text-xs">자동 완성 프롬프트</Label>
            <Textarea
              value={autoCompletePrompt}
              onChange={(e) => setAutoCompletePrompt(e.target.value)}
              className="min-h-[60px] text-xs font-mono"
              placeholder="자동 완성에 사용될 프롬프트..."
            />
          </div>

          {/* Explain Code Prompt */}
          <div className="space-y-1.5">
            <Label className="text-xs">코드 설명 프롬프트</Label>
            <Textarea
              value={explainCodePrompt}
              onChange={(e) => setExplainCodePrompt(e.target.value)}
              className="min-h-[60px] text-xs font-mono"
              placeholder="코드 설명에 사용될 프롬프트..."
            />
          </div>

          {/* Refactor Code Prompt */}
          <div className="space-y-1.5">
            <Label className="text-xs">리팩토링 프롬프트</Label>
            <Textarea
              value={refactorCodePrompt}
              onChange={(e) => setRefactorCodePrompt(e.target.value)}
              className="min-h-[60px] text-xs font-mono"
              placeholder="리팩토링에 사용될 프롬프트..."
            />
          </div>

          {/* Fix Bug Prompt */}
          <div className="space-y-1.5">
            <Label className="text-xs">버그 수정 프롬프트</Label>
            <Textarea
              value={fixBugPrompt}
              onChange={(e) => setFixBugPrompt(e.target.value)}
              className="min-h-[60px] text-xs font-mono"
              placeholder="버그 수정에 사용될 프롬프트..."
            />
          </div>

          {/* Add Comments Prompt */}
          <div className="space-y-1.5">
            <Label className="text-xs">주석 추가 프롬프트</Label>
            <Textarea
              value={addCommentsPrompt}
              onChange={(e) => setAddCommentsPrompt(e.target.value)}
              className="min-h-[60px] text-xs font-mono"
              placeholder="주석 추가에 사용될 프롬프트..."
            />
          </div>

          {/* Generate Test Prompt */}
          <div className="space-y-1.5">
            <Label className="text-xs">테스트 생성 프롬프트</Label>
            <Textarea
              value={generateTestPrompt}
              onChange={(e) => setGenerateTestPrompt(e.target.value)}
              className="min-h-[60px] text-xs font-mono"
              placeholder="테스트 생성에 사용될 프롬프트..."
            />
          </div>

          {/* 저장 버튼 */}
          <Button onClick={handleSavePrompts} className="w-full h-8 text-xs">
            LLM 프롬프트 저장
          </Button>
        </div>
      </div>
    </div>
  );
}
