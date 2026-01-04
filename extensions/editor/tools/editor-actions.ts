import { BrowserWindow } from 'electron';
import type { EditorTool } from './editor-tools-registry';

/**
 * Editor Action Tools
 *
 * Tools for direct manipulation of the editor content.
 * These tools communicate with the Renderer process via IPC.
 */
export const editorActionTools: EditorTool[] = [
  {
    name: 'replace_selection',
    category: 'editor',
    description:
      'Replace the currently selected text in the active editor with new text. If no text is selected, inserts at cursor position. Use this to modify code based on user requests.',
    icon: '📝',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text to insert or replace the selection with.',
        },
      },
      required: ['text'],
    },
    execute: async (args: Record<string, unknown>) => {
      const text = args.text as string;
      if (typeof text !== 'string') {
        throw new Error('text argument must be a string');
      }
      const windows = BrowserWindow.getAllWindows();
      if (windows.length === 0) {
        throw new Error('No active window found');
      }

      // Send IPC event to renderer
      // We assume the first window is the main window
      windows[0].webContents.send('editor:replace-selection', text);

      return `Successfully sent replace command to editor with text length: ${text.length}`;
    },
  },
];

export function registerEditorActionTools(registry: any): void {
  editorActionTools.forEach((tool) => registry.register(tool));
}
