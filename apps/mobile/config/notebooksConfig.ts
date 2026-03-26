import { type Ionicons } from '@expo/vector-icons';

export interface NotebookCollection {
  id: string;
  name: string;
  description: string;
  documentCount: string;
  linkType: 'vectorDocument' | 'url';
  externalUrl?: string;
  locale: 'de-DE' | 'de-AT';
}

export interface NotebookConfig {
  id: string;
  title: string;
  collectionType: 'single' | 'multi';
  collections: NotebookCollection[];
  placeholder: string;
  exampleQuestions: Array<{ icon: string; text: string }>;
  icon: 'library' | 'document-text' | 'globe' | 'flag';
  color: string;
}

export type NotebookCategory = 'bundesebene' | 'landesebene' | 'weitere';

export interface MobileNotebookEntry {
  id: string;
  title: string;
  description: string;
  meta: string;
  icon: keyof typeof Ionicons.glyphMap;
  order: number;
  category: NotebookCategory;
}

const PRODUCTION_NOTEBOOKS: MobileNotebookEntry[] = [
  {
    id: 'gruenerator-notebook',
    title: 'Grünerator',
    description: 'Durchsucht automatisch mehrere Quellen parallel und kombiniert die Ergebnisse.',
    meta: 'Mehrere Quellen',
    icon: 'search',
    order: 0,
    category: 'bundesebene',
  },
  {
    id: 'gruene-notebook',
    title: 'Bundesverband',
    description: 'Durchsuchbar sind die offiziellen Grundsatzprogramme von Bündnis 90/Die Grünen.',
    meta: '3 Programme',
    icon: 'book',
    order: 1,
    category: 'bundesebene',
  },
  {
    id: 'bundestagsfraktion-notebook',
    title: 'Bundestagsfraktion',
    description:
      'Durchsuchbar sind die offiziellen Inhalte von gruene-bundestag.de – Fachtexte, politische Ziele und einfache Erklärungen.',
    meta: '542 Artikel',
    icon: 'business',
    order: 2,
    category: 'bundesebene',
  },
  {
    id: 'oesterreich-notebook',
    title: 'Die Grünen Österreich',
    description:
      'Durchsuchbar sind die offiziellen Programme von Die Grünen – Die Grüne Alternative Österreich.',
    meta: '3 Programme',
    icon: 'globe',
    order: 3,
    category: 'bundesebene',
  },
  {
    id: 'hamburg-notebook',
    title: 'Hamburg',
    description: 'Durchsuchbar sind Beschlüsse und Pressemitteilungen der Grünen Hamburg.',
    meta: 'Archiv',
    icon: 'compass',
    order: 4,
    category: 'landesebene',
  },
  {
    id: 'schleswig-holstein-notebook',
    title: 'Schleswig-Holstein',
    description:
      'Durchsuchbar ist das Wahlprogramm der Grünen Schleswig-Holstein zur Landtagswahl.',
    meta: '1 Programm',
    icon: 'location',
    order: 5,
    category: 'landesebene',
  },
  {
    id: 'thueringen-notebook',
    title: 'Thüringen',
    description:
      'Durchsuchbar sind Beschlüsse, Wahlprogramme und Pressemitteilungen der Grünen Thüringen.',
    meta: 'Archiv',
    icon: 'leaf',
    order: 6,
    category: 'landesebene',
  },
  {
    id: 'berlin-notebook',
    title: 'Berlin',
    description: 'Durchsuchbar sind Pressemitteilungen und Beschlüsse der Grünen Berlin.',
    meta: 'Archiv',
    icon: 'business',
    order: 7,
    category: 'landesebene',
  },
  {
    id: 'mecklenburg-vorpommern-notebook',
    title: 'Mecklenburg-Vorpommern',
    description:
      'Durchsuchbar sind Pressemitteilungen und Parteitagsbeschlüsse der Grünen Mecklenburg-Vorpommern.',
    meta: 'Archiv',
    icon: 'flag',
    order: 8,
    category: 'landesebene',
  },
  {
    id: 'brandenburg-notebook',
    title: 'Brandenburg',
    description:
      'Durchsuchbar sind Pressemitteilungen, Beschlüsse und Wahlprogramme der Grünen Brandenburg.',
    meta: 'Archiv',
    icon: 'leaf',
    order: 9,
    category: 'landesebene',
  },
  {
    id: 'kommunalwiki-notebook',
    title: 'KommunalWiki',
    description:
      'Fachwissen zur Kommunalpolitik – durchsuchbar über das KommunalWiki der Heinrich-Böll-Stiftung.',
    meta: 'Wiki',
    icon: 'scale',
    order: 10,
    category: 'weitere',
  },
  {
    id: 'gruenblog-notebook',
    title: 'Grünblog',
    description: 'Durchsuchbar sind die Artikel des Grünblogs – dem Onlinemagazin der Grünen.',
    meta: 'Magazin',
    icon: 'newspaper',
    order: 11,
    category: 'weitere',
  },
];

export const MOBILE_SYSTEM_NOTEBOOKS: MobileNotebookEntry[] = [
  ...PRODUCTION_NOTEBOOKS,
].sort((a, b) => a.order - b.order);

export const HIDDEN_NOTEBOOK_IDS = [
  'gruenerator-notebook',
  'gruenblog-notebook',
];

export const getVisibleNotebooks = (): MobileNotebookEntry[] =>
  MOBILE_SYSTEM_NOTEBOOKS.filter((nb) => !HIDDEN_NOTEBOOK_IDS.includes(nb.id));

export const getMobileNotebooksByCategory = (category: NotebookCategory): MobileNotebookEntry[] =>
  MOBILE_SYSTEM_NOTEBOOKS.filter(
    (nb) => nb.category === category && !HIDDEN_NOTEBOOK_IDS.includes(nb.id)
  );

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

export const NOTEBOOK_CONFIGS: Record<string, NotebookConfig> = {
  gruenerator: {
    id: 'gruenerator',
    title: 'Frag Grünerator',
    collectionType: 'multi',
    collections: [
      {
        id: 'grundsatz-system',
        name: 'Grundsatzprogramme',
        description: 'Grundsatzprogramm 2020, EU-Wahlprogramm 2024, Regierungsprogramm 2025',
        documentCount: '3 Programme',
        linkType: 'vectorDocument',
        locale: 'de-DE',
      },
      {
        id: 'bundestagsfraktion-system',
        name: 'Bundestagsfraktion',
        description: 'Fachtexte, Ziele und einfache Erklärungen',
        documentCount: '542 Artikel',
        externalUrl: 'https://www.gruene-bundestag.de',
        linkType: 'url',
        locale: 'de-DE',
      },
      {
        id: 'gruene-de-system',
        name: 'gruene.de',
        description: 'Positionen, Themen und Aktuelles von gruene.de',
        documentCount: 'Webseite',
        externalUrl: 'https://www.gruene.de',
        linkType: 'url',
        locale: 'de-DE',
      },
      {
        id: 'oesterreich-gruene-system',
        name: 'Die Grünen Österreich',
        description: 'Programme der Grünen – Die Grüne Alternative Österreich',
        documentCount: '3 Programme',
        linkType: 'vectorDocument',
        locale: 'de-AT',
      },
      {
        id: 'gruene-at-system',
        name: 'gruene.at',
        description: 'Positionen, Themen und Aktuelles von gruene.at',
        documentCount: 'Webseite',
        externalUrl: 'https://www.gruene.at',
        linkType: 'url',
        locale: 'de-AT',
      },
      {
        id: 'kommunalwiki-system',
        name: 'KommunalWiki',
        description: 'Fachwissen zur Kommunalpolitik (Heinrich-Böll-Stiftung)',
        documentCount: 'Wiki',
        externalUrl: 'https://kommunalwiki.boell.de',
        linkType: 'url',
        locale: 'de-DE',
      },
      {
        id: 'bayern-system',
        name: 'Grüne Bayern',
        description: 'Regierungsprogramm zur Landtagswahl',
        documentCount: '1 Programm',
        externalUrl: 'https://www.gruene-bayern.de',
        linkType: 'url',
        locale: 'de-DE',
      },
      {
        id: 'boell-stiftung-system',
        name: 'Heinrich-Böll-Stiftung',
        description: 'Analysen, Dossiers und Atlanten der Heinrich-Böll-Stiftung',
        documentCount: 'Publikationen',
        externalUrl: 'https://www.boell.de',
        linkType: 'url',
        locale: 'de-DE',
      },
    ],
    placeholder: 'Stell deine Frage zu grüner Politik...',
    exampleQuestions: [
      { icon: '🌍', text: 'Was sagen die Grünen zum Klimaschutz?' },
      { icon: '🇪🇺', text: 'Wie ist die grüne Position zur EU?' },
      { icon: '⚡', text: 'Was steht zur Energiewende in den Programmen?' },
    ],
    icon: 'library',
    color: '#316049',
  },

  gruene: {
    id: 'gruene',
    title: 'Frag Bündnis 90/Die Grünen',
    collectionType: 'single',
    collections: [
      {
        id: 'grundsatz-system',
        name: 'Grundsatzprogramme',
        description: 'Grundsatzprogramm 2020, EU-Wahlprogramm 2024, Regierungsprogramm 2025',
        documentCount: '3 Programme',
        linkType: 'vectorDocument',
        locale: 'de-DE',
      },
    ],
    placeholder: 'Stell deine Frage zu den Grundsatzprogrammen...',
    exampleQuestions: [
      { icon: '🌍', text: 'Was steht im Grundsatzprogramm zu Klimaschutz?' },
      { icon: '🇪🇺', text: 'Wie positionieren sich die Grünen zur EU?' },
      { icon: '🏛️', text: 'Was sagt das Regierungsprogramm zu Bildung?' },
    ],
    icon: 'document-text',
    color: '#46962b',
  },

  bundestagsfraktion: {
    id: 'bundestagsfraktion',
    title: 'Frag die Bundestagsfraktion',
    collectionType: 'single',
    collections: [
      {
        id: 'bundestagsfraktion-system',
        name: 'Bundestagsfraktion',
        description: 'Fachtexte, Ziele und einfache Erklärungen',
        documentCount: '542 Artikel',
        externalUrl: 'https://www.gruene-bundestag.de',
        linkType: 'url',
        locale: 'de-DE',
      },
    ],
    placeholder: 'Stell deine Frage zur Grünen Bundestagsfraktion...',
    exampleQuestions: [
      { icon: '🌍', text: 'Was sind die Klimaziele der Fraktion?' },
      { icon: '📋', text: 'Welche Positionen gibt es zur Migrationspolitik?' },
      { icon: '💶', text: 'Wie positioniert sich die Fraktion zum Haushalt?' },
    ],
    icon: 'globe',
    color: '#005538',
  },

  oesterreich: {
    id: 'oesterreich',
    title: 'Frag Die Grünen Österreich',
    collectionType: 'single',
    collections: [
      {
        id: 'oesterreich-gruene-system',
        name: 'Die Grünen Österreich',
        description: 'Programme der Grünen – Die Grüne Alternative Österreich',
        documentCount: '3 Programme',
        linkType: 'vectorDocument',
        locale: 'de-AT',
      },
    ],
    placeholder: 'Stell deine Frage zu den Programmen der Grünen Österreich...',
    exampleQuestions: [
      { icon: '🌍', text: 'Was steht im Grundsatzprogramm zu Klimaschutz?' },
      { icon: '🇪🇺', text: 'Wie positionieren sich Die Grünen Österreich zur EU?' },
      { icon: '🏛️', text: 'Was sagt das Wahlprogramm zur Nationalratswahl?' },
    ],
    icon: 'flag',
    color: '#88b626',
  },
};

export const NOTEBOOK_LIST = Object.values(NOTEBOOK_CONFIGS);

export const getNotebookConfig = (configId: string): NotebookConfig => {
  return NOTEBOOK_CONFIGS[configId] || NOTEBOOK_CONFIGS.gruenerator;
};
