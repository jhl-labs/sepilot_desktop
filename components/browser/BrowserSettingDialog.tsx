'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { FolderOpen, RotateCcw } from 'lucide-react';
import { isElectron } from '@/lib/platform';
import { useChatStore } from '@/lib/store/chat-store';

interface BrowserSettingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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

export function BrowserSettingDialog({ open, onOpenChange }: BrowserSettingDialogProps) {
  const [snapshotsPath, setSnapshotsPath] = useState<string>('');
  const [bookmarksPath, setBookmarksPath] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const {
    browserChatFontConfig,
    setBrowserChatFontConfig,
    resetBrowserChatFontConfig,
  } = useChatStore();

  // 폰트 설정 로컬 상태
  const [fontFamily, setFontFamily] = useState(browserChatFontConfig.fontFamily);
  const [fontSize, setFontSize] = useState(browserChatFontConfig.fontSize);

  // Load paths when dialog opens
  useEffect(() => {
    if (!open || !isElectron() || !window.electronAPI) {return;}

    const loadPaths = async () => {
      setIsLoading(true);
      try {
        const result = await window.electronAPI.browserView.getBrowserSettings();
        if (result.success && result.data) {
          setSnapshotsPath(result.data.snapshotsPath);
          setBookmarksPath(result.data.bookmarksPath);
        }
      } catch (error) {
        console.error('[BrowserSettingDialog] Error loading settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadPaths();
  }, [open]);

  const handleOpenSnapshotsFolder = async () => {
    if (!isElectron() || !window.electronAPI) {return;}

    try {
      await window.electronAPI.shell.openExternal(`file://${snapshotsPath}`);
    } catch (error) {
      console.error('[BrowserSettingDialog] Error opening snapshots folder:', error);
    }
  };

  const handleOpenBookmarksFolder = async () => {
    if (!isElectron() || !window.electronAPI) {return;}

    try {
      await window.electronAPI.shell.openExternal(`file://${bookmarksPath}`);
    } catch (error) {
      console.error('[BrowserSettingDialog] Error opening bookmarks folder:', error);
    }
  };

  // 폰트 설정 저장
  const handleSaveFontConfig = () => {
    setBrowserChatFontConfig({
      fontFamily,
      fontSize,
    });
    alert('폰트 설정이 저장되었습니다.');
  };

  // 폰트 설정 초기화
  const handleResetFontConfig = () => {
    if (confirm('폰트 설정을 기본값으로 초기화하시겠습니까?')) {
      resetBrowserChatFontConfig();
      setFontFamily('system-ui, -apple-system, sans-serif');
      setFontSize(14);
      alert('폰트 설정이 초기화되었습니다.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Browser 설정</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <p className="text-sm">로딩 중...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 스냅샷 저장 경로 */}
            <div className="space-y-2">
              <Label>스냅샷 저장 경로</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm">
                  {snapshotsPath || '경로를 불러오는 중...'}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleOpenSnapshotsFolder}
                  title="폴더 열기"
                  disabled={!snapshotsPath}
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
              <Label>북마크 저장 경로</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm">
                  {bookmarksPath || '경로를 불러오는 중...'}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleOpenBookmarksFolder}
                  title="폴더 열기"
                  disabled={!bookmarksPath}
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                북마크 데이터가 저장되는 위치입니다.
              </p>
            </div>

            {/* Browser Chat 폰트 설정 */}
            <div className="border-t pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="font-semibold">Browser Chat 폰트 설정</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetFontConfig}
                  className="h-8 gap-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  초기화
                </Button>
              </div>

              {/* Font Family */}
              <div className="space-y-2">
                <Label className="text-sm">폰트</Label>
                <Select
                  value={fontFamily}
                  onValueChange={setFontFamily}
                >
                  <SelectTrigger className="w-full">
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
              <div className="space-y-2">
                <Label className="text-sm">폰트 크기 (px)</Label>
                <Input
                  type="number"
                  value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                  min={10}
                  max={24}
                  step={1}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  채팅 메시지의 폰트 크기 (10-24px, 기본값: 14px)
                </p>
              </div>

              {/* 미리보기 */}
              <div className="space-y-2">
                <Label className="text-sm">미리보기</Label>
                <div
                  className="rounded-md border bg-muted p-3"
                  style={{
                    fontFamily,
                    fontSize: `${fontSize}px`,
                  }}
                >
                  <p>사용자: 안녕하세요!</p>
                  <p className="mt-2">AI: 안녕하세요! 무엇을 도와드릴까요?</p>
                  <p className="mt-2">English: Hello, how can I help you?</p>
                  <p className="mt-2">日本語: こんにちは、お手伝いできますか？</p>
                </div>
              </div>

              {/* 저장 버튼 */}
              <Button
                onClick={handleSaveFontConfig}
                className="w-full"
              >
                폰트 설정 저장
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
