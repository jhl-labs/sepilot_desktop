/**
 * InteractiveTerminal Component
 *
 * xterm.js 기반 완전한 인터랙티브 터미널 (vim, nano, top 등 지원)
 */

import React, { useEffect, useRef } from 'react';
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
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    logger.info('[InteractiveTerminal] Initializing xterm.js for session:', sessionId);

    // xterm.js 초기화
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#ffffff',
        selectionBackground: 'rgba(255, 255, 255, 0.3)',
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
        brightWhite: '#e5e5e5',
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
    fitAddon.fit();

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    logger.info('[InteractiveTerminal] Terminal initialized:', {
      cols: terminal.cols,
      rows: terminal.rows,
    });

    // PTY 데이터 수신 → xterm에 쓰기
    const dataHandler = window.electronAPI.terminal.onData(
      ({ sessionId: sid, data }: { sessionId: string; data: string }) => {
        if (sid === ptySessionId) {
          terminal.write(data);
        }
      }
    );

    // xterm 입력 → PTY 전송
    const disposable = terminal.onData((data) => {
      logger.debug('[InteractiveTerminal] User input:', data);
      window.electronAPI.terminal.write(ptySessionId, data);
    });

    // 리사이즈 핸들러
    const handleResize = () => {
      fitAddon.fit();
      const { cols, rows } = terminal;
      logger.info('[InteractiveTerminal] Resized:', { cols, rows });
      window.electronAPI.terminal.resize(ptySessionId, cols, rows);
    };

    // 초기 리사이즈 (약간의 지연을 두어 DOM이 완전히 렌더링된 후 실행)
    const initialResizeTimer = setTimeout(() => {
      handleResize();
    }, 100);

    window.addEventListener('resize', handleResize);

    // PTY 종료 이벤트 핸들러
    const exitHandler = window.electronAPI.terminal.onExit(
      ({ sessionId: sid, exitCode }: { sessionId: string; exitCode: number }) => {
        if (sid === ptySessionId) {
          logger.info('[InteractiveTerminal] PTY exited:', { exitCode });
          terminal.write(`\r\n\r\n[Process exited with code ${exitCode}]\r\n`);
        }
      }
    );

    // Cleanup
    return () => {
      logger.info('[InteractiveTerminal] Cleaning up terminal:', sessionId);
      clearTimeout(initialResizeTimer);
      disposable.dispose();
      terminal.dispose();
      window.removeEventListener('resize', handleResize);
      window.electronAPI.terminal.removeListener('terminal:data', dataHandler);
      window.electronAPI.terminal.removeListener('terminal:exit', exitHandler);
    };
  }, [sessionId, ptySessionId]);

  return (
    <div className="h-full w-full flex flex-col">
      <div ref={terminalRef} className="flex-1 p-2" />
    </div>
  );
}
