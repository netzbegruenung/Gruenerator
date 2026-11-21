import { create } from 'zustand';

/** A block's form (by block id), or the settings and Impressum outside the page. */
export type EditorPanel = 'settings' | 'legal' | (string & {});

export interface FocusedField {
  panel: EditorPanel;
  path: string;
}

/** What the person clicked on the page: a block, and inside it a field and/or a card. */
export interface EditorSelection {
  blockId: string;
  /** Id of the theme card or action tile under the click. */
  itemId: string | null;
  /** `data-field` path under the click, null on the block background. */
  path: string | null;
}

/** The floating panel next to the page: a section's details or its image. */
export type ElementPanel = 'details' | 'image';

interface EditorState {
  selection: EditorSelection | null;
  /** The panel shown for the selection; null shows only the toolbar. */
  elementPanel: ElementPanel | null;
  /** Settings or Impressum dialog. */
  dialog: 'settings' | 'legal' | null;
  /** A field to focus once its form is mounted (publish issues jump there). */
  focusedField: FocusedField | null;
  highlightedElement: FocusedField | null;

  select: (selection: EditorSelection | null) => void;
  openElementPanel: (panel: ElementPanel | null) => void;
  openDialog: (dialog: 'settings' | 'legal' | null) => void;
  /** Opens the form that holds `path` and focuses the field there. */
  focusPath: (panel: EditorPanel, path: string) => void;
  setHighlightedElement: (element: FocusedField | null) => void;
  clearFocus: () => void;
}

const ITEM_ID = /^blocks\.[^.]+\.items\.([^.]+)\./;
const itemIdOf = (path: string): string | null => ITEM_ID.exec(path)?.[1] ?? null;

const sameSelection = (a: EditorSelection | null, b: EditorSelection | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.blockId === b.blockId &&
    a.path === b.path &&
    a.itemId === b.itemId);

export const useEditorStore = create<EditorState>((set) => ({
  selection: null,
  elementPanel: null,
  dialog: null,
  focusedField: null,
  highlightedElement: null,

  select: (selection) =>
    set((state) => {
      if (sameSelection(state.selection, selection)) return state;
      // A panel belongs to the block it was opened for.
      const keepPanel = selection !== null && state.selection?.blockId === selection.blockId;
      return { selection, elementPanel: keepPanel ? state.elementPanel : null };
    }),

  openElementPanel: (elementPanel) => set({ elementPanel }),

  openDialog: (dialog) => set({ dialog }),

  focusPath: (panel, path) =>
    set(
      panel === 'settings' || panel === 'legal'
        ? {
            dialog: panel === 'settings' ? 'settings' : 'legal',
            focusedField: { panel, path },
            highlightedElement: { panel, path },
          }
        : {
            selection: { blockId: panel, itemId: itemIdOf(path), path },
            elementPanel: 'details',
            dialog: null,
            focusedField: { panel, path },
            highlightedElement: { panel, path },
          }
    ),

  setHighlightedElement: (element) => set({ highlightedElement: element }),

  clearFocus: () => set({ focusedField: null, highlightedElement: null }),
}));
