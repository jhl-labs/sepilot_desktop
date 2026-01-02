'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Home,
  Globe,
  Terminal,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Bookmark,
  Save,
  Compass,
  Eye,
  MousePointer,
  Keyboard,
  ArrowDown,
  Layout,
  Camera,
  FileText,
  Search,
} from 'lucide-react';
import { isElectron } from '@/lib/platform';
import { useChatStore } from '@/lib/store/chat-store';

import { logger } from '@/lib/utils/logger';
interface Tab {
  id: string;
  url: string;
  title: string;
  isActive: boolean;
}

export function BrowserPanel() {
  const { t } = useTranslation();
  const { appMode, activeEditorTab } = useChatStore();
  const [url, setUrl] = useState('https://euno.news');
  const [currentUrl, setCurrentUrl] = useState(url);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const isInitializedRef = useRef(false);

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
    const homeUrl = 'https://euno.news';
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

    const result = await window.electronAPI.browserView.createTab('https://euno.news');
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

  const loadTabs = useCallback(async () => {
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    const result = await window.electronAPI.browserView.getTabs();
    if (result.success && result.data) {
      setTabs(result.data.tabs);
      setActiveTabId(result.data.activeTabId);
    }
  }, []);

  // 탭 스크롤 핸들러
  const scrollTabs = (direction: 'left' | 'right') => {
    if (!tabsContainerRef.current) {
      return;
    }

    const scrollAmount = 200;
    const newScrollLeft =
      tabsContainerRef.current.scrollLeft + (direction === 'left' ? -scrollAmount : scrollAmount);

    tabsContainerRef.current.scrollTo({
      left: newScrollLeft,
      behavior: 'smooth',
    });
  };

  // 스크롤 상태 업데이트
  const updateScrollState = () => {
    if (!tabsContainerRef.current) {
      return;
    }

    const { scrollLeft, scrollWidth, clientWidth } = tabsContainerRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
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
      window.electronAPI.browserView.removeListener(
        'browser-view:did-navigate',
        didNavigateHandler
      );
      window.electronAPI.browserView.removeListener(
        'browser-view:loading-state',
        loadingStateHandler
      );
      window.electronAPI.browserView.removeListener(
        'browser-view:title-updated',
        titleUpdatedHandler
      );
      window.electronAPI.browserView.removeListener('browser-view:tab-created', tabCreatedHandler);
    };
  }, []);

  // 초기 탭 로드 및 생성 (마운트 시 한 번만 실행)
  useEffect(() => {
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    // React Strict Mode에서 중복 실행 방지
    if (isInitializedRef.current) {
      logger.debug('[BrowserPanel] Already initialized, skipping');
      return;
    }

    const initializeTabs = async () => {
      logger.debug('[BrowserPanel] Initializing tabs...');
      isInitializedRef.current = true;

      // 먼저 기존 탭 목록 확인
      const result = await window.electronAPI.browserView.getTabs();

      if (result.success && result.data) {
        const existingTabs = result.data.tabs;

        if (existingTabs.length === 0) {
          // 탭이 없을 때만 새로 생성
          logger.debug('[BrowserPanel] No existing tabs, creating initial tab');
          await window.electronAPI.browserView.createTab(currentUrl);
        } else {
          logger.debug('[BrowserPanel] Found existing tabs:', existingTabs.length);
        }

        // 탭 목록 로드하여 상태 업데이트
        await loadTabs();
      }
    };

    initializeTabs();
  }, []); // currentUrl은 상수, loadTabs는 마운트 후 변경되지 않음

  // 탭 변경 시 스크롤 상태 업데이트
  useEffect(() => {
    if (!tabsContainerRef.current) {
      return;
    }

    updateScrollState();

    const handleScroll = () => updateScrollState();
    const container = tabsContainerRef.current;
    container.addEventListener('scroll', handleScroll);

    // ResizeObserver로 컨테이너 크기 변경 감지
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
    };
  }, [tabs]);

  // BrowserView bounds 설정 (컨테이너 크기에 맞춤)
  useEffect(() => {
    if (!isElectron() || !window.electronAPI || !containerRef.current) {
      return;
    }

    // Browser 모드가 아닐 때는 bounds 설정하지 않음
    const isBrowserVisible =
      appMode === 'browser' || (appMode === 'editor' && activeEditorTab === 'browser');

    if (!isBrowserVisible) {
      return;
    }

    const updateBounds = () => {
      if (!containerRef.current) {
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();

      // 드롭다운 메뉴가 열려있으면 BrowserView를 화면 밖으로 이동
      if (dropdownOpen) {
        logger.debug('[BrowserPanel] Dropdown open, hiding BrowserView');
        window.electronAPI.browserView.setBounds({
          x: 0,
          y: -10000, // 화면 밖으로 이동
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
        return;
      }

      // BrowserView의 위치를 컨테이너에 맞춤
      // Note: BrowserView 좌표는 윈도우 기준이므로 rect의 x, y를 사용
      logger.debug('[BrowserPanel] Setting bounds:', {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      });
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
  }, [appMode, activeEditorTab, activeTabId, dropdownOpen]); // appMode, activeEditorTab, activeTabId, dropdownOpen 변경 시 bounds 재설정

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
      {/* 탭 바 - 크롬 스타일 */}
      <div className="flex items-center border-b bg-muted/30 px-1 py-1">
        {/* 좌측 스크롤 버튼 */}
        {canScrollLeft && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => scrollTabs('left')}
            className="h-7 w-7 shrink-0"
            title="왼쪽으로 스크롤"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}

        {/* 탭 영역 */}
        <div
          ref={tabsContainerRef}
          className="flex flex-1 items-center gap-1 overflow-x-auto scrollbar-hide"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => switchToTab(tab.id)}
              className={`group flex min-w-[140px] max-w-[200px] cursor-pointer items-center gap-2 rounded-t-md px-3 py-1.5 text-xs transition-colors ${
                tab.isActive ? 'bg-background shadow-sm' : 'hover:bg-background/50'
              }`}
            >
              <Globe className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{tab.title || 'New Tab'}</span>
              {tabs.length > 1 && (
                <button
                  title="닫기"
                  onClick={(e) => handleCloseTab(tab.id, e)}
                  className="shrink-0 rounded p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* 우측 스크롤 버튼 */}
        {canScrollRight && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => scrollTabs('right')}
            className="h-7 w-7 shrink-0"
            title="오른쪽으로 스크롤"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}

        {/* 새 탭 버튼 */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleNewTab}
          title="새 탭"
          className="h-7 w-7 shrink-0"
        >
          <Plus className="h-4 w-4" />
        </Button>

        {/* Settings 드롭다운 메뉴 */}
        <DropdownMenu onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              title={t('browser.panel.browserSettings')}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem>
              <Bookmark className="mr-2 h-4 w-4" />
              <span>{t('browser.panel.manageBookmarks')}</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Save className="mr-2 h-4 w-4" />
              <span>{t('browser.panel.saveSession')}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />

            {/* Browser Agent 도구 목록 */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Terminal className="mr-2 h-4 w-4" />
                <span>{t('browser.panel.browserAgentTools')}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-64">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Navigation (1)
                </DropdownMenuLabel>
                <DropdownMenuItem disabled>
                  <Compass className="mr-2 h-3 w-3" />
                  <span className="text-xs">browser_navigate - URL 직접 이동</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Page Inspection (4)
                </DropdownMenuLabel>
                <DropdownMenuItem disabled>
                  <FileText className="mr-2 h-3 w-3" />
                  <span className="text-xs">browser_get_page_content - 페이지 내용</span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <Search className="mr-2 h-3 w-3" />
                  <span className="text-xs">browser_get_interactive_elements - 요소 찾기</span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <Eye className="mr-2 h-3 w-3" />
                  <span className="text-xs">browser_get_selected_text - 선택 텍스트</span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <Camera className="mr-2 h-3 w-3" />
                  <span className="text-xs">browser_take_screenshot - 스크린샷</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Page Interaction (3)
                </DropdownMenuLabel>
                <DropdownMenuItem disabled>
                  <MousePointer className="mr-2 h-3 w-3" />
                  <span className="text-xs">browser_click_element - 요소 클릭</span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <Keyboard className="mr-2 h-3 w-3" />
                  <span className="text-xs">browser_type_text - 텍스트 입력</span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <ArrowDown className="mr-2 h-3 w-3" />
                  <span className="text-xs">browser_scroll - 페이지 스크롤</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Tab Management (4)
                </DropdownMenuLabel>
                <DropdownMenuItem disabled>
                  <Layout className="mr-2 h-3 w-3" />
                  <span className="text-xs">browser_list_tabs - 탭 목록</span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <Plus className="mr-2 h-3 w-3" />
                  <span className="text-xs">browser_create_tab - 새 탭 열기</span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <ChevronRight className="mr-2 h-3 w-3" />
                  <span className="text-xs">browser_switch_tab - 탭 전환</span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <X className="mr-2 h-3 w-3" />
                  <span className="text-xs">browser_close_tab - 탭 닫기</span>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleToggleDevTools}>
              <Terminal className="mr-2 h-4 w-4" />
              <span>개발자 도구</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* 브라우저 컨트롤 */}
      <div className="flex items-center gap-2 border-b p-2">
        <Button variant="ghost" size="icon" onClick={handleBack} disabled={!canGoBack} title="뒤로">
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

        <Button variant="ghost" size="icon" onClick={handleToggleDevTools} title="개발자 도구">
          <Terminal className="h-4 w-4" />
        </Button>
      </div>

      {/* BrowserView 컨테이너 */}
      <div ref={containerRef} className="flex-1" />
    </div>
  );
}
