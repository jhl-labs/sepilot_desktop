/**
 * Terminal Panel Component
 *
 * xterm.js 기반 실시간 터미널 UI (탭 기반 다중 세션 지원)
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useTerminal } from '@/lib/hooks/use-terminal';
import { Button } from '@/components/ui/button';
import { Plus, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTheme } from 'next-themes';
import '@xterm/xterm/css/xterm.css';

interface TerminalTab {
  id: string;
  sessionId: string;
  title: string;
  isActive: boolean;
  terminal: Terminal;
  fitAddon: FitAddon;
}

export interface TerminalPanelProps {
  workingDirectory?: string;
}

export function TerminalPanel({ workingDirectory }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tabListRef = useRef<HTMLDivElement>(null);
  const terminalsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const { theme } = useTheme();

  // 테마별 설정
  const getTerminalTheme = useCallback(() => {
    if (theme === 'light') {
      return {
        background: '#ffffff',
        foreground: '#000000',
        cursor: '#000000',
        black: '#000000',
        red: '#cd3131',
        green: '#00BC00',
        yellow: '#949800',
        blue: '#0451a5',
        magenta: '#bc05bc',
        cyan: '#0598bc',
        white: '#555555',
        brightBlack: '#666666',
        brightRed: '#cd3131',
        brightGreen: '#14CE14',
        brightYellow: '#b5ba00',
        brightBlue: '#0451a5',
        brightMagenta: '#bc05bc',
        brightCyan: '#0598bc',
        brightWhite: '#a5a5a5',
      };
    } else {
      return {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#ffffff',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#ffffff',
      };
    }
  }, [theme]);

  const { createSession, write, resize, killSession } = useTerminal({
    onData: (data) => {
      const tab = tabs.find((t) => t.sessionId === data.sessionId);
      if (tab) {
        tab.terminal.write(data.data);
      }
    },
    onExit: (data) => {
      const tab = tabs.find((t) => t.sessionId === data.sessionId);
      if (tab) {
        tab.terminal.writeln('');
        tab.terminal.writeln(`\x1b[31mProcess exited with code ${data.exitCode}\x1b[0m`);
      }
    },
  });

  // 탭 스크롤 상태 업데이트
  const updateScrollState = useCallback(() => {
    if (!tabListRef.current) return;

    const { scrollLeft, scrollWidth, clientWidth } = tabListRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
  }, []);

  // 탭 스크롤
  const scrollTabs = useCallback((direction: 'left' | 'right') => {
    if (!tabListRef.current) return;

    const scrollAmount = 200;
    const newScrollLeft =
      direction === 'left'
        ? tabListRef.current.scrollLeft - scrollAmount
        : tabListRef.current.scrollLeft + scrollAmount;

    tabListRef.current.scrollTo({
      left: newScrollLeft,
      behavior: 'smooth',
    });
  }, []);

  // 새 탭 생성
  const handleNewTab = useCallback(async () => {
    if (!containerRef.current) return;

    // Terminal 인스턴스 생성
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: getTerminalTheme(),
      allowProposedApi: true,
    });

    // Addons 로드
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    // 컨테이너 생성 및 렌더링
    const terminalDiv = document.createElement('div');
    terminalDiv.style.width = '100%';
    terminalDiv.style.height = '100%';
    terminalDiv.style.display = 'none'; // 초기에는 숨김

    containerRef.current.appendChild(terminalDiv);
    term.open(terminalDiv);
    fitAddon.fit();

    // PTY 세션 생성
    const cols = term.cols;
    const rows = term.rows;
    const session = await createSession(workingDirectory, cols, rows);

    if (!session) {
      term.dispose();
      terminalDiv.remove();
      return;
    }

    // 사용자 입력 처리
    term.onData((data) => {
      write(session.sessionId, data);
    });

    const tabId = `tab-${Date.now()}`;
    const newTab: TerminalTab = {
      id: tabId,
      sessionId: session.sessionId,
      title: `Terminal ${tabs.length + 1}`,
      isActive: true,
      terminal: term,
      fitAddon,
    };

    terminalsRef.current.set(tabId, terminalDiv);

    // 기존 탭 비활성화
    setTabs((prevTabs) => {
      prevTabs.forEach((tab) => {
        tab.isActive = false;
        const div = terminalsRef.current.get(tab.id);
        if (div) div.style.display = 'none';
      });
      return [...prevTabs, newTab];
    });

    // 새 탭 표시
    terminalDiv.style.display = 'block';
    setTimeout(() => {
      fitAddon.fit();
      updateScrollState();
    }, 0);
  }, [tabs.length, workingDirectory, createSession, write, updateScrollState]);

  // 탭 전환
  const handleSwitchTab = useCallback((tabId: string) => {
    setTabs((prevTabs) => {
      const updatedTabs = prevTabs.map((tab) => {
        const isActive = tab.id === tabId;
        const div = terminalsRef.current.get(tab.id);
        if (div) {
          div.style.display = isActive ? 'block' : 'none';
        }
        return { ...tab, isActive };
      });

      // 활성 탭 리사이즈
      const activeTab = updatedTabs.find((t) => t.id === tabId);
      if (activeTab) {
        setTimeout(() => activeTab.fitAddon.fit(), 0);
      }

      return updatedTabs;
    });
  }, []);

  // 탭 닫기
  const handleCloseTab = useCallback(
    async (tabId: string, event: React.MouseEvent) => {
      event.stopPropagation();

      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;

      // PTY 세션 종료
      await killSession(tab.sessionId);

      // Terminal 정리
      tab.terminal.dispose();
      const div = terminalsRef.current.get(tabId);
      if (div) {
        div.remove();
        terminalsRef.current.delete(tabId);
      }

      setTabs((prevTabs) => {
        const newTabs = prevTabs.filter((t) => t.id !== tabId);

        // 닫은 탭이 활성 탭이었으면 다른 탭 활성화
        if (tab.isActive && newTabs.length > 0) {
          const newActiveTab = newTabs[newTabs.length - 1];
          newActiveTab.isActive = true;
          const div = terminalsRef.current.get(newActiveTab.id);
          if (div) {
            div.style.display = 'block';
            setTimeout(() => newActiveTab.fitAddon.fit(), 0);
          }
        }

        return newTabs;
      });

      updateScrollState();
    },
    [tabs, killSession, updateScrollState]
  );

  // 초기 탭 생성
  useEffect(() => {
    if (tabs.length === 0) {
      handleNewTab();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 리사이즈 처리
  useEffect(() => {
    const handleResize = () => {
      const activeTab = tabs.find((t) => t.isActive);
      if (activeTab) {
        activeTab.fitAddon.fit();
        const cols = activeTab.terminal.cols;
        const rows = activeTab.terminal.rows;
        resize(activeTab.sessionId, cols, rows);
      }
      updateScrollState();
    };

    window.addEventListener('resize', handleResize);

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
    };
  }, [tabs, resize, updateScrollState]);

  // 탭 리스트 스크롤 감지
  useEffect(() => {
    if (!tabListRef.current) return;

    const handleScroll = () => updateScrollState();
    tabListRef.current.addEventListener('scroll', handleScroll);

    return () => {
      tabListRef.current?.removeEventListener('scroll', handleScroll);
    };
  }, [updateScrollState]);

  // 테마 변경 시 모든 터미널 테마 업데이트
  useEffect(() => {
    const terminalTheme = getTerminalTheme();
    tabs.forEach((tab) => {
      tab.terminal.options.theme = terminalTheme;
    });
  }, [theme, tabs, getTerminalTheme]);

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: getTerminalTheme().background }}>
      {/* 탭 바 */}
      <div className="flex items-center border-b border-border bg-background/50">
        {/* 좌측 스크롤 버튼 */}
        {canScrollLeft && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => scrollTabs('left')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}

        {/* 탭 목록 */}
        <div
          ref={tabListRef}
          className="scrollbar-hide flex flex-1 items-center overflow-x-auto"
        >
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => handleSwitchTab(tab.id)}
              className={`group relative flex cursor-pointer items-center gap-2 border-r border-border px-3 py-2 text-sm transition-colors ${
                tab.isActive
                  ? 'bg-background text-foreground'
                  : 'bg-background/30 text-muted-foreground hover:bg-background/50'
              }`}
            >
              <span className="whitespace-nowrap">{tab.title}</span>
              <button
                onClick={(e) => handleCloseTab(tab.id, e)}
                className="opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>

        {/* 우측 스크롤 버튼 */}
        {canScrollRight && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => scrollTabs('right')}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}

        {/* 새 탭 버튼 */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 border-l border-border"
          onClick={handleNewTab}
          title="새 터미널"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* 터미널 컨테이너 */}
      <div
        ref={containerRef}
        className="flex-1"
        style={{ overflow: 'hidden' }}
      />
    </div>
  );
}
