export const PR_TYPES = [
  'instagram',
  'facebook',
  'twitter',
  'linkedin',
  'pressemitteilung',
  'pr_text',
];

export const ANTRAEGE_TYPES = ['antrag', 'kleine_anfrage', 'grosse_anfrage'];

export const GENERATOR_TYPES = ['template'];

export const DEFAULT_GALLERY_TYPE = 'antraege';

export interface GalleryConfig {
  id: string;
  label: string;
  title: string;
  intro: string;
  searchModes: { value: string; label: string }[];
  defaultSearchMode: string;
  fetcher: string;
  sectionOrder?: string[];
  sectionLabels?: Record<string, string>;
  sectionTypeMap?: Record<string, string[]>;
  allowCategoryFilter?: boolean;
  categorySource?: {
    type: 'api' | 'static';
    queryKey?: string[];
    endpoint?: string;
    categories?: { id: string; label: string }[];
  };
  cardRenderer?: string;
  filterTypes?: string[];
}

export const GALLERY_CONTENT_TYPES: Record<string, GalleryConfig> = {
  all: {
    id: 'all',
    label: 'Alle Kategorien',
    title: 'Datenbank',
    intro: 'Durchsuchen Sie unsere gesamte Datenbank mit allen Inhalten.',
    searchModes: [
      { value: 'title', label: 'Titel' },
      { value: 'fulltext', label: 'Volltext' },
      { value: 'examples', label: 'Beispiele (AI)' },
      { value: 'semantic', label: 'Semantisch' },
    ],
    defaultSearchMode: 'title',
    fetcher: 'fetchUnified',
    sectionOrder: ['antraege', 'generators', 'pr'],
    sectionLabels: {
      antraege: 'Anträge',
      generators: 'Grüneratoren',
      pr: 'Öffentlichkeitsarbeit',
    },
    sectionTypeMap: {
      antraege: ANTRAEGE_TYPES,
      generators: GENERATOR_TYPES,
      pr: PR_TYPES,
    },
    allowCategoryFilter: false,
  },
  antraege: {
    id: 'antraege',
    label: 'Anträge',
    title: 'Antragsdatenbank',
    intro: 'Durchsuchen und verwalten Sie hier eingereichte Anträge.',
    searchModes: [
      { value: 'title', label: 'Titel' },
      { value: 'fulltext', label: 'Volltext' },
    ],
    defaultSearchMode: 'title',
    fetcher: 'fetchAntraege',
    categorySource: {
      type: 'api',
      queryKey: ['antraegeCategories'],
      endpoint: '/auth/antraege-categories',
    },
    cardRenderer: 'antraege',
  },
  generators: {
    id: 'generators',
    label: 'Grüneratoren',
    title: 'Grüneratoren-Datenbank',
    intro: 'Durchsuchen und verwalten Sie hier benutzerdefinierte Grüneratoren.',
    searchModes: [
      { value: 'title', label: 'Titel' },
      { value: 'fulltext', label: 'Volltext' },
    ],
    defaultSearchMode: 'title',
    fetcher: 'fetchGenerators',
    categorySource: {
      type: 'static',
      categories: [
        { id: 'all', label: 'Alle Kategorien' },
        { id: 'own', label: 'Eigene Generatoren' },
        { id: 'shared', label: 'Geteilte Generatoren' },
        { id: 'popular', label: 'Beliebt' },
      ],
    },
    cardRenderer: 'generators',
  },
  pr: {
    id: 'pr',
    label: 'Öffentlichkeitsarbeit',
    title: 'Öffentlichkeitsarbeit-Datenbank',
    intro: 'Durchsuchen und verwalten Sie hier Texte für die Öffentlichkeitsarbeit.',
    searchModes: [
      { value: 'title', label: 'Titel' },
      { value: 'fulltext', label: 'Volltext' },
      { value: 'examples', label: 'Beispiele (AI)' },
      { value: 'semantic', label: 'Semantisch' },
    ],
    defaultSearchMode: 'title',
    fetcher: 'fetchUnified',
    filterTypes: PR_TYPES,
    allowCategoryFilter: true,
    cardRenderer: 'pr',
  },
  vorlagen: {
    id: 'vorlagen',
    label: 'Vorlagen',
    title: 'Vorlagen-Datenbank',
    intro: 'Durchsuchen Sie hier Design-Vorlagen für Canva, InDesign und mehr.',
    searchModes: [
      { value: 'title', label: 'Titel' },
      { value: 'fulltext', label: 'Volltext' },
    ],
    defaultSearchMode: 'title',
    fetcher: 'fetchVorlagen',
    categorySource: {
      type: 'api',
      queryKey: ['vorlagenCategories'],
      endpoint: '/auth/vorlagen-categories',
    },
    cardRenderer: 'vorlagen',
    allowCategoryFilter: true,
  },
  prompts: {
    id: 'prompts',
    label: 'Prompts',
    title: 'Prompt-Datenbank',
    intro: 'Entdecke öffentliche Prompts der Community',
    searchModes: [
      { value: 'title', label: 'Titel' },
      { value: 'fulltext', label: 'Volltext' },
      { value: 'semantic', label: 'Semantisch' },
    ],
    defaultSearchMode: 'title',
    fetcher: 'fetchPublicPrompts',
    cardRenderer: 'prompts',
    allowCategoryFilter: false,
  },
};

export const ORDERED_CONTENT_TYPE_IDS = [
  'antraege',
  'generators',
  'pr',
  'vorlagen',
  'prompts',
  'all',
];
