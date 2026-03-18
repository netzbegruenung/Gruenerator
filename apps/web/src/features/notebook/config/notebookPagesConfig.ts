import { type IconType } from 'react-icons';
import { HiDocumentText, HiInformationCircle, HiCollection } from 'react-icons/hi';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

interface NotebookCollection {
  id: string;
  name: string;
  icon?: IconType;
  description?: string;
  documentCount?: string;
  externalUrl?: string;
  linkType?: 'vectorDocument' | 'url';
  locale?: string;
}

interface ExampleQuestion {
  icon: string;
  text: string;
}

interface DocumentInfo {
  title: string;
  detail: string;
}

interface SourceInfo {
  name: string;
  count: string;
}

interface NotebookConfig {
  id: string;
  title: string;
  authTitle: string;
  collectionType: 'single' | 'multi';
  collections: NotebookCollection[];
  startPageTitle: string;
  placeholder: string;
  infoPanelDescription: string;
  headerIcon: IconType;
  exampleQuestions: ExampleQuestion[];
  documents?: DocumentInfo[];
  sources?: SourceInfo[];
  externalUrl?: string;
  persistMessages: boolean;
  useSystemUserId: boolean;
  systemUserId?: string;
}

export const NOTEBOOK_CONFIGS: Record<string, NotebookConfig> = {
  gruenerator: {
    id: 'gruenerator',
    title: 'Frag Grünerator',
    authTitle: 'Frag Grünerator',
    collectionType: 'multi',
    collections: [
      {
        id: 'grundsatz-system',
        name: 'Grundsatzprogramme',
        icon: HiDocumentText,
        description: 'Grundsatzprogramm 2020, EU-Wahlprogramm 2024, Regierungsprogramm 2025',
        documentCount: '3 Programme',
        linkType: 'vectorDocument',
        locale: 'de-DE',
      },
      {
        id: 'bundestagsfraktion-system',
        name: 'Bundestagsfraktion',
        icon: HiDocumentText,
        description: 'Fachtexte, Ziele und einfache Erklärungen',
        documentCount: '542 Artikel',
        externalUrl: 'https://www.gruene-bundestag.de',
        linkType: 'url',
        locale: 'de-DE',
      },
      {
        id: 'gruene-de-system',
        name: 'gruene.de',
        icon: HiDocumentText,
        description: 'Positionen, Themen und Aktuelles von gruene.de',
        documentCount: 'Webseite',
        externalUrl: 'https://www.gruene.de',
        linkType: 'url',
        locale: 'de-DE',
      },
      {
        id: 'oesterreich-gruene-system',
        name: 'Die Grünen Österreich',
        icon: HiDocumentText,
        description: 'Programme der Grünen – Die Grüne Alternative Österreich',
        documentCount: '3 Programme',
        linkType: 'vectorDocument',
        locale: 'de-AT',
      },
      {
        id: 'gruene-at-system',
        name: 'gruene.at',
        icon: HiDocumentText,
        description: 'Positionen, Themen und Aktuelles von gruene.at',
        documentCount: 'Webseite',
        externalUrl: 'https://www.gruene.at',
        linkType: 'url',
        locale: 'de-AT',
      },
      {
        id: 'kommunalwiki-system',
        name: 'KommunalWiki',
        icon: HiDocumentText,
        description: 'Fachwissen zur Kommunalpolitik (Heinrich-Böll-Stiftung)',
        documentCount: 'Wiki',
        externalUrl: 'https://kommunalwiki.boell.de',
        linkType: 'url',
        locale: 'de-DE',
      },
      {
        id: 'boell-stiftung-system',
        name: 'Heinrich-Böll-Stiftung',
        icon: HiDocumentText,
        description: 'Analysen, Dossiers und Atlanten der Heinrich-Böll-Stiftung',
        documentCount: 'Publikationen',
        externalUrl: 'https://www.boell.de',
        linkType: 'url',
        locale: 'de-DE',
      },
      {
        id: 'gruenblog-system',
        name: 'Grünblog',
        icon: HiDocumentText,
        description: 'Onlinemagazin der Grünen – Wissen, Meinen, Machen',
        documentCount: 'Magazin',
        externalUrl: 'https://gruenblog.com',
        linkType: 'url',
        locale: 'de-DE',
      },
      {
        id: 'hamburg-system',
        name: 'Grüne Hamburg',
        icon: HiDocumentText,
        description: 'Beschlüsse und Pressemitteilungen',
        documentCount: 'Archiv',
        externalUrl: 'https://www.gruene-hamburg.de',
        linkType: 'url',
        locale: 'de-DE',
      },
      {
        id: 'schleswig-holstein-system',
        name: 'Grüne Schleswig-Holstein',
        icon: HiDocumentText,
        description: 'Wahlprogramm zur Landtagswahl',
        documentCount: '1 Programm',
        externalUrl: 'https://sh-gruene.de',
        linkType: 'url',
        locale: 'de-DE',
      },
      {
        id: 'thueringen-system',
        name: 'Grüne Thüringen',
        icon: HiDocumentText,
        description: 'Beschlüsse, Wahlprogramme und Pressemitteilungen',
        documentCount: 'Archiv',
        externalUrl: 'https://gruene-thueringen.de',
        linkType: 'url',
        locale: 'de-DE',
      },
      {
        id: 'bayern-system',
        name: 'Grüne Bayern',
        icon: HiDocumentText,
        description: 'Regierungsprogramm zur Landtagswahl',
        documentCount: '1 Programm',
        externalUrl: 'https://www.gruene-bayern.de',
        linkType: 'url',
        locale: 'de-DE',
      },
      {
        id: 'berlin-system',
        name: 'Grüne Berlin',
        icon: HiDocumentText,
        description: 'Pressemitteilungen und Beschlüsse',
        documentCount: 'Archiv',
        externalUrl: 'https://gruene.berlin',
        linkType: 'url',
        locale: 'de-DE',
      },
      {
        id: 'mecklenburg-vorpommern-system',
        name: 'Grüne Mecklenburg-Vorpommern',
        icon: HiDocumentText,
        description: 'Pressemitteilungen und Parteitagsbeschlüsse',
        documentCount: 'Archiv',
        externalUrl: 'https://gruene-mv.de',
        linkType: 'url',
        locale: 'de-DE',
      },
    ],
    startPageTitle: 'Was möchtest du wissen?',
    placeholder: 'Stell deine Frage zu grüner Politik...',
    infoPanelDescription:
      'Durchsucht automatisch mehrere Quellen parallel und kombiniert die Ergebnisse.',
    headerIcon: HiCollection,
    exampleQuestions: [
      { icon: '🌍', text: 'Was sagen die Grünen zum Klimaschutz?' },
      { icon: '🇪🇺', text: 'Wie ist die grüne Position zur EU?' },
      { icon: '⚡', text: 'Was steht zur Energiewende in den Programmen?' },
    ],
    persistMessages: true,
    useSystemUserId: false,
  },

  gruene: {
    id: 'gruene',
    title: 'Frag den Bundesverband',
    authTitle: 'Frag den Bundesverband',
    collectionType: 'single',
    collections: [
      {
        id: 'grundsatz-system',
        name: 'Grundsatzprogramme',
      },
    ],
    startPageTitle: 'Was möchtest du über die Grundsatzprogramme wissen?',
    placeholder: 'Stell deine Frage zu den Grundsatzprogrammen...',
    infoPanelDescription:
      'Durchsuchbar sind die offiziellen Grundsatzprogramme von Bündnis 90/Die Grünen.',
    headerIcon: HiInformationCircle,
    exampleQuestions: [
      { icon: '🌍', text: 'Was steht im Grundsatzprogramm zu Klimaschutz?' },
      { icon: '🇪🇺', text: 'Wie positionieren sich die Grünen zur EU?' },
      { icon: '🏛️', text: 'Was sagt das Regierungsprogramm zu Bildung?' },
    ],
    documents: [
      { title: 'Grundsatzprogramm 2020', detail: '136 Seiten' },
      { title: 'EU-Wahlprogramm 2024', detail: '114 Seiten' },
      { title: 'Regierungsprogramm 2025', detail: '160 Seiten' },
    ],
    sources: [{ name: 'Grundsatzprogramme', count: '3 Programme' }],
    persistMessages: true,
    useSystemUserId: true,
    systemUserId: SYSTEM_USER_ID,
  },

  bundestagsfraktion: {
    id: 'bundestagsfraktion',
    title: 'Frag die Bundestagsfraktion',
    authTitle: 'Frag die Bundestagsfraktion',
    collectionType: 'single',
    collections: [
      {
        id: 'bundestagsfraktion-system',
        name: 'Bundestagsfraktion',
      },
    ],
    startPageTitle: 'Was möchtest du über die Grüne Bundestagsfraktion wissen?',
    placeholder: 'Stell deine Frage zur Grünen Bundestagsfraktion...',
    infoPanelDescription:
      'Durchsuchbar sind die offiziellen Inhalte von gruene-bundestag.de – Fachtexte, politische Ziele und einfache Erklärungen.',
    headerIcon: HiInformationCircle,
    exampleQuestions: [
      { icon: '🌍', text: 'Was sind die Klimaziele der Fraktion?' },
      { icon: '📋', text: 'Welche Positionen gibt es zur Migrationspolitik?' },
      { icon: '💶', text: 'Wie positioniert sich die Fraktion zum Haushalt?' },
    ],
    documents: [
      { title: 'Fachtexte', detail: '468 Artikel' },
      { title: 'Unsere Ziele', detail: '50 Themengebiete' },
      { title: 'Einfach erklärt', detail: '24 Artikel' },
    ],
    externalUrl: 'https://www.gruene-bundestag.de',
    sources: [{ name: 'Bundestagsfraktion', count: '542 Artikel' }],
    persistMessages: true,
    useSystemUserId: true,
    systemUserId: SYSTEM_USER_ID,
  },

  oesterreich: {
    id: 'oesterreich',
    title: 'Frag Die Grünen Österreich',
    authTitle: 'Frag Die Grünen Österreich',
    collectionType: 'single',
    collections: [
      {
        id: 'oesterreich-gruene-system',
        name: 'Die Grünen Österreich',
      },
    ],
    startPageTitle: 'Was möchtest du über Die Grünen Österreich wissen?',
    placeholder: 'Stell deine Frage zu den Programmen der Grünen Österreich...',
    infoPanelDescription:
      'Durchsuchbar sind die offiziellen Programme von Die Grünen – Die Grüne Alternative Österreich.',
    headerIcon: HiInformationCircle,
    exampleQuestions: [
      { icon: '🌍', text: 'Was steht im Grundsatzprogramm zu Klimaschutz?' },
      { icon: '🇪🇺', text: 'Wie positionieren sich Die Grünen Österreich zur EU?' },
      { icon: '🏛️', text: 'Was sagt das Wahlprogramm zur Nationalratswahl?' },
    ],
    documents: [
      { title: 'Grundsatzprogramm', detail: '88 Seiten' },
      { title: 'EU-Wahlprogramm 2024', detail: '108 Seiten' },
      { title: 'Nationalratswahl-Programm', detail: '112 Seiten' },
    ],
    sources: [{ name: 'Die Grünen Österreich', count: '3 Programme' }],
    persistMessages: true,
    useSystemUserId: true,
    systemUserId: SYSTEM_USER_ID,
  },

  hamburg: {
    id: 'hamburg',
    title: 'Frag Grüne Hamburg',
    authTitle: 'Frag Grüne Hamburg',
    collectionType: 'single',
    collections: [
      {
        id: 'hamburg-system',
        name: 'Grüne Hamburg',
      },
    ],
    startPageTitle: 'Was möchtest du über die Grünen Hamburg wissen?',
    placeholder: 'Stell deine Frage zu Beschlüssen und Positionen der Grünen Hamburg...',
    infoPanelDescription: 'Durchsuchbar sind Beschlüsse und Pressemitteilungen der Grünen Hamburg.',
    headerIcon: HiInformationCircle,
    exampleQuestions: [
      { icon: '🌍', text: 'Was sagen die Grünen Hamburg zum Klimaschutz?' },
      { icon: '🚲', text: 'Welche Positionen gibt es zur Mobilitätswende?' },
      { icon: '🏙️', text: 'Was sind die Beschlüsse zur Stadtentwicklung?' },
    ],
    documents: [
      { title: 'Beschlüsse', detail: 'Parteitagsbeschlüsse' },
      { title: 'Pressemitteilungen', detail: 'Aktuelle Positionen' },
    ],
    externalUrl: 'https://www.gruene-hamburg.de',
    sources: [{ name: 'Grüne Hamburg', count: 'Archiv' }],
    persistMessages: true,
    useSystemUserId: true,
    systemUserId: SYSTEM_USER_ID,
  },

  schleswigHolstein: {
    id: 'schleswigHolstein',
    title: 'Frag Grüne Schleswig-Holstein',
    authTitle: 'Frag Grüne Schleswig-Holstein',
    collectionType: 'single',
    collections: [
      {
        id: 'schleswig-holstein-system',
        name: 'Grüne Schleswig-Holstein',
      },
    ],
    startPageTitle: 'Was möchtest du über die Grünen Schleswig-Holstein wissen?',
    placeholder: 'Stell deine Frage zum Wahlprogramm der Grünen Schleswig-Holstein...',
    infoPanelDescription:
      'Durchsuchbar ist das Wahlprogramm der Grünen Schleswig-Holstein zur Landtagswahl.',
    headerIcon: HiInformationCircle,
    exampleQuestions: [
      { icon: '🌊', text: 'Was sagen die Grünen SH zum Küstenschutz?' },
      { icon: '🌍', text: 'Welche Klimaziele hat das Wahlprogramm?' },
      { icon: '🚆', text: 'Was steht zur Verkehrswende in Schleswig-Holstein?' },
    ],
    documents: [{ title: 'Wahlprogramm LTW 2022', detail: 'Landtagswahl' }],
    externalUrl: 'https://sh-gruene.de',
    sources: [{ name: 'Grüne Schleswig-Holstein', count: '1 Programm' }],
    persistMessages: true,
    useSystemUserId: true,
    systemUserId: SYSTEM_USER_ID,
  },

  bayern: {
    id: 'bayern',
    title: 'Frag Grüne Bayern',
    authTitle: 'Frag Grüne Bayern',
    collectionType: 'single',
    collections: [{ id: 'bayern-system', name: 'Grüne Bayern' }],
    startPageTitle: 'Was möchtest du über die Grünen Bayern wissen?',
    placeholder: 'Stell deine Frage zum Regierungsprogramm der Grünen Bayern...',
    infoPanelDescription:
      'Durchsuchbar ist das Regierungsprogramm der Grünen Bayern zur Landtagswahl.',
    headerIcon: HiInformationCircle,
    exampleQuestions: [
      { icon: '🏔️', text: 'Was sagen die Grünen Bayern zum Naturschutz?' },
      { icon: '🌍', text: 'Welche Klimaziele hat das Regierungsprogramm?' },
      { icon: '🚆', text: 'Was steht zur Verkehrswende in Bayern?' },
    ],
    documents: [{ title: 'Regierungsprogramm LTW 2023', detail: 'Landtagswahl' }],
    externalUrl: 'https://www.gruene-bayern.de',
    sources: [{ name: 'Grüne Bayern', count: '1 Programm' }],
    persistMessages: true,
    useSystemUserId: true,
    systemUserId: SYSTEM_USER_ID,
  },
  thueringen: {
    id: 'thueringen',
    title: 'Frag Grüne Thüringen',
    authTitle: 'Frag Grüne Thüringen',
    collectionType: 'single',
    collections: [{ id: 'thueringen-system', name: 'Grüne Thüringen' }],
    startPageTitle: 'Was möchtest du über die Grünen Thüringen wissen?',
    placeholder: 'Stell deine Frage zu Beschlüssen und Positionen der Grünen Thüringen...',
    infoPanelDescription:
      'Durchsuchbar sind Beschlüsse, Wahlprogramme und Pressemitteilungen der Grünen Thüringen.',
    headerIcon: HiInformationCircle,
    exampleQuestions: [
      { icon: '🌳', text: 'Was sagen die Grünen Thüringen zum Waldschutz?' },
      { icon: '🌍', text: 'Welche Klimaziele hat das Wahlprogramm?' },
      { icon: '🏘️', text: 'Was steht zum Strukturwandel in Thüringen?' },
    ],
    documents: [
      { title: 'Wahlprogramme', detail: '5 Landtagswahlen' },
      { title: 'Beschlüsse', detail: '~90 LDK-Beschlüsse' },
      { title: 'Pressemitteilungen', detail: 'LV + Landtagsfraktion' },
    ],
    externalUrl: 'https://gruene-thueringen.de',
    sources: [{ name: 'Grüne Thüringen', count: 'Archiv' }],
    persistMessages: true,
    useSystemUserId: true,
    systemUserId: SYSTEM_USER_ID,
  },

  berlin: {
    id: 'berlin',
    title: 'Frag Grüne Berlin',
    authTitle: 'Frag Grüne Berlin',
    collectionType: 'single',
    collections: [{ id: 'berlin-system', name: 'Grüne Berlin' }],
    startPageTitle: 'Was möchtest du über die Grünen Berlin wissen?',
    placeholder: 'Stell deine Frage zu Beschlüssen und Positionen der Grünen Berlin...',
    infoPanelDescription: 'Durchsuchbar sind Pressemitteilungen und Beschlüsse der Grünen Berlin.',
    headerIcon: HiInformationCircle,
    exampleQuestions: [
      { icon: '🌍', text: 'Was sagen die Grünen Berlin zum Klimaschutz?' },
      { icon: '🚲', text: 'Welche Positionen gibt es zur Mobilitätswende?' },
      { icon: '🏙️', text: 'Was sind die Beschlüsse zur Stadtentwicklung?' },
    ],
    documents: [
      { title: 'Pressemitteilungen', detail: 'Aktuelle Positionen' },
      { title: 'Beschlüsse', detail: 'Parteitagsbeschlüsse' },
    ],
    externalUrl: 'https://gruene.berlin',
    sources: [{ name: 'Grüne Berlin', count: 'Archiv' }],
    persistMessages: true,
    useSystemUserId: true,
    systemUserId: SYSTEM_USER_ID,
  },

  mecklenburgVorpommern: {
    id: 'mecklenburgVorpommern',
    title: 'Frag Grüne Mecklenburg-Vorpommern',
    authTitle: 'Frag Grüne Mecklenburg-Vorpommern',
    collectionType: 'single',
    collections: [{ id: 'mecklenburg-vorpommern-system', name: 'Grüne Mecklenburg-Vorpommern' }],
    startPageTitle: 'Was möchtest du über die Grünen Mecklenburg-Vorpommern wissen?',
    placeholder:
      'Stell deine Frage zu Beschlüssen und Positionen der Grünen Mecklenburg-Vorpommern...',
    infoPanelDescription:
      'Durchsuchbar sind Pressemitteilungen und Parteitagsbeschlüsse der Grünen Mecklenburg-Vorpommern.',
    headerIcon: HiInformationCircle,
    exampleQuestions: [
      { icon: '🌊', text: 'Was sagen die Grünen MV zum Küstenschutz?' },
      { icon: '🌍', text: 'Welche Klimaziele haben die Grünen MV?' },
      { icon: '🏗️', text: 'Was steht zum Strukturwandel in Mecklenburg-Vorpommern?' },
    ],
    documents: [
      { title: 'Pressemitteilungen', detail: 'Aktuelle Positionen' },
      { title: 'Parteitagsbeschlüsse', detail: 'Beschlüsse' },
    ],
    externalUrl: 'https://gruene-mv.de',
    sources: [{ name: 'Grüne Mecklenburg-Vorpommern', count: 'Archiv' }],
    persistMessages: true,
    useSystemUserId: true,
    systemUserId: SYSTEM_USER_ID,
  },

  kommunalwiki: {
    id: 'kommunalwiki',
    title: 'Frag KommunalWiki',
    authTitle: 'Frag KommunalWiki',
    collectionType: 'single',
    collections: [{ id: 'kommunalwiki-system', name: 'KommunalWiki' }],
    startPageTitle: 'Was möchtest du über Kommunalpolitik wissen?',
    placeholder: 'Stell deine Frage zur Kommunalpolitik...',
    infoPanelDescription:
      'Fachwissen zur Kommunalpolitik aus dem KommunalWiki der Heinrich-Böll-Stiftung.',
    headerIcon: HiDocumentText,
    exampleQuestions: [
      { icon: '🏛️', text: 'Wie funktioniert ein Gemeinderat?' },
      { icon: '📋', text: 'Was sind die Aufgaben einer Bürgermeisterin?' },
      { icon: '💡', text: 'Wie kann man kommunale Klimapolitik gestalten?' },
    ],
    externalUrl: 'https://kommunalwiki.boell.de',
    sources: [{ name: 'KommunalWiki', count: 'Wiki' }],
    persistMessages: true,
    useSystemUserId: true,
    systemUserId: SYSTEM_USER_ID,
  },

  boellStiftung: {
    id: 'boellStiftung',
    title: 'Frag Heinrich-Böll-Stiftung',
    authTitle: 'Frag Heinrich-Böll-Stiftung',
    collectionType: 'single',
    collections: [{ id: 'boell-stiftung-system', name: 'Heinrich-Böll-Stiftung' }],
    startPageTitle: 'Was möchtest du über die Analysen der Böll-Stiftung wissen?',
    placeholder: 'Stell deine Frage zu Analysen und Dossiers...',
    infoPanelDescription:
      'Durchsuchbar sind Analysen, Dossiers und Atlanten der Heinrich-Böll-Stiftung.',
    headerIcon: HiDocumentText,
    exampleQuestions: [
      { icon: '🌍', text: 'Was sagt der Fleischatlas über Ernährung?' },
      { icon: '🔋', text: 'Welche Analysen gibt es zur Energiewende?' },
      { icon: '🌐', text: 'Was sind die Dossiers zu Digitalisierung?' },
    ],
    externalUrl: 'https://www.boell.de',
    sources: [{ name: 'Heinrich-Böll-Stiftung', count: 'Publikationen' }],
    persistMessages: true,
    useSystemUserId: true,
    systemUserId: SYSTEM_USER_ID,
  },

  gruenblog: {
    id: 'gruenblog',
    title: 'Frag Grünblog',
    authTitle: 'Frag Grünblog',
    collectionType: 'single',
    collections: [{ id: 'gruenblog-system', name: 'Grünblog' }],
    startPageTitle: 'Was möchtest du über das Onlinemagazin der Grünen wissen?',
    placeholder: 'Stell deine Frage zu Artikeln aus dem Grünblog...',
    infoPanelDescription:
      'Durchsuchbar sind die Artikel des Grünblogs – dem Onlinemagazin der Grünen.',
    headerIcon: HiDocumentText,
    exampleQuestions: [
      { icon: '🌍', text: 'Was schreibt der Grünblog zum Klimaschutz?' },
      { icon: '💡', text: 'Welche Artikel gibt es zu Demokratie?' },
      { icon: '⚡', text: 'Was steht zur Energiewende im Grünblog?' },
    ],
    externalUrl: 'https://gruenblog.com',
    sources: [{ name: 'Grünblog', count: 'Magazin' }],
    persistMessages: true,
    useSystemUserId: true,
    systemUserId: SYSTEM_USER_ID,
  },
};

export const getNotebookConfig = (configId: string): NotebookConfig => {
  return NOTEBOOK_CONFIGS[configId] || NOTEBOOK_CONFIGS.gruenerator;
};
