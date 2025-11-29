'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, ArrowRight, RotateCw, Home, Globe, Terminal, Plus, X } from 'lucide-react';
import { isElectron } from '@/lib/platform';
import { useChatStore } from '@/lib/store/chat-store';

interface Tab {
  id: string;
  url: string;
  title: string;
  isActive: boolean;
}

export function BrowserPanel() {
  const { appMode, activeEditorTab } = useChatStore();
  const [url, setUrl] = useState('https://www.google.com');
  const [currentUrl, setCurrentUrl] = useState(url);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleNavigate = () => {
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    window.electronAPI.browserView.loadURL(url);
  };

  const handleBack = () => {
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    window.electronAPI.browserView.goBack();
  };

  const handleForward = () => {
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    window.electronAPI.browserView.goForward();
  };

  const handleReload = () => {
    if (!isElectron() || !window.electronAPI) {
      return;
    }

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

  const handleToggleDevTools = () => {
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    window.electronAPI.browserView.toggleDevTools();
  };

  const handleNewTab = async () => {
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    const result = await window.electronAPI.browserView.createTab('https://www.google.com');
    if (result.success && result.data) {
      await loadTabs();
      await switchToTab(result.data.tabId);
    }
  };

  const handleCloseTab = async (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    await window.electronAPI.browserView.closeTab(tabId);
    await loadTabs();
  };

  const switchToTab = async (tabId: string) => {
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    const result = await window.electronAPI.browserView.switchTab(tabId);
    if (result.success && result.data) {
      setActiveTabId(tabId);
      setCurrentUrl(result.data.url);
      setUrl(result.data.url);
      setCanGoBack(result.data.canGoBack);
      setCanGoForward(result.data.canGoForward);
    }
    await loadTabs();
  };

  const loadTabs = async () => {
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    const result = await window.electronAPI.browserView.getTabs();
    if (result.success && result.data) {
      setTabs(result.data.tabs);
      setActiveTabId(result.data.activeTabId);
    }
  };

  // Note: BrowserView의 표시/숨김은 MainLayout에서 관리됨
  // BrowserPanel은 UI와 이벤트 리스너만 담당

  // 이벤트 리스너 등록 (한 번만 실행)
  useEffect(() => {
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    // 이벤트 리스너 등록
    const didNavigateHandler = window.electronAPI.browserView.onDidNavigate((data) => {
      setCurrentUrl(data.url);
      setUrl(data.url);
      setCanGoBack(data.canGoBack);
      setCanGoForward(data.canGoForward);
      loadTabs(); // Update tab titles
    });

    const loadingStateHandler = window.electronAPI.browserView.onLoadingState((data) => {
      setIsLoading(data.isLoading);
      if (data.canGoBack !== undefined) {
        setCanGoBack(data.canGoBack);
      }
      if (data.canGoForward !== undefined) {
        setCanGoForward(data.canGoForward);
      }
    });

    const titleUpdatedHandler = window.electronAPI.browserView.onTitleUpdated(() => {
      loadTabs(); // Reload tabs to update titles
    });

    const tabCreatedHandler = window.electronAPI.browserView.onTabCreated((data) => {
      // Reload tabs when a new tab is created (e.g., from popup)
      loadTabs();
      // Switch to the newly created tab
      if (data.tabId) {
        switchToTab(data.tabId);
      }
    });

    // Cleanup: 이벤트 리스너만 제거 (BrowserView 숨김은 MainLayout에서 관리)
    return () => {
      window.electronAPI.browserView.removeListener('browser-view:did-navigate', didNavigateHandler);
      window.electronAPI.browserView.removeListener('browser-view:loading-state', loadingStateHandler);
      window.electronAPI.browserView.removeListener('browser-view:title-updated', titleUpdatedHandler);
      window.electronAPI.browserView.removeListener('browser-view:tab-created', tabCreatedHandler);
    };
  }, []);

  // 초기 탭 생성 (BrowserPanel이 렌더링되면 탭 생성)
  useEffect(() => {
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    // 탭이 없을 때만 첫 탭 생성
    if (tabs.length === 0) {
      console.log('[BrowserPanel] Creating initial tab');
      window.electronAPI.browserView.createTab(currentUrl).then(() => {
        loadTabs();
      });
    }
  }, [tabs.length, currentUrl]);

  // BrowserView bounds 설정 (컨테이너 크기에 맞춤)
  useEffect(() => {
    if (!isElectron() || !window.electronAPI || !containerRef.current) {
      return;
    }

    // Browser 모드가 아닐 때는 bounds 설정하지 않음
    const isBrowserVisible =
      appMode === 'browser' ||
      (appMode === 'editor' && activeEditorTab === 'browser');

    if (!isBrowserVisible) {
      return;
    }

    const updateBounds = () => {
      if (!containerRef.current) {
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();

      // BrowserView의 위치를 컨테이너에 맞춤
      // Note: BrowserView 좌표는 윈도우 기준이므로 rect의 x, y를 사용
      console.log('[BrowserPanel] Setting bounds:', { x: rect.x, y: rect.y, width: rect.width, height: rect.height });
      window.electronAPI.browserView.setBounds({
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    };

    // 약간의 지연 후 bounds 설정 (DOM이 완전히 렌더링될 시간 확보)
    const timer = setTimeout(() => {
      updateBounds();
    }, 100);

    // 윈도우 리사이즈 시 bounds 업데이트
    const resizeObserver = new ResizeObserver(updateBounds);
    resizeObserver.observe(containerRef.current);

    window.addEventListener('resize', updateBounds);

    return () => {
      clearTimeout(timer);
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateBounds);
    };
  }, [appMode, activeEditorTab, activeTabId]); // appMode, activeEditorTab, activeTabId 변경 시 bounds 재설정

  if (!isElectron()) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-muted-foreground">
        <Globe className="mb-2 h-12 w-12 opacity-20" />
        <p className="text-center text-sm font-medium">브라우저 기능</p>
        <p className="mt-2 text-center text-xs">Electron 환경에서만 사용 가능합니다</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* 탭 바 */}
      <div className="flex items-center gap-1 border-b bg-muted/30 px-2 py-1">
        <div className="flex flex-1 items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => switchToTab(tab.id)}
              className={`group flex min-w-[120px] max-w-[200px] cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors ${
                tab.isActive
                  ? 'bg-background shadow-sm'
                  : 'hover:bg-background/50'
              }`}
            >
              <Globe className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{tab.title || 'New Tab'}</span>
              {tabs.length > 1 && (
                <button
                  onClick={(e) => handleCloseTab(tab.id, e)}
                  className="shrink-0 rounded p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleNewTab}
          title="새 탭"
          className="h-7 w-7 shrink-0"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

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
        <Button variant="ghost" size="icon" onClick={handleHome} title="홈">
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

        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggleDevTools}
          title="개발자 도구"
        >
          <Terminal className="h-4 w-4" />
        </Button>
      </div>

      {/* BrowserView 컨테이너 */}
      <div ref={containerRef} className="flex-1" />
    </div>
  );
}
