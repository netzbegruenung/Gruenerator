export type NotebookCategory = 'bundesebene' | 'landesebene' | 'weitere';

export interface NotebookEntry {
  collectionId: string;
  name: string;
  emoji: string;
  description: string;
  category: NotebookCategory;
  badgeLabel: string;
  badgeColor: string;
  badgeBg: string;
  featured?: boolean;
  linkType?: 'url' | 'document';
}

export const NOTEBOOKS: NotebookEntry[] = [
  {
    collectionId: 'gruene-de-system',
    name: 'gruene.de',
    emoji: '🌻',
    description:
      'Alle Inhalte von gruene.de — Positionen, Themen und Aktuelles von Bündnis 90/Die Grünen',
    category: 'bundesebene',
    badgeLabel: 'gruene.de',
    badgeColor: '#16a34a',
    badgeBg: '#f0fdf4',
    featured: true,
    linkType: 'url',
  },
  {
    collectionId: 'grundsatz-system',
    name: 'Grundsatzprogramm',
    emoji: '📗',
    description: 'Grundsatzprogramm 2020, EU-Wahlprogramm 2024 und Regierungsprogramm 2025',
    category: 'bundesebene',
    badgeLabel: 'Programme',
    badgeColor: '#059669',
    badgeBg: '#ecfdf5',
    linkType: 'url',
  },
  {
    collectionId: 'bundestagsfraktion-system',
    name: 'Bundestagsfraktion',
    emoji: '🏛️',
    description: 'Fachtexte, Ziele und Positionen der Grünen Bundestagsfraktion',
    category: 'bundesebene',
    badgeLabel: 'Bundestag',
    badgeColor: '#2563eb',
    badgeBg: '#eff6ff',
    linkType: 'url',
  },
  {
    collectionId: 'hamburg-system',
    name: 'Grüne Hamburg',
    emoji: '⚓',
    description: 'Beschlüsse und Pressemitteilungen der Grünen Hamburg',
    category: 'landesebene',
    badgeLabel: 'Landesverband',
    badgeColor: '#0d9488',
    badgeBg: '#f0fdfa',
    linkType: 'url',
  },
  {
    collectionId: 'schleswig-holstein-system',
    name: 'Grüne Schleswig-Holstein',
    emoji: '🌊',
    description: 'Wahlprogramm der Grünen Schleswig-Holstein zur Landtagswahl',
    category: 'landesebene',
    badgeLabel: 'Landesverband',
    badgeColor: '#0d9488',
    badgeBg: '#f0fdfa',
    linkType: 'url',
  },
  {
    collectionId: 'thueringen-system',
    name: 'Grüne Thüringen',
    emoji: '🏔️',
    description: 'Beschlüsse, Wahlprogramme und Pressemitteilungen der Grünen Thüringen',
    category: 'landesebene',
    badgeLabel: 'Landesverband',
    badgeColor: '#0d9488',
    badgeBg: '#f0fdfa',
    linkType: 'url',
  },
  {
    collectionId: 'bayern-system',
    name: 'Grüne Bayern',
    emoji: '🦁',
    description: 'Regierungsprogramm der Grünen Bayern zur Landtagswahl',
    category: 'landesebene',
    badgeLabel: 'Landesverband',
    badgeColor: '#0d9488',
    badgeBg: '#f0fdfa',
    linkType: 'url',
  },
  {
    collectionId: 'berlin-system',
    name: 'Grüne Berlin',
    emoji: '🐻',
    description: 'Pressemitteilungen und Beschlüsse der Grünen Berlin',
    category: 'landesebene',
    badgeLabel: 'Landesverband',
    badgeColor: '#0d9488',
    badgeBg: '#f0fdfa',
    linkType: 'url',
  },
  {
    collectionId: 'kommunalwiki-system',
    name: 'KommunalWiki',
    emoji: '📚',
    description: 'Fachwissen zur Kommunalpolitik — Handbuch für die kommunale Praxis',
    category: 'weitere',
    badgeLabel: 'Kommunalwiki',
    badgeColor: '#d97706',
    badgeBg: '#fffbeb',
    linkType: 'url',
  },
  {
    collectionId: 'boell-stiftung-system',
    name: 'Heinrich-Böll-Stiftung',
    emoji: '📖',
    description: 'Analysen, Dossiers und Atlanten der parteinahen Stiftung',
    category: 'weitere',
    badgeLabel: 'Böll-Stiftung',
    badgeColor: '#7c3aed',
    badgeBg: '#f5f3ff',
    linkType: 'url',
  },
];

export const CATEGORY_LABELS: Record<NotebookCategory, string> = {
  bundesebene: 'Bundesebene',
  landesebene: 'Landesverbände',
  weitere: 'Weitere Quellen',
};

export const CATEGORY_ORDER: NotebookCategory[] = ['bundesebene', 'landesebene', 'weitere'];

export function getNotebookByCollectionId(id: string): NotebookEntry | undefined {
  return NOTEBOOKS.find((n) => n.collectionId === id);
}
