'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, ArrowRight, RotateCw, Home, Globe } from 'lucide-react';
import { isElectron } from '@/lib/platform';

export function BrowserPanel() {
  const [url, setUrl] = useState('https://www.google.com');
  const [currentUrl, setCurrentUrl] = useState(url);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleNavigate = () => {
    if (!isElectron() || !window.electronAPI) return;

    window.electronAPI.browserView.loadURL(url);
  };

  const handleBack = () => {
    if (!isElectron() || !window.electronAPI) return;

    window.electronAPI.browserView.goBack();
  };

  const handleForward = () => {
    if (!isElectron() || !window.electronAPI) return;

    window.electronAPI.browserView.goForward();
  };

  const handleReload = () => {
    if (!isElectron() || !window.electronAPI) return;

    window.electronAPI.browserView.reload();
  };

  const handleHome = () => {
    const homeUrl = 'https://www.google.com';
    setUrl(homeUrl);
    setCurrentUrl(homeUrl);

    if (isElectron() && window.electronAPI) {
      window.electronAPI.browserView.loadURL(homeUrl);
    }
  };

  // BrowserView 생성 및 초기 설정
  useEffect(() => {
    if (!isElectron() || !window.electronAPI) return;

    // BrowserView 생성
    window.electronAPI.browserView.create().then(() => {
      // 초기 URL 로드
      window.electronAPI.browserView.loadURL(currentUrl);
    });

    // 이벤트 리스너 등록
    const didNavigateHandler = window.electronAPI.browserView.onDidNavigate((data) => {
      setCurrentUrl(data.url);
      setUrl(data.url);
      setCanGoBack(data.canGoBack);
      setCanGoForward(data.canGoForward);
    });

    const loadingStateHandler = window.electronAPI.browserView.onLoadingState((data) => {
      setIsLoading(data.isLoading);
      if (data.canGoBack !== undefined) setCanGoBack(data.canGoBack);
      if (data.canGoForward !== undefined) setCanGoForward(data.canGoForward);
    });

    // Cleanup
    return () => {
      window.electronAPI.browserView.removeListener('browser-view:did-navigate', didNavigateHandler);
      window.electronAPI.browserView.removeListener('browser-view:loading-state', loadingStateHandler);
      window.electronAPI.browserView.destroy();
    };
  }, []);

  // BrowserView bounds 설정 (컨테이너 크기에 맞춤)
  useEffect(() => {
    if (!isElectron() || !window.electronAPI || !containerRef.current) return;

    const updateBounds = () => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();

      // BrowserView의 위치를 컨테이너에 맞춤
      // Note: BrowserView 좌표는 윈도우 기준이므로 rect의 x, y를 사용
      window.electronAPI.browserView.setBounds({
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    };

    // 초기 bounds 설정
    updateBounds();

    // 윈도우 리사이즈 시 bounds 업데이트
    const resizeObserver = new ResizeObserver(updateBounds);
    resizeObserver.observe(containerRef.current);

    window.addEventListener('resize', updateBounds);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateBounds);
    };
  }, []);

  // 탭 표시/숨김 처리
  useEffect(() => {
    if (!isElectron() || !window.electronAPI) return;

    // 탭이 활성화될 때 BrowserView 표시
    window.electronAPI.browserView.setVisible(true);

    return () => {
      // 탭이 비활성화될 때 BrowserView 숨김
      window.electronAPI.browserView.setVisible(false);
    };
  }, []);

  if (!isElectron()) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-muted-foreground">
        <Globe className="mb-2 h-12 w-12 opacity-20" />
        <p className="text-center text-sm font-medium">브라우저 기능</p>
        <p className="mt-2 text-center text-xs">
          Electron 환경에서만 사용 가능합니다
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* 브라우저 컨트롤 */}
      <div className="flex items-center gap-2 border-b p-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBack}
          disabled={!canGoBack}
          title="뒤로"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleForward}
          disabled={!canGoForward}
          title="앞으로"
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleReload}
          disabled={isLoading}
          title="새로고침"
        >
          <RotateCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleHome}
          title="홈"
        >
          <Home className="h-4 w-4" />
        </Button>

        <div className="flex flex-1 items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleNavigate()}
            placeholder="URL 입력..."
            className="flex-1"
          />
        </div>
      </div>

      {/* BrowserView 컨테이너 */}
      <div ref={containerRef} className="flex-1" />
    </div>
  );
}
