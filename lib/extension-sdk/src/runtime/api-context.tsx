'use client';

/**
 * Extension API Context Provider and Hook
 *
 * Extension의 컴포넌트가 앱 상태에 안전하게 접근할 수 있도록 하는 Context API
 */

import React, { createContext, useContext, type ReactNode } from 'react';
import type { ExtensionAPIContext } from '../types/extension';

// ============================================================================
// Context Definition
// ============================================================================

const ExtensionAPIContextInstance = createContext<ExtensionAPIContext | null>(null);

// ============================================================================
// Provider Component
// ============================================================================

export interface ExtensionAPIContextProviderProps {
  context: ExtensionAPIContext;
  children: ReactNode;
}

/**
 * Extension API Context Provider
 *
 * Extension의 모든 컴포넌트를 감싸서 Context를 제공합니다.
 *
 * @example
 * ```typescript
 * function MainComponentWithContext() {
 *   return (
 *     <ExtensionAPIContextProvider context={globalEditorContext}>
 *       <EditorWithTerminal />
 *     </ExtensionAPIContextProvider>
 *   );
 * }
 * ```
 */
export function ExtensionAPIContextProvider({
  context,
  children,
}: ExtensionAPIContextProviderProps) {
  return (
    <ExtensionAPIContextInstance.Provider value={context}>
      {children}
    </ExtensionAPIContextInstance.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Extension API Context Hook
 *
 * Extension 컴포넌트에서 Context API에 접근할 수 있습니다.
 *
 * @example
 * ```typescript
 * function MyComponent() {
 *   const context = useExtensionAPIContext();
 *
 *   // 파일 열기
 *   context.files.openFile('/path/to/file.ts', content, 'typescript');
 *
 *   // 작업 디렉토리 조회
 *   const workingDir = context.workspace.workingDirectory;
 *
 *   // 채팅 메시지 추가
 *   context.chat.addMessage({ role: 'user', content: 'Hello' });
 * }
 * ```
 *
 * @throws {Error} Provider 외부에서 호출 시 에러 발생
 */
export function useExtensionAPIContext(): ExtensionAPIContext {
  const context = useContext(ExtensionAPIContextInstance);
  if (!context) {
    throw new Error('useExtensionAPIContext must be used within ExtensionAPIContextProvider');
  }
  return context;
}
