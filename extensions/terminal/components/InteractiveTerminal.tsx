/**
 * InteractiveTerminal Component
 *
 * xterm.js 기반 인터랙티브 터미널
 */

import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { logger } from '@/lib/utils/logger';

interface InteractiveTerminalProps {
  ptySessionId: string;
}

export function InteractiveTerminal({ ptySessionId }: InteractiveTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    logger.info('[InteractiveTerminal] Initializing for PTY session:', ptySessionId);

    // xterm.js 인스턴스 생성
    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 13,
      fontFamily: '"Cascadia Code", "Consolas", "Courier New", monospace',
      lineHeight: 1.2,
      scrollback: 5000,
      convertEol: true,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#ffffff',
        cursorAccent: '#1e1e1e',
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
        brightWhite: '#ffffff',
      },
    });

    // Addons
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    // DOM에 마운트
    terminal.open(containerRef.current);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // 초기 fit
    const doFit = () => {
      try {
        if (
          containerRef.current &&
          containerRef.current.clientWidth > 0 &&
          containerRef.current.clientHeight > 0
        ) {
          fitAddon.fit();
          const { cols, rows } = terminal;
          if (cols > 0 && rows > 0) {
            window.electronAPI?.terminal?.resize(ptySessionId, cols, rows);
            logger.debug('[InteractiveTerminal] Resized to', cols, 'x', rows);
          }
        }
      } catch (e) {
        logger.warn('[InteractiveTerminal] Fit error:', e);
      }
    };

    // 여러 번 fit 시도 (DOM 안정화 대기)
    const t1 = setTimeout(doFit, 0);
    const t2 = setTimeout(doFit, 100);
    const t3 = setTimeout(doFit, 300);

    // ResizeObserver
    const resizeObserver = new ResizeObserver(() => {
      doFit();
    });
    resizeObserver.observe(containerRef.current);

    // PTY → xterm (데이터 수신)
    const dataHandler = window.electronAPI?.terminal?.onData(
      ({ sessionId, data }: { sessionId: string; data: string }) => {
        if (sessionId === ptySessionId) {
          terminal.write(data);
        }
      }
    );

    // xterm → PTY (사용자 입력)
    const inputDisposable = terminal.onData((data) => {
      window.electronAPI?.terminal?.write(ptySessionId, data);
    });

    // PTY 종료 이벤트
    const exitHandler = window.electronAPI?.terminal?.onExit(
      ({ sessionId, exitCode }: { sessionId: string; exitCode: number }) => {
        if (sessionId === ptySessionId) {
          terminal.write(`\r\n\x1b[33m[Process exited with code ${exitCode}]\x1b[0m\r\n`);
        }
      }
    );

    // 포커스
    terminal.focus();

    // Cleanup
    return () => {
      logger.info('[InteractiveTerminal] Cleanup PTY session:', ptySessionId);

      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);

      inputDisposable?.dispose();
      resizeObserver.disconnect();
      terminal.dispose();

      if (dataHandler) {
        window.electronAPI?.terminal?.removeListener('terminal:data', dataHandler);
      }
      if (exitHandler) {
        window.electronAPI?.terminal?.removeListener('terminal:exit', exitHandler);
      }
    };
  }, [ptySessionId]);

  return (
    <div ref={containerRef} className="h-full w-full bg-[#1e1e1e]" style={{ padding: '4px' }} />
  );
}
