/**
 * Client-side debug utility
 * Debug logs are only shown when DEBUG environment variable is set
 */

// Check if debug mode is enabled via environment variable
const isDebugEnabled = () => {
  if (typeof window === 'undefined') {
    return false;
  }
  // Check localStorage for debug flag
  try {
    return localStorage.getItem('DEBUG') === 'true';
  } catch {
    return false;
  }
};

export const debugLog = (...args: any[]) => {
  if (isDebugEnabled()) {
    console.log(...args);
  }
};

export const debugWarn = (...args: any[]) => {
  if (isDebugEnabled()) {
    console.warn(...args);
  }
};

export const debugInfo = (...args: any[]) => {
  if (isDebugEnabled()) {
    console.info(...args);
  }
};

// Always show errors
export const debugError = (...args: any[]) => {
  console.error(...args);
};
