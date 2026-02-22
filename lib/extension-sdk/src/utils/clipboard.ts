/**
 * Safe Clipboard Utility
 * - Handles NotAllowedError when document is not focused
 */

/**
 * Safely copy text to clipboard
 * - Returns true if successful, false if failed
 * - Handles document focus issues gracefully
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    // Check if clipboard API is available
    if (!navigator.clipboard) {
      console.warn('[Clipboard] Clipboard API not available');
      return false;
    }

    // Try to focus the document first (if possible)
    if (document.hasFocus && !document.hasFocus()) {
      // Try to focus window (may not work in all contexts)
      window.focus();
    }

    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    // Handle NotAllowedError (document not focused) gracefully
    if (error instanceof Error) {
      if (error.name === 'NotAllowedError') {
        console.warn('[Clipboard] Cannot copy: document is not focused');
      } else {
        console.error('[Clipboard] Copy failed:', error.message);
      }
    }
    return false;
  }
}

/**
 * Safely read text from clipboard
 * - Returns text if successful, null if failed
 */
export async function readFromClipboard(): Promise<string | null> {
  try {
    if (!navigator.clipboard) {
      console.warn('[Clipboard] Clipboard API not available');
      return null;
    }

    const text = await navigator.clipboard.readText();
    return text;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'NotAllowedError') {
        console.warn('[Clipboard] Cannot read: permission denied');
      } else {
        console.error('[Clipboard] Read failed:', error.message);
      }
    }
    return null;
  }
}
