// Untertitel-Verlaufsverwaltung Zustand Store
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import type { SubtitleChunk, SubtitleTranscript } from '../types/subtitle';

interface Chunk extends SubtitleChunk {
  deleted?: boolean;
}

interface UpdateAction {
  type: 'update';
  id: string;
  prev: Partial<Chunk>;
  next: Partial<Chunk>;
}

interface HistoryState {
  // Untertiteldaten
  chunks: Chunk[];
  language: string;

  // Verlauf
  undoStack: UpdateAction[];
  redoStack: UpdateAction[];
  lastUpdateTime: number;
  mergeThreshold: number; // Schwellenwert für Zusammenführung aufeinanderfolgender Aktionen (ms)

  // Abgeleiteter Zustand
  text: string; // Zusammengefügter Text aller nicht gelöschten Chunks
  duration: number; // Gesamtdauer aller nicht gelöschten Chunks
  canUndo: boolean;
  canRedo: boolean;
}

interface HistoryActions {
  // Grundlegende Aktionen
  setTranscript: (transcript: SubtitleTranscript) => void;
  update: (id: string, next: Partial<Chunk>) => void;
  delete: (id: string) => void; // Gekapselte Löschaktion

  // Verlaufsaktionen
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;

  // Massenaktionen
  deleteSelected: (selectedIds: Set<string>) => void;
  restoreSelected: (selectedIds: Set<string>) => void;

  // Untertiteltext bearbeiten
  updateChunkText: (chunkId: string, newText: string) => void;

  // Zurücksetzen
  reset: () => void;
}

// Hilfsfunktion zur Berechnung des abgeleiteten Zustands
const computeDerivedState = (chunks: Chunk[]) => {
  const activeChunks = chunks.filter((chunk) => !chunk.deleted);

  const text = activeChunks
    .sort((a, b) => a.timestamp[0] - b.timestamp[0])
    .map((chunk) => chunk.text)
    .join(' ');

  const duration = activeChunks.reduce((total, chunk) => {
    return total + (chunk.timestamp[1] - chunk.timestamp[0]);
  }, 0);

  return { text, duration };
};

// Anfangszustand
const initialState: HistoryState = {
  chunks: [],
  language: 'en',
  undoStack: [],
  redoStack: [],
  lastUpdateTime: 0,
  mergeThreshold: 500,
  text: '',
  duration: 0,
  canUndo: false,
  canRedo: false,
};

// Store erstellen
export const useHistoryStore = create<HistoryState & HistoryActions>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // Untertitel-Transkription setzen
      setTranscript: (transcript) => {
        // SubtitleChunk in Chunk umwandeln, deleted-Eigenschaft hinzufügen
        const chunks = transcript.chunks.map((chunk) => ({
          ...chunk,
          deleted: false,
        }));

        // Abgeleiteten Zustand neu berechnen
        const derived = computeDerivedState(chunks);

        set({
          chunks,
          language: transcript.language,
          text: derived.text,
          duration: derived.duration,
          undoStack: [],
          redoStack: [],
          canUndo: false,
          canRedo: false,
        });
      },

      // Chunk-Eigenschaften aktualisieren
      update: (id, next) => {
        const state = get();
        const chunkIndex = state.chunks.findIndex((c) => c.id === id);
        if (chunkIndex === -1) return;

        const chunk = state.chunks[chunkIndex];

        // Vorherigen Zustand aufzeichnen
        const prev: Partial<Chunk> = {};
        for (const key in next) {
          const k = key as keyof Chunk;
          prev[k] = chunk[k] as never;
        }

        const now = Date.now();
        const lastAction = state.undoStack[state.undoStack.length - 1];

        // Chunk aktualisieren
        const updatedChunk = { ...chunk, ...next };
        const newChunks = [...state.chunks];
        newChunks[chunkIndex] = updatedChunk;

        let newUndoStack: UpdateAction[];
        const newRedoStack: UpdateAction[] = [];
        const newLastUpdateTime = now;

        // Prüfen, ob Aktionen zusammengeführt werden können (schnelle aufeinanderfolgende Aktionen am selben Chunk)
        if (
          lastAction &&
          lastAction.type === 'update' &&
          lastAction.id === id &&
          now - state.lastUpdateTime < state.mergeThreshold
        ) {
          // Mit vorheriger Aktion zusammenführen
          const mergedAction = {
            ...lastAction,
            next: { ...lastAction.next, ...next },
          };
          newUndoStack = [...state.undoStack.slice(0, -1), mergedAction];
        } else {
          // Neuen Verlaufseintrag erstellen
          const action: UpdateAction = { type: 'update', id, prev, next };
          newUndoStack = [...state.undoStack, action];
        }

        // Abgeleiteten Zustand neu berechnen
        const derived = computeDerivedState(newChunks);

        set({
          chunks: newChunks,
          undoStack: newUndoStack,
          redoStack: newRedoStack,
          lastUpdateTime: newLastUpdateTime,
          text: derived.text,
          duration: derived.duration,
          canUndo: newUndoStack.length > 0,
          canRedo: newRedoStack.length > 0,
        });
      },

      // Chunk löschen (gekapselte Hilfsmethode)
      delete: (id) => {
        const state = get();
        const chunk = state.chunks.find((c) => c.id === id);
        if (!chunk) return;

        // update-Methode verwenden, um korrekten Verlauf sicherzustellen
        get().update(id, { deleted: !chunk.deleted });
      },

      // Rückgängig-Aktion
      undo: () => {
        const state = get();
        if (state.undoStack.length === 0) return;

        const action = state.undoStack[state.undoStack.length - 1];
        const chunkIndex = state.chunks.findIndex((c) => c.id === action.id);
        if (chunkIndex === -1) return;

        // Vorherigen Zustand wiederherstellen
        const chunk = state.chunks[chunkIndex];
        const restoredChunk = { ...chunk, ...action.prev };
        const newChunks = [...state.chunks];
        newChunks[chunkIndex] = restoredChunk;

        // Zum Wiederherstellen-Stapel verschieben
        const newUndoStack = state.undoStack.slice(0, -1);
        const newRedoStack = [...state.redoStack, action];

        // Abgeleiteten Zustand neu berechnen
        const derived = computeDerivedState(newChunks);

        set({
          chunks: newChunks,
          undoStack: newUndoStack,
          redoStack: newRedoStack,
          text: derived.text,
          duration: derived.duration,
          canUndo: newUndoStack.length > 0,
          canRedo: newRedoStack.length > 0,
        });
      },

      // Wiederherstellen-Aktion
      redo: () => {
        const state = get();
        if (state.redoStack.length === 0) return;

        const action = state.redoStack[state.redoStack.length - 1];
        const chunkIndex = state.chunks.findIndex((c) => c.id === action.id);
        if (chunkIndex === -1) return;

        // Aktion anwenden
        const chunk = state.chunks[chunkIndex];
        const updatedChunk = { ...chunk, ...action.next };
        const newChunks = [...state.chunks];
        newChunks[chunkIndex] = updatedChunk;

        // Zurück zum Rückgängig-Stapel verschieben
        const newUndoStack = [...state.undoStack, action];
        const newRedoStack = state.redoStack.slice(0, -1);

        // Abgeleiteten Zustand neu berechnen
        const derived = computeDerivedState(newChunks);

        set({
          chunks: newChunks,
          undoStack: newUndoStack,
          redoStack: newRedoStack,
          text: derived.text,
          duration: derived.duration,
          canUndo: newUndoStack.length > 0,
          canRedo: newRedoStack.length > 0,
        });
      },

      // Verlauf leeren
      clearHistory: () => {
        set({
          undoStack: [],
          redoStack: [],
          canUndo: false,
          canRedo: false,
        });
      },

      // Ausgewählte Chunks gesammelt löschen
      deleteSelected: (selectedIds) => {
        const state = get();
        const actions: UpdateAction[] = [];
        const newChunks = [...state.chunks];
        const now = Date.now();

        // Löschaktion für jeden ausgewählten Chunk erstellen
        for (const id of selectedIds) {
          const chunkIndex = newChunks.findIndex((c) => c.id === id);
          if (chunkIndex !== -1) {
            const chunk = newChunks[chunkIndex];
            if (!chunk.deleted) {
              const action: UpdateAction = {
                type: 'update',
                id,
                prev: { deleted: chunk.deleted },
                next: { deleted: true },
              };

              newChunks[chunkIndex] = { ...chunk, deleted: true };
              actions.push(action);
            }
          }
        }

        if (actions.length > 0) {
          // Abgeleiteten Zustand neu berechnen
          const derived = computeDerivedState(newChunks);

          set({
            chunks: newChunks,
            undoStack: [...state.undoStack, ...actions],
            redoStack: [],
            lastUpdateTime: now,
            text: derived.text,
            duration: derived.duration,
            canUndo: true,
            canRedo: false,
          });
        }
      },

      // Ausgewählte Chunks gesammelt wiederherstellen
      restoreSelected: (selectedIds) => {
        const state = get();
        const actions: UpdateAction[] = [];
        const newChunks = [...state.chunks];
        const now = Date.now();

        // Wiederherstellungsaktion für jeden ausgewählten Chunk erstellen
        for (const id of selectedIds) {
          const chunkIndex = newChunks.findIndex((c) => c.id === id);
          if (chunkIndex !== -1) {
            const chunk = newChunks[chunkIndex];
            if (chunk.deleted) {
              const action: UpdateAction = {
                type: 'update',
                id,
                prev: { deleted: chunk.deleted },
                next: { deleted: false },
              };

              newChunks[chunkIndex] = { ...chunk, deleted: false };
              actions.push(action);
            }
          }
        }

        if (actions.length > 0) {
          // Abgeleiteten Zustand neu berechnen
          const derived = computeDerivedState(newChunks);

          set({
            chunks: newChunks,
            undoStack: [...state.undoStack, ...actions],
            redoStack: [],
            lastUpdateTime: now,
            text: derived.text,
            duration: derived.duration,
            canUndo: true,
            canRedo: false,
          });
        }
      },

      // Untertiteltext bearbeiten
      updateChunkText: (chunkId, newText) => {
        const state = get();
        const newChunks = [...state.chunks];
        const now = Date.now();

        const chunkIndex = newChunks.findIndex((c) => c.id === chunkId);
        if (chunkIndex === -1) {
          console.warn('Angegebenes Untertitelsegment nicht gefunden:', chunkId);
          return;
        }

        const chunk = newChunks[chunkIndex];
        const trimmedText = newText.trim();

        // Wenn sich der Text nicht geändert hat, kein Update nötig
        if (chunk.text === trimmedText) {
          return;
        }

        const action: UpdateAction = {
          type: 'update',
          id: chunkId,
          prev: { text: chunk.text },
          next: { text: trimmedText },
        };

        // Chunk-Text aktualisieren
        newChunks[chunkIndex] = { ...chunk, text: trimmedText };

        // Abgeleiteten Zustand neu berechnen
        const derived = computeDerivedState(newChunks);

        set({
          chunks: newChunks,
          undoStack: [...state.undoStack, action],
          redoStack: [],
          lastUpdateTime: now,
          text: derived.text,
          duration: derived.duration,
          canUndo: true,
          canRedo: false,
        });
      },

      // Alle Zustände zurücksetzen
      reset: () => {
        set(initialState);
      },
    }),
    {
      name: 'history-store', // Redux DevTools
    }
  )
);

// Eigenständige Zustandsselektoren, um neue Objektreferenzen zu vermeiden
export const useCanUndo = () => useHistoryStore((state) => state.canUndo);
export const useCanRedo = () => useHistoryStore((state) => state.canRedo);

// Eigenständige Aktionsselektoren, um neue Objektreferenzen zu vermeiden
export const useSetTranscript = () => useHistoryStore((state) => state.setTranscript);
export const useUpdate = () => useHistoryStore((state) => state.update);
export const useDelete = () => useHistoryStore((state) => state.delete);
export const useUndo = () => useHistoryStore((state) => state.undo);
export const useRedo = () => useHistoryStore((state) => state.redo);
export const useClearHistory = () => useHistoryStore((state) => state.clearHistory);
export const useDeleteSelected = () => useHistoryStore((state) => state.deleteSelected);
export const useRestoreSelected = () => useHistoryStore((state) => state.restoreSelected);
export const useUpdateChunkText = () => useHistoryStore((state) => state.updateChunkText);
export const useResetHistory = () => useHistoryStore((state) => state.reset);

// Alle Chunks abrufen (in Komponenten mit useMemo filtern)
export const useChunks = () => useHistoryStore((state) => state.chunks);

// Eigenständige Selektoren, um neue Objektreferenzen zu vermeiden
export const useHistoryText = () => useHistoryStore((state) => state.text);
export const useHistoryLanguage = () => useHistoryStore((state) => state.language);
export const useHistoryDuration = () => useHistoryStore((state) => state.duration);
