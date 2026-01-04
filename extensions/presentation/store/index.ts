/**
 * Presentation Extension - Store slice definition
 *
 * 이 파일은 extension이 필요로 하는 store 상태와 액션을 정의합니다.
 * 실제 store는 메인 앱의 chat-store.ts에서 관리되지만,
 * extension 개발 시 참고할 수 있도록 인터페이스를 정의합니다.
 */

import type {
  PresentationSlide,
  PresentationExportState,
  PresentationAgentState,
  PresentationStoreState,
  PresentationStoreActions,
} from '../types';

/**
 * Presentation Extension의 초기 상태
 */
export const initialPresentationState: PresentationStoreState = {
  presentationChatMessages: [],
  presentationChatStreaming: false,
  presentationSlides: [],
  activePresentationSlideId: null,
  presentationViewMode: 'chat',
  presentationExportState: null,
  presentationAgentState: null,
};

/**
 * Extension Store Slice를 생성하는 팩토리 함수
 *
 * 메인 앱의 store에서 이 함수를 호출하여 presentation extension의
 * 상태와 액션을 통합할 수 있습니다.
 *
 * @example
 * ```typescript
 * // chat-store.ts에서 사용
 * import { createPresentationSlice } from '@/extensions/presentation/store';
 *
 * const useChatStore = create<ChatStore>()((set, get) => ({
 *   ...createPresentationSlice(set, get),
 *   // ... other slices
 * }));
 * ```
 */
export function createPresentationSlice(
  set: (
    partial:
      | Partial<PresentationStoreState>
      | ((state: PresentationStoreState) => Partial<PresentationStoreState>)
  ) => void,
  _get: () => PresentationStoreState
): PresentationStoreState & PresentationStoreActions {
  return {
    // Initial state
    ...initialPresentationState,

    // Actions
    addPresentationChatMessage: (message) => {
      const id = crypto.randomUUID();
      const newMessage = {
        ...message,
        id,
        conversation_id: 'presentation-chat',
        created_at: Date.now(),
      };
      set((state) => ({
        presentationChatMessages: [...state.presentationChatMessages, newMessage],
      }));
    },

    updatePresentationChatMessage: (id, updates) => {
      set((state) => ({
        presentationChatMessages: state.presentationChatMessages.map((m) =>
          m.id === id ? { ...m, ...updates } : m
        ),
      }));
    },

    clearPresentationChat: () => {
      set({ presentationChatMessages: [], presentationChatStreaming: false });
    },

    setPresentationChatStreaming: (isStreaming) => {
      set({ presentationChatStreaming: isStreaming });
    },

    setPresentationViewMode: (mode) => {
      set({ presentationViewMode: mode });
    },

    setPresentationSlides: (slides) => {
      set({ presentationSlides: slides });
    },

    addPresentationSlide: (slide) => {
      set((state) => ({
        presentationSlides: [...state.presentationSlides, slide],
        activePresentationSlideId: slide.id,
      }));
    },

    updatePresentationSlide: (id, updates) => {
      set((state) => ({
        presentationSlides: state.presentationSlides.map((slide) =>
          slide.id === id ? { ...slide, ...updates } : slide
        ),
      }));
    },

    removePresentationSlide: (id) => {
      set((state) => {
        const slides = state.presentationSlides.filter((slide) => slide.id !== id);
        const activeId =
          state.activePresentationSlideId === id
            ? slides[0]?.id || null
            : state.activePresentationSlideId;
        return {
          presentationSlides: slides,
          activePresentationSlideId: activeId,
        };
      });
    },

    setActivePresentationSlide: (id) => {
      set({ activePresentationSlideId: id });
    },

    setPresentationExportState: (stateValue) => {
      set({ presentationExportState: stateValue });
    },

    setPresentationAgentState: (stateValue) => {
      set({ presentationAgentState: stateValue });
    },

    clearPresentationSession: () => {
      set({
        presentationChatMessages: [],
        presentationSlides: [],
        activePresentationSlideId: null,
        presentationChatStreaming: false,
        presentationExportState: null,
        presentationAgentState: null,
        presentationViewMode: 'chat',
      });
    },
  };
}

// Re-export types for convenience
export type { PresentationSlide, PresentationExportState, PresentationAgentState };
