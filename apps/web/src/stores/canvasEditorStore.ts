/**
 * Canvas Editor Zustand Store
 * Manages canvas state following Konva + Zustand best practices:
 * - Serializable shape data (layers array) as source of truth
 * - Konva handles rendering, events update this store
 * - renderVersion for batched re-renders
 * - History snapshots for undo/redo
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { useShallow } from 'zustand/shallow';
import type {
  Layer,
  CanvasEditorConfig,
  CanvasHistoryEntry,
  ExportFormat,
} from '@gruenerator/shared/canvas-editor';
import {
  DEFAULT_CANVAS_SIZE,
  DEFAULT_CANVAS_HEIGHT,
  DEFAULT_BACKGROUND_COLOR,
} from '@gruenerator/shared/canvas-editor';
import type { SnapTarget, SnapLine } from '../features/image-studio/canvas-editor/utils/snapping';

// =============================================================================
// TYPES
// =============================================================================

interface CanvasEditorState {
  // Serializable shape data (source of truth)
  layers: Layer[];
  selectedLayerIds: string[];

  // Configuration (uses partial for optional fields like backgroundImage)
  config: CanvasEditorConfig & {
    width: number;
    height: number;
    backgroundColor: string;
    responsive: boolean;
    maxContainerWidth: number;
  };
  containerSize: { width: number; height: number };

  // History for undo/redo (snapshots of layers array)
  history: CanvasHistoryEntry[];
  historyIndex: number;
  maxHistorySize: number;

  // Snapping UI state
  snapGuides: { h: boolean; v: boolean };
  snapLines: SnapLine[];
  elementPositions: Record<string, SnapTarget>;

  // Render trigger (increment to batch re-renders)
  renderVersion: number;

  // Callback for restoring component-level state on undo/redo
  stateRestorationCallback: ((state: Record<string, unknown>) => void) | null;
}

interface CanvasEditorActions {
  // Configuration
  setConfig: (config: Partial<CanvasEditorConfig>) => void;
  setContainerSize: (size: { width: number; height: number }) => void;

  // Layer CRUD
  addLayer: (layer: Omit<Layer, 'id'>) => string;
  updateLayer: (id: string, updates: Partial<Layer>) => void;
  removeLayer: (id: string) => void;
  reorderLayer: (id: string, newIndex: number) => void;
  setLayers: (layers: Layer[]) => void;
  batchUpdateLayers: (updates: Array<{ id: string; changes: Partial<Layer> }>) => void;

  // Selection
  selectLayer: (id: string, addToSelection?: boolean) => void;
  deselectAll: () => void;

  // History
  saveToHistory: (componentState?: Record<string, unknown>) => void;
  undo: () => void;
  redo: () => void;
  setStateRestorationCallback: (callback: ((state: Record<string, unknown>) => void) | null) => void;

  // Snapping
  setSnapGuides: (h: boolean, v: boolean) => void;
  setSnapLines: (lines: SnapLine[]) => void;
  updateElementPosition: (id: string, x: number, y: number, width: number, height: number) => void;
  removeElementPosition: (id: string) => void;

  // Render trigger
  triggerRender: () => void;

  // Reset
  resetStore: () => void;
}

interface CanvasEditorGetters {
  displayScale: () => number;
  canUndo: () => boolean;
  canRedo: () => boolean;
  isSelected: (id: string) => boolean;
  getLayer: (id: string) => Layer | undefined;
  getSnapTargets: (excludeId: string) => SnapTarget[];
}

type CanvasEditorStore = CanvasEditorState & CanvasEditorActions & CanvasEditorGetters;

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialState: CanvasEditorState = {
  layers: [],
  selectedLayerIds: [],
  config: {
    width: DEFAULT_CANVAS_SIZE,
    height: DEFAULT_CANVAS_HEIGHT,
    backgroundColor: DEFAULT_BACKGROUND_COLOR,
    responsive: true,
    maxContainerWidth: 600,
  },
  containerSize: { width: 400, height: 400 },
  history: [],
  historyIndex: -1,
  maxHistorySize: 50,
  snapGuides: { h: false, v: false },
  snapLines: [],
  elementPositions: {},
  renderVersion: 0,
  stateRestorationCallback: null,
};

// =============================================================================
// HELPERS
// =============================================================================

const generateLayerId = () =>
  `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// =============================================================================
// STORE
// =============================================================================

export const useCanvasEditorStore = create<CanvasEditorStore>()(
  immer((set, get) => ({
    ...initialState,

    // -------------------------------------------------------------------------
    // COMPUTED GETTERS
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // CONFIGURATION
    // -------------------------------------------------------------------------

    setConfig: (config) =>
      set((state) => {
        Object.assign(state.config, config);
      }),

    setContainerSize: (size) =>
      set((state) => {
        state.containerSize = size;
      }),

    // -------------------------------------------------------------------------
    // LAYER CRUD
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // SELECTION
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // HISTORY (Undo/Redo)
    // -------------------------------------------------------------------------

    saveToHistory: (componentState) =>
      set((state) => {
        const entry: CanvasHistoryEntry = {
          layers: JSON.parse(JSON.stringify(state.layers)),
          selectedLayerIds: [...state.selectedLayerIds],
          timestamp: Date.now(),
          componentState: componentState ? JSON.parse(JSON.stringify(componentState)) : undefined,
        };

        // Remove any future history if we're not at the end
        if (state.historyIndex < state.history.length - 1) {
          state.history = state.history.slice(0, state.historyIndex + 1);
        }

        state.history.push(entry);

        // Limit history size
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
          setTimeout(() => state.stateRestorationCallback!(entry.componentState!), 0);
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
          setTimeout(() => state.stateRestorationCallback!(entry.componentState!), 0);
        }
      }
    },

    setStateRestorationCallback: (callback) =>
      set((state) => {
        state.stateRestorationCallback = callback;
      }),

    // -------------------------------------------------------------------------
    // SNAPPING
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // RENDER TRIGGER
    // -------------------------------------------------------------------------

    triggerRender: () =>
      set((state) => {
        state.renderVersion++;
      }),

    // -------------------------------------------------------------------------
    // RESET
    // -------------------------------------------------------------------------

    resetStore: () => set(initialState),
  }))
);

// =============================================================================
// SELECTOR HOOKS (for minimal re-renders)
// =============================================================================

export const useCanvasLayers = (): Layer[] =>
  useCanvasEditorStore(useShallow((s) => s.layers));

export const useCanvasSelection = (): string[] =>
  useCanvasEditorStore(useShallow((s) => s.selectedLayerIds));

export const useCanvasConfig = (): CanvasEditorState['config'] =>
  useCanvasEditorStore(useShallow((s) => s.config));

export const useCanvasContainerSize = (): { width: number; height: number } =>
  useCanvasEditorStore(useShallow((s) => s.containerSize));

export const useRenderVersion = (): number =>
  useCanvasEditorStore((s) => s.renderVersion);

export const useSnapGuides = (): { h: boolean; v: boolean } =>
  useCanvasEditorStore(useShallow((s) => s.snapGuides));

export const useSnapLines = (): SnapLine[] =>
  useCanvasEditorStore(useShallow((s) => s.snapLines));

export const useElementPositions = (): Record<string, SnapTarget> =>
  useCanvasEditorStore(useShallow((s) => s.elementPositions));

export const useCanvasHistory = (): { canUndo: boolean; canRedo: boolean } =>
  useCanvasEditorStore(
    useShallow((s) => ({
      canUndo: s.historyIndex > 0,
      canRedo: s.historyIndex < s.history.length - 1,
    }))
  );

export default useCanvasEditorStore;
