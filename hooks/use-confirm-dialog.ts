/**
 * Confirm Dialog Hook
 *
 * Provides a reusable confirmation dialog pattern
 * with async/await support.
 */

import { useState, useCallback } from 'react';

interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
}

interface UseConfirmDialogReturn {
  dialogState: ConfirmDialogState;
  confirm: (title: string, description: string) => Promise<boolean>;
  closeDialog: () => void;
}

export function useConfirmDialog(): UseConfirmDialogReturn {
  const [dialogState, setDialogState] = useState<ConfirmDialogState>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {},
    onCancel: () => {},
  });

  const closeDialog = useCallback(() => {
    setDialogState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const confirm = useCallback(
    (title: string, description: string): Promise<boolean> => {
      return new Promise((resolve) => {
        setDialogState({
          isOpen: true,
          title,
          description,
          onConfirm: () => {
            closeDialog();
            resolve(true);
          },
          onCancel: () => {
            closeDialog();
            resolve(false);
          },
        });
      });
    },
    [closeDialog]
  );

  return {
    dialogState,
    confirm,
    closeDialog,
  };
}
