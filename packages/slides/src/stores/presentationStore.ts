import { create } from 'zustand';

import { type Presentation, type PresentationWithSlides, type Slide } from '../types/slide';
import { type SlidesApiClient } from '../context/SlidesContext';

interface PresentationState {
  presentations: Presentation[];
  currentPresentation: PresentationWithSlides | null;
  currentSlideIndex: number;
  isLoading: boolean;
  error: string | null;
}

interface PresentationActions {
  fetchPresentations: (apiClient: SlidesApiClient) => Promise<void>;
  fetchPresentation: (apiClient: SlidesApiClient, id: string) => Promise<void>;
  createPresentation: (
    apiClient: SlidesApiClient,
    data: { title?: string; language?: string; template?: string }
  ) => Promise<Presentation>;
  updatePresentation: (
    apiClient: SlidesApiClient,
    id: string,
    data: Partial<Presentation>
  ) => Promise<void>;
  deletePresentation: (apiClient: SlidesApiClient, id: string) => Promise<void>;

  setCurrentSlideIndex: (index: number) => void;
  updateSlideContent: (slideIndex: number, dataPath: string, content: unknown) => void;
  updateSlide: (slideIndex: number, slide: Partial<Slide>) => void;
  addSlide: (
    apiClient: SlidesApiClient,
    afterIndex: number,
    slide: Omit<Slide, 'id' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  deleteSlide: (apiClient: SlidesApiClient, slideId: string) => Promise<void>;
  reorderSlides: (apiClient: SlidesApiClient, slideIds: string[]) => Promise<void>;

  clearError: () => void;
  reset: () => void;
}

const initialState: PresentationState = {
  presentations: [],
  currentPresentation: null,
  currentSlideIndex: 0,
  isLoading: false,
  error: null,
};

/**
 * Set a nested value in an object using a dot-separated path.
 * E.g., setNestedValue(obj, 'content.title', 'Hello') sets obj.content.title = 'Hello'
 */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  if (keys.some((k) => FORBIDDEN_KEYS.has(k))) return;
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!;
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  const lastKey = keys[keys.length - 1];
  if (lastKey) {
    current[lastKey] = value;
  }
}

export const usePresentationStore = create<PresentationState & PresentationActions>((set, get) => ({
  ...initialState,

  fetchPresentations: async (apiClient) => {
    set({ isLoading: true, error: null });
    try {
      const presentations = await apiClient.get<Presentation[]>('/presentations');
      set({ presentations, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  fetchPresentation: async (apiClient, id) => {
    set({ isLoading: true, error: null });
    try {
      const presentation = await apiClient.get<PresentationWithSlides>(`/presentations/${id}`);
      set({ currentPresentation: presentation, isLoading: false, currentSlideIndex: 0 });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  createPresentation: async (apiClient, data) => {
    set({ isLoading: true, error: null });
    try {
      const presentation = await apiClient.post<Presentation>('/presentations', data);
      set((state) => ({
        presentations: [presentation, ...state.presentations],
        isLoading: false,
      }));
      return presentation;
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
      throw err;
    }
  },

  updatePresentation: async (apiClient, id, data) => {
    try {
      await apiClient.put(`/presentations/${id}`, data);
      set((state) => ({
        presentations: state.presentations.map((p) => (p.id === id ? { ...p, ...data } : p)),
        currentPresentation:
          state.currentPresentation?.id === id
            ? { ...state.currentPresentation, ...data }
            : state.currentPresentation,
      }));
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  deletePresentation: async (apiClient, id) => {
    try {
      await apiClient.delete(`/presentations/${id}`);
      set((state) => ({
        presentations: state.presentations.filter((p) => p.id !== id),
        currentPresentation:
          state.currentPresentation?.id === id ? null : state.currentPresentation,
      }));
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  setCurrentSlideIndex: (index) => {
    set({ currentSlideIndex: index });
  },

  updateSlideContent: (slideIndex, dataPath, content) => {
    const { currentPresentation } = get();
    if (!currentPresentation) return;

    const slides = [...currentPresentation.slides];
    const slide = slides[slideIndex];
    if (!slide) return;

    const updatedContent = { ...slide.content };
    setNestedValue(updatedContent, dataPath, content);

    slides[slideIndex] = { ...slide, content: updatedContent };
    set({
      currentPresentation: { ...currentPresentation, slides },
    });
  },

  updateSlide: (slideIndex, slideUpdate) => {
    const { currentPresentation } = get();
    if (!currentPresentation) return;

    const slides = [...currentPresentation.slides];
    const slide = slides[slideIndex];
    if (!slide) return;

    slides[slideIndex] = { ...slide, ...slideUpdate };
    set({
      currentPresentation: { ...currentPresentation, slides },
    });
  },

  addSlide: async (apiClient, afterIndex, slide) => {
    const { currentPresentation } = get();
    if (!currentPresentation) return;

    try {
      const newSlide = await apiClient.post<Slide>(
        `/presentations/${currentPresentation.id}/slides`,
        { ...slide, afterIndex }
      );

      set((state) => {
        if (!state.currentPresentation) return state;
        const slides = [...state.currentPresentation.slides];
        slides.splice(afterIndex + 1, 0, newSlide);
        const reindexed = slides.map((s, i) => ({ ...s, index: i }));
        return {
          currentPresentation: { ...state.currentPresentation, slides: reindexed },
          currentSlideIndex: afterIndex + 1,
        };
      });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  deleteSlide: async (apiClient, slideId) => {
    const { currentPresentation } = get();
    if (!currentPresentation) return;

    try {
      await apiClient.delete(`/presentations/${currentPresentation.id}/slides/${slideId}`);
      set((state) => {
        if (!state.currentPresentation) return state;
        const slides = state.currentPresentation.slides
          .filter((s) => s.id !== slideId)
          .map((s, i) => ({ ...s, index: i }));
        const newIndex = Math.min(state.currentSlideIndex, slides.length - 1);
        return {
          currentPresentation: { ...state.currentPresentation, slides },
          currentSlideIndex: Math.max(0, newIndex),
        };
      });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  reorderSlides: async (apiClient, slideIds) => {
    const { currentPresentation } = get();
    if (!currentPresentation) return;

    try {
      await apiClient.put(`/presentations/${currentPresentation.id}/slides/reorder`, {
        slideIds,
      });
      set((state) => {
        if (!state.currentPresentation) return state;
        const slideMap = new Map(state.currentPresentation.slides.map((s) => [s.id, s]));
        const reordered = slideIds
          .map((id, i) => {
            const slide = slideMap.get(id);
            return slide ? { ...slide, index: i } : null;
          })
          .filter((s): s is Slide => s !== null);
        return {
          currentPresentation: { ...state.currentPresentation, slides: reordered },
        };
      });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  clearError: () => set({ error: null }),
  reset: () => set(initialState),
}));
