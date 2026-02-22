import { useState, useCallback } from 'react';
import type { TextFileAttachment } from '../types';

export function useTextFileUpload() {
  const [selectedFiles, setSelectedFiles] = useState<TextFileAttachment[]>([]);

  const addFiles = useCallback((files: TextFileAttachment[]) => {
    setSelectedFiles((prev) => [...prev, ...files]);
  }, []);

  const removeFile = useCallback((fileId: string) => {
    setSelectedFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  const clearFiles = useCallback(() => {
    setSelectedFiles([]);
  }, []);

  return {
    selectedFiles,
    addFiles,
    removeFile,
    clearFiles,
  };
}
