'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink, Download } from 'lucide-react';
import { UpdateCheckResult } from '@/types/electron';
import { isElectron } from '@/lib/platform';

export function UpdateNotificationDialog() {
  const [open, setOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [_checking, setChecking] = useState(false);

  useEffect(() => {
    // Only run in Electron environment
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    // Check for updates on mount
    checkForUpdates();
  }, []);

  const checkForUpdates = async () => {
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    try {
      setChecking(true);
      const result = await window.electronAPI.update.check();

      if (result.success && result.data) {
        setUpdateInfo(result.data);

        // Show dialog if update is available
        if (result.data.hasUpdate) {
          setOpen(true);
        }
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
    } finally {
      setChecking(false);
    }
  };

  const handleDownload = () => {
    if (updateInfo?.releaseInfo?.downloadUrl) {
      window.open(updateInfo.releaseInfo.downloadUrl, '_blank');
    } else if (updateInfo?.releaseInfo?.htmlUrl) {
      window.open(updateInfo.releaseInfo.htmlUrl, '_blank');
    }
    setOpen(false);
  };

  const handleViewRelease = () => {
    if (updateInfo?.releaseInfo?.htmlUrl) {
      window.open(updateInfo.releaseInfo.htmlUrl, '_blank');
    }
  };

  const handleDismiss = () => {
    setOpen(false);
  };

  if (!updateInfo?.hasUpdate) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              새 업데이트 사용 가능
            </div>
          </DialogTitle>
          <DialogDescription>
            SEPilot Desktop의 새로운 버전이 릴리스되었습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">현재 버전</p>
              <p className="font-mono font-semibold">{updateInfo.currentVersion}</p>
            </div>
            <div>
              <p className="text-muted-foreground">최신 버전</p>
              <p className="font-mono font-semibold text-primary">
                {updateInfo.latestVersion}
              </p>
            </div>
          </div>

          {updateInfo.releaseInfo?.name && (
            <div>
              <p className="text-sm font-semibold mb-1">릴리스 정보</p>
              <p className="text-sm text-muted-foreground">
                {updateInfo.releaseInfo.name}
              </p>
            </div>
          )}

          {updateInfo.releaseInfo?.body && (
            <div className="max-h-[200px] overflow-y-auto">
              <p className="text-sm font-semibold mb-2">변경사항</p>
              <div className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted p-3 rounded-md">
                {updateInfo.releaseInfo.body}
              </div>
            </div>
          )}

          {updateInfo.releaseInfo?.publishedAt && (
            <p className="text-xs text-muted-foreground">
              릴리스 날짜:{' '}
              {new Date(updateInfo.releaseInfo.publishedAt).toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleDismiss} className="w-full sm:w-auto">
            나중에
          </Button>

          {updateInfo.releaseInfo?.htmlUrl && (
            <Button
              variant="outline"
              onClick={handleViewRelease}
              className="w-full sm:w-auto"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              GitHub에서 보기
            </Button>
          )}

          <Button onClick={handleDownload} className="w-full sm:w-auto">
            <Download className="h-4 w-4 mr-2" />
            다운로드
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
