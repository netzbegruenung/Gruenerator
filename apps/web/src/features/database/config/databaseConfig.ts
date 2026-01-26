export interface DatabaseSection {
  id: string;
  path: string;
  title: string;
  description: string;
  meta?: string;
  tags?: string[];
  order: number;
}

export const DATABASE_SECTIONS: DatabaseSection[] = [
  {
    id: 'vorlagen',
    path: '/datenbank/vorlagen',
    title: 'Vorlagen',
    description: 'Durchsuche und nutze Vorlagen für Social Media, Präsentationen und mehr.',
    meta: 'Templates & Designs',
    tags: ['Sharepics', 'Präsentationen', 'Social Media'],
    order: 0,
  },
  {
    id: 'prompts',
    path: '/datenbank/prompts',
    title: 'Prompts',
    description: 'Entdecke und nutze vorgefertigte Prompts für verschiedene Anwendungsfälle.',
    meta: 'KI-Prompts',
    tags: ['Generierung', 'Vorlagen'],
    order: 1,
  },
];

export const getOrderedSections = (): DatabaseSection[] =>
  [...DATABASE_SECTIONS].sort((a, b) => a.order - b.order);

export const getSectionById = (id: string): DatabaseSection | undefined =>
  DATABASE_SECTIONS.find((section) => section.id === id);

export const getSectionByPath = (path: string): DatabaseSection | undefined =>
  DATABASE_SECTIONS.find((section) => section.path === path);
