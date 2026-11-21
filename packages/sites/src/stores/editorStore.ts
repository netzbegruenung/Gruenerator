import { type SiteSectionId } from '@gruenerator/contracts';
import { create } from 'zustand';

export type SectionType = SiteSectionId;
export type EditorPanel = SiteSectionId | 'settings' | 'legal';

export interface FocusedField {
  panel: EditorPanel;
  path: string;
}

/** What the person clicked on the page: a section, and inside it a field and/or a card. */
export interface EditorSelection {
  section: SectionType;
  /** `data-field` path under the click, null on the section background. */
  path: string | null;
  /** Index of the theme or action card under the click. */
  index: number | null;
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

const sameSelection = (a: EditorSelection | null, b: EditorSelection | null): boolean =>
  a === b ||
  (a !== null && b !== null && a.section === b.section && a.path === b.path && a.index === b.index);

export const useEditorStore = create<EditorState>((set) => ({
  selection: null,
  elementPanel: null,
  dialog: null,
  focusedField: null,
  highlightedElement: null,

  select: (selection) =>
    set((state) => {
      if (sameSelection(state.selection, selection)) return state;
      // A panel belongs to the section it was opened for.
      const keepPanel = selection !== null && state.selection?.section === selection.section;
      return { selection, elementPanel: keepPanel ? state.elementPanel : null };
    }),

  openElementPanel: (elementPanel) => set({ elementPanel }),

  openDialog: (dialog) => set({ dialog }),

  focusPath: (panel, path) =>
    set(
      panel === 'settings' || panel === 'legal'
        ? {
            dialog: panel,
            focusedField: { panel, path },
            highlightedElement: { panel, path },
          }
        : {
            selection: { section: panel, path, index: null },
            elementPanel: 'details',
            dialog: null,
            focusedField: { panel, path },
            highlightedElement: { panel, path },
          }
    ),

  setHighlightedElement: (element) => set({ highlightedElement: element }),

  clearFocus: () => set({ focusedField: null, highlightedElement: null }),
}));

export const SECTION_ORDER: SectionType[] = [
  'hero',
  'about',
  'heroImage',
  'themes',
  'actions',
  'socialFeed',
  'contact',
];

export const SECTION_LABELS: Record<SectionType, string> = {
  hero: 'Profil',
  about: 'Über mich',
  heroImage: 'Hero-Bild',
  themes: 'Themen',
  actions: 'Aktionen',
  socialFeed: 'Instagram',
  contact: 'Kontakt',
};
