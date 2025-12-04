'use client';

import { BrowserSettings } from '@/components/browser/BrowserSettings';

interface BrowserSettingsTabProps {
  onSave: () => void;
  isSaving: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
}

export function BrowserSettingsTab({ message }: BrowserSettingsTabProps) {
  return (
    <div className="space-y-4">
      {/* Status Message */}
      {message && (
        <div
          className={`p-3 rounded-md text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100'
              : 'bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Browser Settings Component */}
      <BrowserSettings />
    </div>
  );
}
