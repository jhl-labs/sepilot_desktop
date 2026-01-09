/**
 * InteractiveTerminal Component
 *
 * xterm.js 기반 완전한 인터랙티브 터미널 (vim, nano, top 등 지원)
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { logger } from '@/lib/utils/logger';

interface InteractiveTerminalProps {
  sessionId: string;
  ptySessionId: string;
}

export function InteractiveTerminal({ sessionId, ptySessionId }: InteractiveTerminalProps) {
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const isInitializedRef = useRef(false);

  // 안전한 리사이즈 핸들러 (debounce 적용)
  const handleResize = useCallback(() => {
    if (!fitAddonRef.current || !xtermRef.current) return;

    try {
      fitAddonRef.current.fit();
      const { cols, rows } = xtermRef.current;

      // 유효한 크기인지 확인
      if (cols > 0 && rows > 0) {
        logger.info('[InteractiveTerminal] Resized:', { cols, rows });
        window.electronAPI?.terminal?.resize(ptySessionId, cols, rows);
      }
    } catch (error) {
      logger.warn('[InteractiveTerminal] Resize error:', error);
    }
  }, [ptySessionId]);

  useEffect(() => {
    if (!terminalRef.current || isInitializedRef.current) return;
    isInitializedRef.current = true;

    logger.info('[InteractiveTerminal] Initializing xterm.js for session:', sessionId);

    // xterm.js 초기화 - 최적화된 설정
    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "Cascadia Code", Menlo, Monaco, "Courier New", monospace',
      fontWeight: 'normal',
      fontWeightBold: 'bold',
      lineHeight: 1.2,
      letterSpacing: 0,
      scrollback: 5000,
      convertEol: true, // Windows 줄바꿈 처리
      allowTransparency: false,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#ffffff',
        cursorAccent: '#1e1e1e',
        selectionBackground: 'rgba(255, 255, 255, 0.3)',
        selectionForeground: '#ffffff',
        selectionInactiveBackground: 'rgba(255, 255, 255, 0.15)',
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
      },
      allowProposedApi: true,
    });

    // Addons 설정
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);

    // DOM에 연결
    terminal.open(terminalRef.current);

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // 터미널에 포커스
    terminal.focus();

    // ResizeObserver로 컨테이너 크기 변화 감지 (window resize보다 정확)
    let resizeTimeout: NodeJS.Timeout | null = null;
    const debouncedResize = () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (fitAddonRef.current && xtermRef.current) {
          try {
            fitAddonRef.current.fit();
            const { cols, rows } = xtermRef.current;
            if (cols > 0 && rows > 0) {
              logger.info('[InteractiveTerminal] ResizeObserver fit:', { cols, rows });
              window.electronAPI?.terminal?.resize(ptySessionId, cols, rows);
            }
          } catch (error) {
            logger.warn('[InteractiveTerminal] ResizeObserver error:', error);
          }
        }
      }, 50); // 50ms debounce
    };

    const resizeObserver = new ResizeObserver(() => {
      debouncedResize();
    });

    if (terminalContainerRef.current) {
      resizeObserver.observe(terminalContainerRef.current);
    }
    resizeObserverRef.current = resizeObserver;

    // 초기 fit (여러 번 시도하여 확실히 적용)
    const initialFit = () => {
      if (fitAddon && terminal) {
        try {
          fitAddon.fit();
          const { cols, rows } = terminal;
          logger.info('[InteractiveTerminal] Initial fit:', { cols, rows });
          if (cols > 0 && rows > 0) {
            window.electronAPI?.terminal?.resize(ptySessionId, cols, rows);
          }
        } catch (error) {
          logger.warn('[InteractiveTerminal] Initial fit error:', error);
        }
      }
    };

    // 여러 타이밍에 fit 시도 (DOM 렌더링 완료 보장)
    initialFit();
    const timer1 = setTimeout(initialFit, 50);
    const timer2 = setTimeout(initialFit, 150);
    const timer3 = setTimeout(initialFit, 300);

    logger.info('[InteractiveTerminal] Terminal initialized');

    // PTY 데이터 수신 → xterm에 쓰기
    const dataHandler = window.electronAPI?.terminal?.onData(
      ({ sessionId: sid, data }: { sessionId: string; data: string }) => {
        if (sid === ptySessionId && terminal) {
          terminal.write(data);
        }
      }
    );

    // xterm 입력 → PTY 전송
    const disposable = terminal.onData((data) => {
      logger.debug('[InteractiveTerminal] User input:', data.length, 'chars');
      window.electronAPI?.terminal?.write(ptySessionId, data);
    });

    // window resize도 추가 (전체 화면 변경 등)
    window.addEventListener('resize', debouncedResize);

    // PTY 종료 이벤트 핸들러
    const exitHandler = window.electronAPI?.terminal?.onExit(
      ({ sessionId: sid, exitCode }: { sessionId: string; exitCode: number }) => {
        if (sid === ptySessionId) {
          logger.info('[InteractiveTerminal] PTY exited:', { exitCode });
          terminal.write(`\r\n\x1b[33m[Process exited with code ${exitCode}]\x1b[0m\r\n`);
        }
      }
    );

    // Cleanup
    return () => {
      logger.info('[InteractiveTerminal] Cleaning up terminal:', sessionId);

      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      if (resizeTimeout) clearTimeout(resizeTimeout);

      disposable?.dispose();
      terminal?.dispose();
      resizeObserver?.disconnect();

      window.removeEventListener('resize', debouncedResize);

      if (dataHandler) {
        window.electronAPI?.terminal?.removeListener('terminal:data', dataHandler);
      }
      if (exitHandler) {
        window.electronAPI?.terminal?.removeListener('terminal:exit', exitHandler);
      }

      isInitializedRef.current = false;
    };
  }, [sessionId, ptySessionId, handleResize]);

  return (
    <div
      ref={terminalContainerRef}
      className="h-full w-full overflow-hidden bg-[#1e1e1e]"
      style={{ minHeight: 0 }} // flex child에서 제대로 작동하도록
    >
      <div
        ref={terminalRef}
        className="h-full w-full"
        style={{
          // xterm.js가 정확한 크기 계산을 할 수 있도록 패딩 없이 설정
          padding: 0,
          margin: 0,
        }}
      />
    </div>
  );
}
