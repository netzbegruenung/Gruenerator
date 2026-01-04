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
