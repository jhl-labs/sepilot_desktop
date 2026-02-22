'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Folder } from 'lucide-react';

interface FolderManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'rename';
  currentFolderPath?: string;
  onConfirm: (folderPath: string) => void;
}

export function FolderManageDialog({
  open,
  onOpenChange,
  mode,
  currentFolderPath = '',
  onConfirm,
}: FolderManageDialogProps) {
  const [folderPath, setFolderPath] = useState(currentFolderPath);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = () => {
    const trimmed = folderPath.trim();

    if (!trimmed) {
      setError('폴더 경로를 입력해주세요.');
      return;
    }

    // 폴더 경로 검증 (슬래시로 구분, 공백만 있는 경우 제외)
    const parts = trimmed.split('/').filter((p: any) => p.trim());
    if (parts.length === 0) {
      setError('유효한 폴더 경로를 입력해주세요.');
      return;
    }

    // 최종 경로 생성
    const finalPath = parts.join('/');
    onConfirm(finalPath);
    onOpenChange(false);
    setFolderPath('');
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2">
              <Folder className="h-5 w-5" />
              <span>{mode === 'create' ? '새 폴더 생성' : '폴더 이름 변경'}</span>
            </div>
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? '폴더 경로를 입력하세요. 슬래시(/)로 하위 폴더를 구분할 수 있습니다.'
              : '새로운 폴더 경로를 입력하세요.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="folderPath">폴더 경로</Label>
            <Input
              id="folderPath"
              placeholder="예: 프로젝트/문서/API"
              value={folderPath}
              onChange={(e) => {
                setFolderPath(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleConfirm();
                }
              }}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            <p className="font-semibold mb-1">팁:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>슬래시(/)로 하위 폴더를 구분할 수 있습니다</li>
              <li>예: &quot;프로젝트/백엔드/API&quot;</li>
              <li>폴더는 자동으로 생성됩니다</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={handleConfirm}>{mode === 'create' ? '생성' : '변경'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
