'use client';

import { useEffect, useState } from 'react';
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
  const [maxTokens, setMaxTokens] = useState(browserAgentLLMConfig.maxTokens);
  const [temperature, setTemperature] = useState(browserAgentLLMConfig.temperature);
  const [topP, setTopP] = useState(browserAgentLLMConfig.topP);
  const [maxIterations, setMaxIterations] = useState(browserAgentLLMConfig.maxIterations);

  // 폰트 설정 로컬 상태
  const [fontFamily, setFontFamily] = useState(browserChatFontConfig.fontFamily);
  const [fontSize, setFontSize] = useState(browserChatFontConfig.fontSize);

  // 폰트 설정 저장
  const handleSaveFontConfig = () => {
    setBrowserChatFontConfig({
      fontFamily,
      fontSize,
    });
    window.alert('폰트 설정이 저장되었습니다.');
  };

  // 폰트 설정 초기화
  const handleResetFontConfig = () => {
    if (window.confirm('폰트 설정을 기본값으로 초기화하시겠습니까?')) {
      resetBrowserChatFontConfig();
      setFontFamily('system-ui, -apple-system, sans-serif');
      setFontSize(14);
      window.alert('폰트 설정이 초기화되었습니다.');
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
    window.alert('Browser Agent LLM 설정이 저장되었습니다.');
  };

  // LLM 설정 초기화
  const handleResetLLMConfig = () => {
    if (window.confirm('Browser Agent LLM 설정을 기본값으로 초기화하시겠습니까?')) {
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
      window.alert('Browser Agent LLM 설정이 초기화되었습니다.');
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
        <h2 className="text-sm font-semibold">Browser 설정</h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <p className="text-sm">로딩 중...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 스냅샷 저장 경로 */}
            <div className="space-y-2">
              <Label className="text-xs">스냅샷 저장 경로</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-md border bg-muted px-2 py-1.5 text-xs break-all">
                  {snapshotsPath || '경로를 불러오는 중...'}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleOpenSnapshotsFolder}
                  title="폴더 열기"
                  disabled={!snapshotsPath}
                  className="h-8 w-8 shrink-0"
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                페이지 캡처로 저장된 스냅샷 파일이 저장되는 위치입니다.
              </p>
            </div>

            {/* 북마크 저장 경로 */}
            <div className="space-y-2">
              <Label className="text-xs">북마크 저장 경로</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-md border bg-muted px-2 py-1.5 text-xs break-all">
                  {bookmarksPath || '경로를 불러오는 중...'}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleOpenBookmarksFolder}
                  title="폴더 열기"
                  disabled={!bookmarksPath}
                  className="h-8 w-8 shrink-0"
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">북마크 데이터가 저장되는 위치입니다.</p>
            </div>

            {/* Browser Agent LLM 설정 */}
            <div className="border-t pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Browser Agent LLM 설정</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetLLMConfig}
                  className="h-7 text-xs gap-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  초기화
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
                  응답 최대 길이 (256-16384, 기본값: 4096)
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
                  창의성 조절 (0-2, 기본값: 0.7, 낮을수록 일관적)
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
                <p className="text-xs text-muted-foreground">응답 다양성 (0-1, 기본값: 1.0)</p>
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
                <p className="text-xs text-muted-foreground">최대 반복 횟수 (1-50, 기본값: 20)</p>
              </div>

              {/* 저장 버튼 */}
              <Button onClick={handleSaveLLMConfig} className="w-full h-8 text-xs">
                설정 저장
              </Button>
            </div>

            {/* Browser Chat 폰트 설정 */}
            <div className="border-t pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Browser Chat 폰트 설정</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetFontConfig}
                  className="h-7 text-xs gap-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  초기화
                </Button>
              </div>

              {/* Font Family */}
              <div className="space-y-1.5">
                <Label className="text-xs">폰트</Label>
                <Select value={fontFamily} onValueChange={setFontFamily}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="폰트를 선택하세요" />
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
                  채팅 메시지에 사용할 폰트를 선택하세요.
                </p>
              </div>

              {/* Font Size */}
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
                  채팅 메시지의 폰트 크기 (10-24px, 기본값: 14px)
                </p>
              </div>

              {/* 미리보기 */}
              <div className="space-y-1.5">
                <Label className="text-xs">미리보기</Label>
                <div
                  className="rounded-md border bg-muted p-2 text-xs"
                  style={{
                    fontFamily,
                    fontSize: `${fontSize}px`,
                  }}
                >
                  <p>사용자: 안녕하세요!</p>
                  <p className="mt-1">AI: 안녕하세요! 무엇을 도와드릴까요?</p>
                  <p className="mt-1">English: Hello, how can I help you?</p>
                  <p className="mt-1">日本語: こんにちは、お手伝いできますか？</p>
                </div>
              </div>

              {/* 저장 버튼 */}
              <Button onClick={handleSaveFontConfig} className="w-full h-8 text-xs">
                폰트 설정 저장
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
