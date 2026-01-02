'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, RotateCcw, Code, FileText, Link } from 'lucide-react';
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
  const { t } = useTranslation();
  const {
    setEditorViewMode,
    editorAppearanceConfig,
    setEditorAppearanceConfig,
    resetEditorAppearanceConfig,
    editorLLMPromptsConfig,
    setEditorLLMPromptsConfig,
  } = useChatStore();

  // 외형 설정 로컬 상태
  const [fontSize, setFontSize] = useState(editorAppearanceConfig.fontSize);
  const [fontFamily, setFontFamily] = useState(editorAppearanceConfig.fontFamily);
  const [theme, setTheme] = useState(editorAppearanceConfig.theme);
  const [tabSize, setTabSize] = useState(editorAppearanceConfig.tabSize);
  const [wordWrap, setWordWrap] = useState(editorAppearanceConfig.wordWrap);
  const [minimap, setMinimap] = useState(editorAppearanceConfig.minimap);
  const [lineNumbers, setLineNumbers] = useState(editorAppearanceConfig.lineNumbers);

  // LLM Configuration State
  const [llmConfig, setLlmConfig] = useState<any>(null); // Using any for simplicity as we need deep access

  useEffect(() => {
    const loadConfig = async () => {
      if (typeof window === 'undefined') {
        return;
      }

      try {
        let configData = null;

        // Try to load from localStorage first (Web/Electron fallback)
        const savedConfigV2 = localStorage.getItem('sepilot_llm_config_v2');
        if (savedConfigV2) {
          configData = JSON.parse(savedConfigV2);
        } else {
          // Fallback to V1 config if V2 is missing
          const savedConfig = localStorage.getItem('sepilot_llm_config');
          if (savedConfig) {
            configData = JSON.parse(savedConfig);
          }
        }

        // If in Electron, try to load specific config but usually localStorage cache is enough for display
        // We stick to localStorage for speed and simplicity in this UI component
        // assuming SettingsDialog updates localStorage on save.

        if (configData) {
          setLlmConfig(configData);
        }
      } catch (error) {
        console.error('Failed to load LLM config for display:', error);
      }
    };
    loadConfig();

    // Listen for config updates
    const handleConfigUpdate = (event: CustomEvent) => {
      if (event.detail?.llm) {
        setLlmConfig(event.detail.llm);
      }
    };

    window.addEventListener('sepilot:config-updated', handleConfigUpdate as EventListener);
    return () => {
      window.removeEventListener('sepilot:config-updated', handleConfigUpdate as EventListener);
    };
  }, []);

  // Derive model names
  const getModelName = (modelId?: string) => {
    if (!modelId || !llmConfig) {
      return null;
    }

    // Check if V2 config (has models array)
    if (llmConfig.models && Array.isArray(llmConfig.models)) {
      const model = llmConfig.models.find((m: any) => m.id === modelId);
      return model ? model.name || model.modelId : modelId;
    }

    // Fallback for V1 config (less likely to be strictly correct for IDs but best effort)
    return modelId;
  };

  const activeBaseModelName = getModelName(llmConfig?.activeBaseModelId || llmConfig?.model);
  const activeAutocompleteModelName = getModelName(
    llmConfig?.activeAutocompleteModelId || llmConfig?.autocomplete?.model
  );

  // 코드용 AI 프롬프트 로컬 상태
  const [explainCodePrompt, setExplainCodePrompt] = useState(
    editorLLMPromptsConfig.explainCodePrompt
  );
  const [fixCodePrompt, setFixCodePrompt] = useState(editorLLMPromptsConfig.fixCodePrompt);
  const [improveCodePrompt, setImproveCodePrompt] = useState(
    editorLLMPromptsConfig.improveCodePrompt
  );
  const [completeCodePrompt, setCompleteCodePrompt] = useState(
    editorLLMPromptsConfig.completeCodePrompt
  );
  const [addCommentsPrompt, setAddCommentsPrompt] = useState(
    editorLLMPromptsConfig.addCommentsPrompt
  );
  const [generateTestPrompt, setGenerateTestPrompt] = useState(
    editorLLMPromptsConfig.generateTestPrompt
  );

  // 문서용 AI 프롬프트 로컬 상태
  const [continueWritingPrompt, setContinueWritingPrompt] = useState(
    editorLLMPromptsConfig.continueWritingPrompt
  );
  const [makeShorterPrompt, setMakeShorterPrompt] = useState(
    editorLLMPromptsConfig.makeShorterPrompt
  );
  const [makeLongerPrompt, setMakeLongerPrompt] = useState(editorLLMPromptsConfig.makeLongerPrompt);

  const [fixGrammarPrompt, setFixGrammarPrompt] = useState(editorLLMPromptsConfig.fixGrammarPrompt);
  const [summarizePrompt, setSummarizePrompt] = useState(editorLLMPromptsConfig.summarizePrompt);
  const [translatePrompt, setTranslatePrompt] = useState(editorLLMPromptsConfig.translatePrompt);

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
    if (window.confirm(t('settings.editor.settings.appearance.resetConfirm'))) {
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
      // 코드용 AI
      explainCodePrompt,
      fixCodePrompt,
      improveCodePrompt,
      completeCodePrompt,
      addCommentsPrompt,
      generateTestPrompt,
      // 문서용 AI
      continueWritingPrompt,
      makeShorterPrompt,
      makeLongerPrompt,
      simplifyPrompt: editorLLMPromptsConfig.simplifyPrompt, // UI에 표시되지 않지만 타입에 필요
      fixGrammarPrompt,
      summarizePrompt,
      translatePrompt,
    });
    // 저장 후 자동으로 Files 뷰로 전환
    setEditorViewMode('files');
  };

  // LLM 프롬프트 초기화
  const handleResetPrompts = () => {
    if (window.confirm(t('settings.editor.settings.prompts.resetConfirm'))) {
      // 번역된 기본값 사용
      const defaultPrompts = {
        // 코드용 AI
        explainCodePrompt: t('settings.editor.settings.prompts.defaults.explainCode'),
        fixCodePrompt: t('settings.editor.settings.prompts.defaults.fixCode'),
        improveCodePrompt: t('settings.editor.settings.prompts.defaults.improveCode'),
        completeCodePrompt: t('settings.editor.settings.prompts.defaults.completeCode'),
        addCommentsPrompt: t('settings.editor.settings.prompts.defaults.addComments'),
        generateTestPrompt: t('settings.editor.settings.prompts.defaults.generateTest'),
        // 문서용 AI
        continueWritingPrompt: t('settings.editor.settings.prompts.defaults.continueWriting'),
        makeShorterPrompt: t('settings.editor.settings.prompts.defaults.makeShorter'),
        makeLongerPrompt: t('settings.editor.settings.prompts.defaults.makeLonger'),
        simplifyPrompt: t('settings.editor.settings.prompts.defaults.simplify'),
        fixGrammarPrompt: t('settings.editor.settings.prompts.defaults.fixGrammar'),
        summarizePrompt: t('settings.editor.settings.prompts.defaults.summarize'),
        translatePrompt: t('settings.editor.settings.prompts.defaults.translate'),
      };

      // 번역된 기본값으로 설정 저장
      setEditorLLMPromptsConfig({
        ...defaultPrompts,
        simplifyPrompt: defaultPrompts.simplifyPrompt,
      });

      // 로컬 상태 업데이트
      setExplainCodePrompt(defaultPrompts.explainCodePrompt);
      setFixCodePrompt(defaultPrompts.fixCodePrompt);
      setImproveCodePrompt(defaultPrompts.improveCodePrompt);
      setCompleteCodePrompt(defaultPrompts.completeCodePrompt);
      setAddCommentsPrompt(defaultPrompts.addCommentsPrompt);
      setGenerateTestPrompt(defaultPrompts.generateTestPrompt);
      setContinueWritingPrompt(defaultPrompts.continueWritingPrompt);
      setMakeShorterPrompt(defaultPrompts.makeShorterPrompt);
      setMakeLongerPrompt(defaultPrompts.makeLongerPrompt);
      setFixGrammarPrompt(defaultPrompts.fixGrammarPrompt);
      setSummarizePrompt(defaultPrompts.summarizePrompt);
      setTranslatePrompt(defaultPrompts.translatePrompt);

      window.alert(t('settings.editor.settings.prompts.resetSuccess'));
    }
  };

  // 초기 로드 시 현재 설정이 기본값(한국어 하드코딩)인지 확인하고 번역된 값으로 업데이트
  useEffect(() => {
    const DEFAULT_KO_PROMPTS = {
      explainCodePrompt:
        '다음 코드가 무엇을 하는지 한국어로 설명해주세요. 간결하고 명확하게 작성해주세요.',
      fixCodePrompt:
        '다음 코드의 잠재적인 버그를 분석하고 수정해주세요. 수정된 코드만 반환하고, 문제점과 해결책을 주석으로 간략히 설명해주세요.',
      improveCodePrompt:
        '다음 코드의 가독성, 성능, 유지보수성을 개선해주세요. 개선된 코드만 반환하고, 주요 변경사항을 주석으로 간략히 설명해주세요.',
      completeCodePrompt:
        '컨텍스트를 기반으로 다음 코드를 완성해주세요. 완성할 코드만 반환하고, 설명은 포함하지 마세요.',
      addCommentsPrompt:
        '다음 코드에 명확하고 간결한 주석을 추가해주세요. 한국어로 주석을 작성하고, 코드의 의도와 로직을 설명해주세요.',
      generateTestPrompt:
        '다음 코드에 대한 단위 테스트를 생성해주세요. 해당 언어에 적합한 테스트 프레임워크를 사용하세요.',
      continueWritingPrompt:
        '다음 텍스트를 자연스럽게 이어서 작성해주세요. 문맥과 스타일을 유지하세요.',
      makeShorterPrompt: '다음 텍스트를 핵심 내용을 유지하면서 더 짧게 요약해주세요.',
      makeLongerPrompt:
        '다음 텍스트를 더 자세하고 풍부하게 확장해주세요. 추가적인 설명이나 예시를 포함하세요.',
      simplifyPrompt: '다음 텍스트를 더 간단하고 이해하기 쉬운 언어로 다시 작성해주세요.',
      fixGrammarPrompt:
        '다음 텍스트의 맞춤법과 문법 오류를 수정해주세요. 수정된 텍스트만 반환하세요.',
      summarizePrompt: '다음 내용의 핵심을 요약해주세요. 주요 포인트를 간결하게 정리해주세요.',
      translatePrompt:
        '다음 텍스트를 {targetLanguage}로 번역해주세요. 자연스러운 표현을 사용하세요.',
    };

    // 현재 설정이 기본 한국어 값과 일치하는지 확인
    const isDefaultKorean = Object.keys(DEFAULT_KO_PROMPTS).every(
      (key) =>
        editorLLMPromptsConfig[key as keyof typeof DEFAULT_KO_PROMPTS] ===
        DEFAULT_KO_PROMPTS[key as keyof typeof DEFAULT_KO_PROMPTS]
    );

    // 기본 한국어 값이면 번역된 값으로 업데이트 (한 번만 실행)
    if (isDefaultKorean) {
      const translatedDefaults = {
        explainCodePrompt: t('settings.editor.settings.prompts.defaults.explainCode'),
        fixCodePrompt: t('settings.editor.settings.prompts.defaults.fixCode'),
        improveCodePrompt: t('settings.editor.settings.prompts.defaults.improveCode'),
        completeCodePrompt: t('settings.editor.settings.prompts.defaults.completeCode'),
        addCommentsPrompt: t('settings.editor.settings.prompts.defaults.addComments'),
        generateTestPrompt: t('settings.editor.settings.prompts.defaults.generateTest'),
        continueWritingPrompt: t('settings.editor.settings.prompts.defaults.continueWriting'),
        makeShorterPrompt: t('settings.editor.settings.prompts.defaults.makeShorter'),
        makeLongerPrompt: t('settings.editor.settings.prompts.defaults.makeLonger'),
        simplifyPrompt: t('settings.editor.settings.prompts.defaults.simplify'),
        fixGrammarPrompt: t('settings.editor.settings.prompts.defaults.fixGrammar'),
        summarizePrompt: t('settings.editor.settings.prompts.defaults.summarize'),
        translatePrompt: t('settings.editor.settings.prompts.defaults.translate'),
      };

      setEditorLLMPromptsConfig(translatedDefaults);

      // 로컬 상태도 업데이트
      setExplainCodePrompt(translatedDefaults.explainCodePrompt);
      setFixCodePrompt(translatedDefaults.fixCodePrompt);
      setImproveCodePrompt(translatedDefaults.improveCodePrompt);
      setCompleteCodePrompt(translatedDefaults.completeCodePrompt);
      setAddCommentsPrompt(translatedDefaults.addCommentsPrompt);
      setGenerateTestPrompt(translatedDefaults.generateTestPrompt);
      setContinueWritingPrompt(translatedDefaults.continueWritingPrompt);
      setMakeShorterPrompt(translatedDefaults.makeShorterPrompt);
      setMakeLongerPrompt(translatedDefaults.makeLongerPrompt);
      setFixGrammarPrompt(translatedDefaults.fixGrammarPrompt);
      setSummarizePrompt(translatedDefaults.summarizePrompt);
      setTranslatePrompt(translatedDefaults.translatePrompt);
    }
  }, []); // 초기 마운트 시 한 번만 실행

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
          <h2 className="text-sm font-semibold">{t('settings.editor.settings.title')}</h2>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-6">
        {/* LLM Configuration (Read-only) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">LLM Configuration</Label>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled>
              <Link className="h-3 w-3" />
              Read Only
            </Button>
          </div>

          <div className="grid gap-3 p-3 border rounded-md bg-muted/30">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Autocomplete Model</Label>
              <div className="text-xs font-medium">
                {activeAutocompleteModelName || 'Not configured'}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Editor Chat Model</Label>
              <div className="text-xs font-medium">{activeBaseModelName || 'Not configured'}</div>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              * Managed in Settings &gt; LLM
            </div>
          </div>
        </div>

        {/* 외형 설정 */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">
              {t('settings.editor.settings.appearance.title')}
            </Label>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetAppearance}
              className="h-7 text-xs gap-1"
            >
              <RotateCcw className="h-3 w-3" />
              {t('settings.editor.settings.appearance.reset')}
            </Button>
          </div>

          {/* 폰트 크기 */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t('settings.editor.settings.appearance.fontSize')}</Label>
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
              {t('settings.editor.settings.appearance.fontSizeDescription')}
            </p>
          </div>

          {/* 폰트 종류 */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t('settings.editor.settings.appearance.fontFamily')}</Label>
            <Select value={fontFamily} onValueChange={setFontFamily}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue
                  placeholder={t('settings.editor.settings.appearance.fontFamilyPlaceholder')}
                />
              </SelectTrigger>
              <SelectContent>
                {EDITOR_AVAILABLE_FONTS.map((font) => (
                  <SelectItem key={font.value} value={font.value}>
                    <span style={{ fontFamily: font.value }}>{font.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('settings.editor.settings.appearance.fontFamilyDescription')}
            </p>
          </div>

          {/* 테마 */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t('settings.editor.settings.appearance.theme')}</Label>
            <Select
              value={theme}
              onValueChange={(value: 'vs-dark' | 'vs-light') => setTheme(value)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vs-dark">
                  {t('settings.editor.settings.appearance.themeDark')}
                </SelectItem>
                <SelectItem value="vs-light">
                  {t('settings.editor.settings.appearance.themeLight')}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('settings.editor.settings.appearance.themeDescription')}
            </p>
          </div>

          {/* 탭 크기 */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t('settings.editor.settings.appearance.tabSize')}</Label>
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
            <p className="text-xs text-muted-foreground">
              {t('settings.editor.settings.appearance.tabSizeDescription')}
            </p>
          </div>

          {/* Word Wrap */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">{t('settings.editor.settings.appearance.wordWrap')}</Label>
              <Switch
                checked={wordWrap === 'on'}
                onCheckedChange={(checked) => setWordWrap(checked ? 'on' : 'off')}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t('settings.editor.settings.appearance.wordWrapDescription')}
            </p>
          </div>

          {/* Minimap */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">{t('settings.editor.settings.appearance.minimap')}</Label>
              <Switch checked={minimap} onCheckedChange={setMinimap} />
            </div>
            <p className="text-xs text-muted-foreground">
              {t('settings.editor.settings.appearance.minimapDescription')}
            </p>
          </div>

          {/* Line Numbers */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">
                {t('settings.editor.settings.appearance.lineNumbers')}
              </Label>
              <Switch
                checked={lineNumbers === 'on'}
                onCheckedChange={(checked) => setLineNumbers(checked ? 'on' : 'off')}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t('settings.editor.settings.appearance.lineNumbersDescription')}
            </p>
          </div>

          {/* 미리보기 */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t('settings.editor.settings.appearance.preview')}</Label>
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
                  <div> logger.info(&apos;Hello, World!&apos;);</div>
                  <div>{'}'}</div>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('settings.editor.settings.appearance.previewDescription')}
            </p>
          </div>

          {/* 저장 버튼 */}
          <Button onClick={handleSaveAppearance} className="w-full h-8 text-xs">
            {t('settings.editor.settings.appearance.save')}
          </Button>
        </div>

        {/* LLM 프롬프트 설정 */}
        <div className="border-t pt-4 space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">
              {t('settings.editor.settings.prompts.title')}
            </Label>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetPrompts}
              className="h-7 text-xs gap-1"
            >
              <RotateCcw className="h-3 w-3" />
              {t('settings.editor.settings.prompts.reset')}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            {t('settings.editor.settings.prompts.description')}
          </p>

          {/* Group 1: Basic AI Editing (Writing AI) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-medium text-primary">
              <FileText className="h-3.5 w-3.5" />
              {t('settings.editor.settings.prompts.writingAi')}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                {t('settings.editor.settings.prompts.continueWriting')}
              </Label>
              <Textarea
                value={continueWritingPrompt}
                onChange={(e) => setContinueWritingPrompt(e.target.value)}
                className="min-h-[60px] text-xs font-mono"
                placeholder={t('settings.editor.settings.prompts.continueWritingPlaceholder')}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('settings.editor.settings.prompts.makeShorter')}</Label>
              <Textarea
                value={makeShorterPrompt}
                onChange={(e) => setMakeShorterPrompt(e.target.value)}
                className="min-h-[60px] text-xs font-mono"
                placeholder={t('settings.editor.settings.prompts.makeShorterPlaceholder')}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('settings.editor.settings.prompts.makeLonger')}</Label>
              <Textarea
                value={makeLongerPrompt}
                onChange={(e) => setMakeLongerPrompt(e.target.value)}
                className="min-h-[60px] text-xs font-mono"
                placeholder={t('settings.editor.settings.prompts.makeLongerPlaceholder')}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('settings.editor.settings.prompts.fixGrammar')}</Label>
              <Textarea
                value={fixGrammarPrompt}
                onChange={(e) => setFixGrammarPrompt(e.target.value)}
                className="min-h-[60px] text-xs font-mono"
                placeholder={t('settings.editor.settings.prompts.fixGrammarPlaceholder')}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('settings.editor.settings.prompts.summarize')}</Label>
              <Textarea
                value={summarizePrompt}
                onChange={(e) => setSummarizePrompt(e.target.value)}
                className="min-h-[60px] text-xs font-mono"
                placeholder={t('settings.editor.settings.prompts.summarizePlaceholder')}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('settings.editor.settings.prompts.translate')}</Label>
              <Textarea
                value={translatePrompt}
                onChange={(e) => setTranslatePrompt(e.target.value)}
                className="min-h-[60px] text-xs font-mono"
                placeholder={t('settings.editor.settings.prompts.translatePlaceholder')}
              />
            </div>
          </div>

          {/* Group 2: Code AI Editing */}
          <div className="space-y-3 border-t pt-3">
            <div className="flex items-center gap-2 text-xs font-medium text-primary">
              <Code className="h-3.5 w-3.5" />
              {t('settings.editor.settings.prompts.codeAi')}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('settings.editor.settings.prompts.explainCode')}</Label>
              <Textarea
                value={explainCodePrompt}
                onChange={(e) => setExplainCodePrompt(e.target.value)}
                className="min-h-[60px] text-xs font-mono"
                placeholder={t('settings.editor.settings.prompts.explainCodePlaceholder')}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('settings.editor.settings.prompts.fixCode')}</Label>
              <Textarea
                value={fixCodePrompt}
                onChange={(e) => setFixCodePrompt(e.target.value)}
                className="min-h-[60px] text-xs font-mono"
                placeholder={t('settings.editor.settings.prompts.fixCodePlaceholder')}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('settings.editor.settings.prompts.improveCode')}</Label>
              <Textarea
                value={improveCodePrompt}
                onChange={(e) => setImproveCodePrompt(e.target.value)}
                className="min-h-[60px] text-xs font-mono"
                placeholder={t('settings.editor.settings.prompts.improveCodePlaceholder')}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                {t('settings.editor.settings.prompts.completeCode')}
              </Label>
              <Textarea
                value={completeCodePrompt}
                onChange={(e) => setCompleteCodePrompt(e.target.value)}
                className="min-h-[60px] text-xs font-mono"
                placeholder={t('settings.editor.settings.prompts.completeCodePlaceholder')}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('settings.editor.settings.prompts.addComments')}</Label>
              <Textarea
                value={addCommentsPrompt}
                onChange={(e) => setAddCommentsPrompt(e.target.value)}
                className="min-h-[60px] text-xs font-mono"
                placeholder={t('settings.editor.settings.prompts.addCommentsPlaceholder')}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                {t('settings.editor.settings.prompts.generateTest')}
              </Label>
              <Textarea
                value={generateTestPrompt}
                onChange={(e) => setGenerateTestPrompt(e.target.value)}
                className="min-h-[60px] text-xs font-mono"
                placeholder={t('settings.editor.settings.prompts.generateTestPlaceholder')}
              />
            </div>
          </div>

          {/* 저장 버튼 */}
          <Button onClick={handleSavePrompts} className="w-full h-8 text-xs">
            {t('settings.editor.settings.prompts.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
