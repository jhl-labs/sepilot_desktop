'use client';

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useChatStore } from '@/lib/store/chat-store';

/**
 * Presentation Extension - Header Actions
 *
 * Sidebar 헤더에 표시될 액션 버튼들
 */
export function PresentationHeaderActions() {
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const { clearPresentationSession } = useChatStore();

  return (
    <>
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setClearDialogOpen(true)}
          title="새 프레젠테이션 세션"
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>

      {/* Clear Presentation Confirmation Dialog */}
      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>새 프레젠테이션 세션을 시작하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              현재 작업 중인 프레젠테이션이 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>아니오</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clearPresentationSession();
                setClearDialogOpen(false);
              }}
            >
              예
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
