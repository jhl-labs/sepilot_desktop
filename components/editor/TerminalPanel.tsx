/**
 * Terminal Panel Component
 *
 * xterm.js 기반 실시간 터미널 UI
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useTerminal } from '@/lib/hooks/use-terminal';
import '@xterm/xterm/css/xterm.css';

export interface TerminalPanelProps {
  workingDirectory?: string;
}

export function TerminalPanel({ workingDirectory }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const { createSession, write, resize, killSession } = useTerminal({
    onData: (data) => {
      if (data.sessionId === sessionId && xtermRef.current) {
        xtermRef.current.write(data.data);
      }
    },
    onExit: (data) => {
      if (data.sessionId === sessionId && xtermRef.current) {
        xtermRef.current.writeln('');
        xtermRef.current.writeln(`\x1b[31mProcess exited with code ${data.exitCode}\x1b[0m`);
      }
    },
  });

  // xterm.js 초기화
  useEffect(() => {
    if (!containerRef.current) return;

    // Terminal 인스턴스 생성
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
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
      },
      allowProposedApi: true,
    });

    // Addons 로드
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    // 터미널 렌더링
    term.open(containerRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    setIsReady(true);

    return () => {
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // PTY 세션 생성
  useEffect(() => {
    if (!isReady) return;

    let isMounted = true;

    const initializeSession = async () => {
      const cols = xtermRef.current?.cols || 80;
      const rows = xtermRef.current?.rows || 24;

      const session = await createSession(workingDirectory, cols, rows);

      if (session && isMounted) {
        setSessionId(session.sessionId);
      }
    };

    initializeSession();

    return () => {
      isMounted = false;
      if (sessionId) {
        killSession(sessionId);
      }
    };
  }, [isReady, workingDirectory]); // eslint-disable-line react-hooks/exhaustive-deps

  // 사용자 입력 처리
  useEffect(() => {
    if (!xtermRef.current || !sessionId) return;

    const handleData = (data: string) => {
      write(sessionId, data);
    };

    const disposable = xtermRef.current.onData(handleData);

    return () => {
      disposable.dispose();
    };
  }, [sessionId, write]);

  // 리사이즈 처리
  useEffect(() => {
    if (!fitAddonRef.current || !sessionId) return;

    const handleResize = () => {
      if (!fitAddonRef.current || !xtermRef.current) return;

      fitAddonRef.current.fit();

      const cols = xtermRef.current.cols;
      const rows = xtermRef.current.rows;

      resize(sessionId, cols, rows);
    };

    // 초기 리사이즈
    handleResize();

    window.addEventListener('resize', handleResize);

    // ResizeObserver로 컨테이너 크기 변화 감지
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
  }, [sessionId, resize]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full bg-[#1e1e1e]"
      style={{ overflow: 'hidden' }}
    />
  );
}
