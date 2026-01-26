import { create } from 'zustand';

export type SectionType =
  | 'hero'
  | 'about'
  | 'heroImage'
  | 'themes'
  | 'actions'
  | 'socialFeed'
  | 'contact';

export interface FocusedField {
  section: SectionType;
  field: string;
  index?: number;
}

export interface HighlightedElement {
  section: SectionType;
  field?: string;
  index?: number;
}

interface EditorState {
  activeSection: SectionType | null;
  focusedField: FocusedField | null;
  highlightedElement: HighlightedElement | null;
  isScrollLocked: boolean;
  isMobileEditorOpen: boolean;
  scrollSource: 'preview' | 'sidebar' | null;
  pendingScrollTo: SectionType | null;

  setActiveSection: (section: SectionType | null) => void;
  navigateToSection: (section: SectionType) => void;
  focusField: (section: SectionType, field: string, index?: number) => void;
  setHighlightedElement: (element: HighlightedElement | null) => void;
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

  focusField: (section, field, index) =>
    set({
      activeSection: section,
      focusedField: { section, field, index },
      highlightedElement: { section, field, index },
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
