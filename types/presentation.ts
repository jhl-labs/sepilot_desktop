export type PresentationExportFormat = 'pptx' | 'pdf' | 'html';

export interface PresentationSlide {
  id: string;
  title: string;
  description?: string;
  bullets?: string[];
  imagePrompt?: string;
  imageUrl?: string;
  imageData?: string; // base64 data URL for inline use
  notes?: string;
  accentColor?: string;
  layout?: 'title-body' | 'two-column' | 'timeline' | 'grid' | 'hero';
  vibe?: string; // e.g., "dark neon tech", "minimal white"
  typography?: string; // e.g., "Sora Bold / Inter Regular"
  slots?: {
    chart?: { type: 'bar' | 'line' | 'pie' | 'area'; dataHint?: string };
    table?: { columns: string[]; rowCount?: number };
    timeline?: { steps: number; density?: 'dense' | 'relaxed' };
    matrix?: { rows: number; cols: number; labels?: string[] };
  };
}

export interface PresentationExportState {
  format: PresentationExportFormat;
  status: 'idle' | 'preparing' | 'working' | 'ready' | 'error';
  error?: string;
  filePath?: string;
  progressMessage?: string;
}
