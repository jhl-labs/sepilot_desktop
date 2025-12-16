'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FolderOpen, ChevronLeft, RotateCcw } from 'lucide-react';
import { isElectron } from '@/lib/platform';
import { useChatStore } from '@/lib/store/chat-store';

// 사용 가능한 폰트 목록
const AVAILABLE_FONTS = [
  { value: 'system-ui, -apple-system, sans-serif', label: 'System Font' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Helvetica, sans-serif', label: 'Helvetica' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Times New Roman, serif', label: 'Times New Roman' },
  { value: 'Courier New, monospace', label: 'Courier New' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: 'Consolas, monospace', label: 'Consolas' },
  { value: '"Noto Sans KR", sans-serif', label: 'Noto Sans KR' },
  { value: '"Malgun Gothic", sans-serif', label: 'Malgun Gothic' },
];

export function BrowserSettings() {
  const { t } = useTranslation();
  const [snapshotsPath, setSnapshotsPath] = useState<string>('');
  const [bookmarksPath, setBookmarksPath] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const {
    setBrowserViewMode,
    browserAgentLLMConfig,
    setBrowserAgentLLMConfig,
    resetBrowserAgentLLMConfig,
    browserChatFontConfig,
    setBrowserChatFontConfig,
    resetBrowserChatFontConfig,
  } = useChatStore();

  // LLM 설정 로컬 상태
  const [maxTokens, setMaxTokens] = useState(browserAgentLLMConfig?.maxTokens ?? 4096);
  const [temperature, setTemperature] = useState(browserAgentLLMConfig?.temperature ?? 0.7);
  const [topP, setTopP] = useState(browserAgentLLMConfig?.topP ?? 1.0);
  const [maxIterations, setMaxIterations] = useState(browserAgentLLMConfig?.maxIterations ?? 30);

  // 폰트 설정 로컬 상태
  const [fontFamily, setFontFamily] = useState(
    browserChatFontConfig?.fontFamily ?? 'system-ui, -apple-system, sans-serif'
  );
  const [fontSize, setFontSize] = useState(browserChatFontConfig?.fontSize ?? 14);

  // 폰트 설정 저장
  const handleSaveFontConfig = () => {
    setBrowserChatFontConfig({
      fontFamily,
      fontSize,
    });
    window.alert(t('settings.browser.settings.font.saveSuccess'));
  };

  // 폰트 설정 초기화
  const handleResetFontConfig = () => {
    if (window.confirm(t('settings.browser.settings.font.resetConfirm'))) {
      resetBrowserChatFontConfig();
      setFontFamily('system-ui, -apple-system, sans-serif');
      setFontSize(14);
      window.alert(t('settings.browser.settings.font.resetSuccess'));
    }
  };

  // Load paths on mount
  useEffect(() => {
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    const loadPaths = async () => {
      setIsLoading(true);
      try {
        const result = await window.electronAPI.browserView.getBrowserSettings();
        if (result.success && result.data) {
          setSnapshotsPath(result.data.snapshotsPath);
          setBookmarksPath(result.data.bookmarksPath);
        }
      } catch (error) {
        console.error('[BrowserSettings] Error loading settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadPaths();
  }, []);

  const handleOpenSnapshotsFolder = async () => {
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    try {
      await window.electronAPI.shell.openExternal(`file://${snapshotsPath}`);
    } catch (error) {
      console.error('[BrowserSettings] Error opening snapshots folder:', error);
    }
  };

  const handleOpenBookmarksFolder = async () => {
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    try {
      await window.electronAPI.shell.openExternal(`file://${bookmarksPath}`);
    } catch (error) {
      console.error('[BrowserSettings] Error opening bookmarks folder:', error);
    }
  };

  // LLM 설정 저장
  const handleSaveLLMConfig = () => {
    setBrowserAgentLLMConfig({
      maxTokens,
      temperature,
      topP,
      maxIterations,
    });
    window.alert(t('settings.browser.settings.llm.saveSuccess'));
  };

  // LLM 설정 초기화
  const handleResetLLMConfig = () => {
    if (window.confirm(t('settings.browser.settings.llm.resetConfirm'))) {
      resetBrowserAgentLLMConfig();
      const defaultConfig = {
        maxTokens: 4096,
        temperature: 0.7,
        topP: 1.0,
        maxIterations: 30,
      };
      setMaxTokens(defaultConfig.maxTokens);
      setTemperature(defaultConfig.temperature);
      setTopP(defaultConfig.topP);
      setMaxIterations(defaultConfig.maxIterations);
      window.alert(t('settings.browser.settings.llm.resetSuccess'));
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b p-3 flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setBrowserViewMode('chat')}
          className="h-8 w-8"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-sm font-semibold">{t('settings.browser.settings.title')}</h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <p className="text-sm">{t('settings.browser.settings.loading')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 스냅샷 저장 경로 */}
            <div className="space-y-2">
              <Label className="text-xs">
                {t('settings.browser.settings.snapshotsPath.title')}
              </Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-md border bg-muted px-2 py-1.5 text-xs break-all">
                  {snapshotsPath || t('settings.browser.settings.snapshotsPath.loading')}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleOpenSnapshotsFolder}
                  title={t('settings.browser.settings.snapshotsPath.openFolder')}
                  disabled={!snapshotsPath}
                  className="h-8 w-8 shrink-0"
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('settings.browser.settings.snapshotsPath.description')}
              </p>
            </div>

            {/* 북마크 저장 경로 */}
            <div className="space-y-2">
              <Label className="text-xs">
                {t('settings.browser.settings.bookmarksPath.title')}
              </Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-md border bg-muted px-2 py-1.5 text-xs break-all">
                  {bookmarksPath || t('settings.browser.settings.bookmarksPath.loading')}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleOpenBookmarksFolder}
                  title={t('settings.browser.settings.bookmarksPath.openFolder')}
                  disabled={!bookmarksPath}
                  className="h-8 w-8 shrink-0"
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('settings.browser.settings.bookmarksPath.description')}
              </p>
            </div>

            {/* Browser Agent LLM 설정 */}
            <div className="border-t pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">
                  {t('settings.browser.settings.llm.title')}
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetLLMConfig}
                  className="h-7 text-xs gap-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  {t('settings.browser.settings.llm.reset')}
                </Button>
              </div>

              {/* Max Tokens */}
              <div className="space-y-1.5">
                <Label className="text-xs">Max Tokens</Label>
                <Input
                  type="number"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value, 10))}
                  min={256}
                  max={16384}
                  step={256}
                  className="h-8 text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  {t('settings.browser.settings.llm.maxTokens')}
                </p>
              </div>

              {/* Temperature */}
              <div className="space-y-1.5">
                <Label className="text-xs">Temperature</Label>
                <Input
                  type="number"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  min={0}
                  max={2}
                  step={0.1}
                  className="h-8 text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  {t('settings.browser.settings.llm.temperature')}
                </p>
              </div>

              {/* Top P */}
              <div className="space-y-1.5">
                <Label className="text-xs">Top P</Label>
                <Input
                  type="number"
                  value={topP}
                  onChange={(e) => setTopP(parseFloat(e.target.value))}
                  min={0}
                  max={1}
                  step={0.1}
                  className="h-8 text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  {t('settings.browser.settings.llm.topP')}
                </p>
              </div>

              {/* Max Iterations */}
              <div className="space-y-1.5">
                <Label className="text-xs">Max Iterations</Label>
                <Input
                  type="number"
                  value={maxIterations}
                  onChange={(e) => setMaxIterations(parseInt(e.target.value, 10))}
                  min={1}
                  max={50}
                  step={1}
                  className="h-8 text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  {t('settings.browser.settings.llm.maxIterations')}
                </p>
              </div>

              {/* 저장 버튼 */}
              <Button onClick={handleSaveLLMConfig} className="w-full h-8 text-xs">
                {t('settings.browser.settings.llm.save')}
              </Button>
            </div>

            {/* Browser Chat 폰트 설정 */}
            <div className="border-t pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">
                  {t('settings.browser.settings.font.title')}
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetFontConfig}
                  className="h-7 text-xs gap-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  {t('settings.browser.settings.font.reset')}
                </Button>
              </div>

              {/* Font Family */}
              <div className="space-y-1.5">
                <Label className="text-xs">{t('settings.browser.settings.font.family')}</Label>
                <Select value={fontFamily} onValueChange={setFontFamily}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue
                      placeholder={t('settings.browser.settings.font.familyPlaceholder')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_FONTS.map((font) => (
                      <SelectItem key={font.value} value={font.value}>
                        <span style={{ fontFamily: font.value }}>{font.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('settings.browser.settings.font.familyDescription')}
                </p>
              </div>

              {/* Font Size */}
              <div className="space-y-1.5">
                <Label className="text-xs">{t('settings.browser.settings.font.size')}</Label>
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
                  {t('settings.browser.settings.font.sizeDescription')}
                </p>
              </div>

              {/* 미리보기 */}
              <div className="space-y-1.5">
                <Label className="text-xs">{t('settings.browser.settings.font.preview')}</Label>
                <div
                  className="rounded-md border bg-muted p-2 text-xs"
                  style={{
                    fontFamily,
                    fontSize: `${fontSize}px`,
                  }}
                >
                  <p>{t('settings.browser.settings.font.previewUser')}</p>
                  <p className="mt-1">{t('settings.browser.settings.font.previewAi')}</p>
                  <p className="mt-1">English: Hello, how can I help you?</p>
                  <p className="mt-1">日本語: こんにちは、お手伝いできますか？</p>
                </div>
              </div>

              {/* 저장 버튼 */}
              <Button onClick={handleSaveFontConfig} className="w-full h-8 text-xs">
                {t('settings.browser.settings.font.save')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
