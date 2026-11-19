import { type SiteSectionId } from '@gruenerator/contracts';
import { create } from 'zustand';

export type SectionType = SiteSectionId;
export type EditorPanel = SiteSectionId | 'settings' | 'legal';

export interface FocusedField {
  panel: EditorPanel;
  path: string;
}

interface EditorState {
  activeSection: EditorPanel | null;
  focusedField: FocusedField | null;
  highlightedElement: FocusedField | null;
  isScrollLocked: boolean;
  isMobileEditorOpen: boolean;
  scrollSource: 'preview' | 'sidebar' | null;
  pendingScrollTo: SectionType | null;

  setActiveSection: (section: EditorPanel | null) => void;
  navigateToSection: (section: SectionType) => void;
  focusPath: (panel: EditorPanel, path: string) => void;
  setHighlightedElement: (element: FocusedField | null) => void;
  clearFocus: () => void;
  setScrollLocked: (locked: boolean) => void;
  setScrollSource: (source: 'preview' | 'sidebar' | null) => void;
  clearPendingScroll: () => void;
  toggleMobileEditor: () => void;
  setMobileEditorOpen: (open: boolean) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  activeSection: 'hero',
  focusedField: null,
  highlightedElement: null,
  isScrollLocked: false,
  isMobileEditorOpen: false,
  scrollSource: null,
  pendingScrollTo: null,

  setActiveSection: (section) => set({ activeSection: section }),

  navigateToSection: (section) =>
    set({
      activeSection: section,
      pendingScrollTo: section,
      scrollSource: 'sidebar',
    }),

  focusPath: (panel, path) =>
    set({
      activeSection: panel,
      focusedField: { panel, path },
      highlightedElement: { panel, path },
      isMobileEditorOpen: true,
    }),

  setHighlightedElement: (element) => set({ highlightedElement: element }),

  clearFocus: () =>
    set({
      focusedField: null,
      highlightedElement: null,
    }),

  setScrollLocked: (locked) => set({ isScrollLocked: locked }),

  setScrollSource: (source) => set({ scrollSource: source }),

  clearPendingScroll: () => set({ pendingScrollTo: null }),

  toggleMobileEditor: () =>
    set((state) => ({
      isMobileEditorOpen: !state.isMobileEditorOpen,
    })),

  setMobileEditorOpen: (open) => set({ isMobileEditorOpen: open }),
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

export const SECTION_ICONS: Record<SectionType, string> = {
  hero: 'person',
  about: 'info',
  heroImage: 'image',
  themes: 'category',
  actions: 'bolt',
  socialFeed: 'camera_alt',
  contact: 'mail',
};
