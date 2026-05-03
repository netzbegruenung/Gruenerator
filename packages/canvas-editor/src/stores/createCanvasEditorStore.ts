/**
 * createCanvasEditorStore — Vanilla Zustand store factory
 *
 * Creates an independent canvas editor store per instance.
 * Uses createStore() (vanilla API) so the store can be distributed
 * via React Context for multi-instance scoping.
 *
 * Consumers subscribe via useStore(store, selector) — same selector-based
 * re-render optimization as the old create() bound hook.
 */

import {
  DEFAULT_CANVAS_SIZE,
  DEFAULT_CANVAS_HEIGHT,
  DEFAULT_BACKGROUND_COLOR,
} from '@gruenerator/shared/canvas-editor';
import { createStore } from 'zustand/vanilla';
import { immer } from 'zustand/middleware/immer';

import { DEFAULT_FORMAT_ID } from '../formats';

import type { SnapTarget, SnapLine } from '../utils/snapping';
import type {
  Layer,
  CanvasEditorConfig,
  CanvasHistoryEntry,
} from '@gruenerator/shared/canvas-editor';

// =============================================================================
// TYPES
// =============================================================================

export interface CanvasEditorState {
  layers: Layer[];
  selectedLayerIds: string[];
  selectedElement: string | null;

  config: CanvasEditorConfig & {
    width: number;
    height: number;
    backgroundColor: string;
    responsive: boolean;
    maxContainerWidth: number;
  };
  /**
   * Identifies the chosen output format (see CANVAS_FORMATS).
   * The `config` width/height are the *reference* coordinate space layouts use;
   * the format determines the *output* canvas pixel dimensions. When they differ,
   * CanvasStage applies a Konva Group scale to render reference-space layouts
   * proportionally on the format's canvas size.
   */
  formatId: string;
  containerSize: { width: number; height: number };

  history: CanvasHistoryEntry[];
  historyIndex: number;
  maxHistorySize: number;

  snapGuides: { h: boolean; v: boolean };
  snapLines: SnapLine[];
  elementPositions: Record<string, SnapTarget>;

  renderVersion: number;

  stateRestorationCallback: ((state: Record<string, unknown>) => void) | null;

  /**
   * Tracks the most recently auto-applied AI suggestion so the canvas top
   * bar can show an accept/revert banner. Just a UI flag — revert delegates
   * to the canvas's standard `undo()`, which restores template state via
   * `stateRestorationCallback`.
   */
  pendingAiSuggestion: { title: string } | null;
}

export interface CanvasEditorActions {
  setConfig: (config: Partial<CanvasEditorConfig>) => void;
  setFormat: (formatId: string) => void;
  setContainerSize: (size: { width: number; height: number }) => void;

  addLayer: (layer: Omit<Layer, 'id'>) => string;
  updateLayer: (id: string, updates: Partial<Layer>) => void;
  removeLayer: (id: string) => void;
  reorderLayer: (id: string, newIndex: number) => void;
  setLayers: (layers: Layer[]) => void;
  batchUpdateLayers: (updates: Array<{ id: string; changes: Partial<Layer> }>) => void;

  selectLayer: (id: string, addToSelection?: boolean) => void;
  deselectAll: () => void;

  saveToHistory: (componentState?: Record<string, unknown>) => void;
  undo: () => void;
  redo: () => void;
  setStateRestorationCallback: (
    callback: ((state: Record<string, unknown>) => void) | null
  ) => void;

  setSelectedElement: (id: string | null) => void;

  setSnapGuides: (h: boolean, v: boolean) => void;
  setSnapLines: (lines: SnapLine[]) => void;
  updateElementPosition: (id: string, x: number, y: number, width: number, height: number) => void;
  removeElementPosition: (id: string) => void;

  triggerRender: () => void;
  resetStore: () => void;

  setPendingAiSuggestion: (pending: { title: string } | null) => void;
}

export interface CanvasEditorGetters {
  displayScale: () => number;
  canUndo: () => boolean;
  canRedo: () => boolean;
  isSelected: (id: string) => boolean;
  getLayer: (id: string) => Layer | undefined;
  getSnapTargets: (excludeId: string) => SnapTarget[];
}

export type CanvasEditorStoreState = CanvasEditorState & CanvasEditorActions & CanvasEditorGetters;

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialState: CanvasEditorState = {
  layers: [],
  selectedLayerIds: [],
  selectedElement: null,
  config: {
    width: DEFAULT_CANVAS_SIZE,
    height: DEFAULT_CANVAS_HEIGHT,
    backgroundColor: DEFAULT_BACKGROUND_COLOR,
    responsive: true,
    maxContainerWidth: 600,
  },
  formatId: DEFAULT_FORMAT_ID,
  containerSize: { width: 400, height: 400 },
  history: [],
  historyIndex: -1,
  maxHistorySize: 50,
  snapGuides: { h: false, v: false },
  snapLines: [],
  elementPositions: {},
  renderVersion: 0,
  stateRestorationCallback: null,
  pendingAiSuggestion: null,
};

// =============================================================================
// HELPERS
// =============================================================================

const generateLayerId = () => `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// =============================================================================
// FACTORY
// =============================================================================

export function createCanvasEditorStore() {
  return createStore<CanvasEditorStoreState>()(
    immer((set, get) => ({
      ...initialState,

      // Computed getters
      displayScale: () => {
        const { containerSize, config } = get();
        return containerSize.width / config.width;
      },

      canUndo: () => get().historyIndex > 0,
      canRedo: () => get().historyIndex < get().history.length - 1,
      isSelected: (id: string) => get().selectedLayerIds.includes(id),
      getLayer: (id: string) => get().layers.find((l) => l.id === id),

      getSnapTargets: (excludeId: string) => {
        const { elementPositions } = get();
        return Object.values(elementPositions).filter((t) => t.id !== excludeId);
      },

      // Configuration
      setConfig: (config) =>
        set((state) => {
          Object.assign(state.config, config);
        }),

      setFormat: (formatId) =>
        set((state) => {
          state.formatId = formatId;
        }),

      setContainerSize: (size) =>
        set((state) => {
          state.containerSize = size;
        }),

      // Layer CRUD
      addLayer: (layer: Omit<Layer, 'id'>) => {
        const id = generateLayerId();
        set((state) => {
          state.layers.push({ ...layer, id } as Layer);
          state.renderVersion++;
        });
        return id;
      },

      updateLayer: (id, updates) =>
        set((state) => {
          const layer = state.layers.find((l) => l.id === id);
          if (layer) {
            Object.assign(layer, updates);
            state.renderVersion++;
          }
        }),

      removeLayer: (id) =>
        set((state) => {
          const index = state.layers.findIndex((l) => l.id === id);
          if (index !== -1) {
            state.layers.splice(index, 1);
            state.selectedLayerIds = state.selectedLayerIds.filter((i) => i !== id);
            delete state.elementPositions[id];
            state.renderVersion++;
          }
        }),

      reorderLayer: (id, newIndex) =>
        set((state) => {
          const currentIndex = state.layers.findIndex((l) => l.id === id);
          if (currentIndex === -1 || newIndex < 0 || newIndex >= state.layers.length) return;
          const [layer] = state.layers.splice(currentIndex, 1);
          state.layers.splice(newIndex, 0, layer);
          state.renderVersion++;
        }),

      setLayers: (layers) =>
        set((state) => {
          state.layers = layers;
          state.renderVersion++;
        }),

      batchUpdateLayers: (updates) =>
        set((state) => {
          for (const { id, changes } of updates) {
            const layer = state.layers.find((l) => l.id === id);
            if (layer) {
              Object.assign(layer, changes);
            }
          }
          state.renderVersion++;
        }),

      // Selection
      selectLayer: (id, addToSelection = false) =>
        set((state) => {
          if (addToSelection) {
            if (state.selectedLayerIds.includes(id)) {
              state.selectedLayerIds = state.selectedLayerIds.filter((i) => i !== id);
            } else {
              state.selectedLayerIds.push(id);
            }
          } else {
            state.selectedLayerIds = [id];
          }
        }),

      deselectAll: () =>
        set((state) => {
          state.selectedLayerIds = [];
        }),

      // History (Undo/Redo)
      saveToHistory: (componentState) =>
        set((state) => {
          const layersJson = JSON.stringify(state.layers);
          const componentStateJson = componentState ? JSON.stringify(componentState) : null;

          // Skip no-op snapshots: drag-end events that didn't move anything,
          // text-input debounces that fire with unchanged content, etc.
          // Keeps history navigable rather than padded with identical entries.
          const lastEntry = state.history[state.historyIndex];
          if (lastEntry) {
            const lastComponentStateJson = lastEntry.componentState
              ? JSON.stringify(lastEntry.componentState)
              : null;
            if (
              JSON.stringify(lastEntry.layers) === layersJson &&
              lastComponentStateJson === componentStateJson
            ) {
              return;
            }
          }

          const entry: CanvasHistoryEntry = {
            layers: JSON.parse(layersJson),
            selectedLayerIds: [...state.selectedLayerIds],
            timestamp: Date.now(),
            componentState: componentStateJson ? JSON.parse(componentStateJson) : undefined,
          };

          if (state.historyIndex < state.history.length - 1) {
            state.history = state.history.slice(0, state.historyIndex + 1);
          }

          state.history.push(entry);

          if (state.history.length > state.maxHistorySize) {
            state.history.shift();
          } else {
            state.historyIndex++;
          }
        }),

      undo: () => {
        const state = get();
        if (state.historyIndex > 0) {
          const newIndex = state.historyIndex - 1;
          const entry = state.history[newIndex];
          set((s) => {
            s.historyIndex = newIndex;
            s.layers = JSON.parse(JSON.stringify(entry.layers));
            s.selectedLayerIds = [...entry.selectedLayerIds];
            s.renderVersion++;
          });
          if (entry.componentState && state.stateRestorationCallback) {
            state.stateRestorationCallback(entry.componentState);
          }
        }
      },

      redo: () => {
        const state = get();
        if (state.historyIndex < state.history.length - 1) {
          const newIndex = state.historyIndex + 1;
          const entry = state.history[newIndex];
          set((s) => {
            s.historyIndex = newIndex;
            s.layers = JSON.parse(JSON.stringify(entry.layers));
            s.selectedLayerIds = [...entry.selectedLayerIds];
            s.renderVersion++;
          });
          if (entry.componentState && state.stateRestorationCallback) {
            state.stateRestorationCallback(entry.componentState);
          }
        }
      },

      setStateRestorationCallback: (callback) =>
        set((state) => {
          state.stateRestorationCallback = callback;
        }),

      // Element selection (canvas interaction level)
      setSelectedElement: (id) =>
        set((state) => {
          state.selectedElement = id;
        }),

      // Snapping
      setSnapGuides: (h, v) =>
        set((state) => {
          state.snapGuides = { h, v };
        }),

      setSnapLines: (lines) =>
        set((state) => {
          state.snapLines = [...lines];
        }),

      updateElementPosition: (id, x, y, width, height) =>
        set((state) => {
          state.elementPositions[id] = { id, x, y, width, height };
        }),

      removeElementPosition: (id) =>
        set((state) => {
          delete state.elementPositions[id];
        }),

      // Render trigger
      triggerRender: () =>
        set((state) => {
          state.renderVersion++;
        }),

      // Reset
      resetStore: () => set({ ...initialState }),

      // AI suggestion accept/revert state
      setPendingAiSuggestion: (pending) =>
        set((state) => {
          state.pendingAiSuggestion = pending;
        }),
    }))
  );
}

export type CanvasEditorStoreApi = ReturnType<typeof createCanvasEditorStore>;

// Default singleton for backward compatibility
export const defaultCanvasEditorStore = createCanvasEditorStore();
