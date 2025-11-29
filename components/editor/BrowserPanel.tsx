'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, ArrowRight, RotateCw, Home, Globe } from 'lucide-react';

export function BrowserPanel() {
  const [url, setUrl] = useState('https://www.google.com');
  const [currentUrl, setCurrentUrl] = useState(url);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const webviewRef = useRef<any>(null);

  const handleNavigate = () => {
    if (webviewRef.current && url) {
      // Ensure URL has protocol
      let validUrl = url;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        validUrl = 'https://' + url;
      }
      webviewRef.current.loadURL(validUrl);
    }
  };

  const handleBack = () => {
    if (webviewRef.current && canGoBack) {
      webviewRef.current.goBack();
    }
  };

  const handleForward = () => {
    if (webviewRef.current && canGoForward) {
      webviewRef.current.goForward();
    }
  };

  const handleReload = () => {
    if (webviewRef.current) {
      webviewRef.current.reload();
    }
  };

  const handleHome = () => {
    const homeUrl = 'https://www.google.com';
    setUrl(homeUrl);
    setCurrentUrl(homeUrl);
    if (webviewRef.current) {
      webviewRef.current.loadURL(homeUrl);
    }
  };

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    // URL 변경 감지
    const handleDidNavigate = (e: any) => {
      setCurrentUrl(e.url);
      setUrl(e.url);
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
    };

    const handleDidNavigateInPage = (e: any) => {
      if (e.isMainFrame) {
        setCurrentUrl(e.url);
        setUrl(e.url);
        setCanGoBack(webview.canGoBack());
        setCanGoForward(webview.canGoForward());
      }
    };

    const handleDidStartLoading = () => {
      setIsLoading(true);
    };

    const handleDidStopLoading = () => {
      setIsLoading(false);
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
    };

    webview.addEventListener('did-navigate', handleDidNavigate);
    webview.addEventListener('did-navigate-in-page', handleDidNavigateInPage);
    webview.addEventListener('did-start-loading', handleDidStartLoading);
    webview.addEventListener('did-stop-loading', handleDidStopLoading);

    return () => {
      webview.removeEventListener('did-navigate', handleDidNavigate);
      webview.removeEventListener('did-navigate-in-page', handleDidNavigateInPage);
      webview.removeEventListener('did-start-loading', handleDidStartLoading);
      webview.removeEventListener('did-stop-loading', handleDidStopLoading);
    };
  }, []);

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

      {/* webview 영역 */}
      <webview
        ref={webviewRef}
        src={currentUrl}
        style={{ width: '100%', height: '100%' }}
        allowpopups="false"
        nodeintegration="false"
        webpreferences="contextIsolation=yes"
      />
    </div>
  );
}
