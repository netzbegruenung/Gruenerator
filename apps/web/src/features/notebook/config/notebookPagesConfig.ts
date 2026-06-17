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
  /** One-word label shown on the chip. */
  tag: string;
  /** Full question sent as the chat prompt when the chip is clicked. */
  text: string;
}

interface DocumentInfo {
  title: string;
  detail: string;
}

interface NotebookConfig {
  id: string;
  /**
   * URL slug under /notebooks/. `null` means the notebook lives at the bare /notebooks root
   * (the multi-source Grünerator startpage + gallery).
   */
  slug: string | null;
  title: string;
  authTitle: string;
  collectionType: 'single' | 'multi';
  collections: NotebookCollection[];
  startPageTitle: string;
  placeholder: string;
  headerIcon: IconType;
  exampleQuestions: ExampleQuestion[];
  documents?: DocumentInfo[];
  externalUrl?: string;
  persistMessages: boolean;
  useSystemUserId: boolean;
  systemUserId?: string;
}

export const NOTEBOOK_CONFIGS: Record<string, NotebookConfig> = {
  gruenerator: {
    id: 'gruenerator',
    slug: null,
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
        description: 'Pressemitteilungen, Beschlüsse und Regierungsprogramm',
        documentCount: 'Archiv',
        externalUrl: 'https://www.gruene-bayern.de',
        linkType: 'url',
        locale: 'de-DE',
      },
      {
        id: 'berlin-system',
        name: 'Grüne Berlin',
        icon: HiDocumentText,
        description: 'Wahlprogramm 2026, Pressemitteilungen und Beschlüsse',
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
      {
        id: 'brandenburg-system',
        name: 'Grüne Brandenburg',
        icon: HiDocumentText,
        description: 'Pressemitteilungen, Beschlüsse und Wahlprogramme',
        documentCount: 'Archiv',
        externalUrl: 'https://gruene-brandenburg.de',
        linkType: 'url',
        locale: 'de-DE',
      },
      {
        id: 'sachsen-anhalt-system',
        name: 'Grüne Sachsen-Anhalt',
        icon: HiDocumentText,
        description: 'Pressemitteilungen, Beschlüsse und Landtagswahlprogramm 2026',
        documentCount: 'Archiv',
        externalUrl: 'https://www.gruene-lsa.de',
        linkType: 'url',
        locale: 'de-DE',
      },
      {
        id: 'hessen-system',
        name: 'Grüne Hessen',
        icon: HiDocumentText,
        description: 'Pressemitteilungen und Beschlüsse',
        documentCount: 'Archiv',
        externalUrl: 'https://www.gruene-hessen.de',
        linkType: 'url',
        locale: 'de-DE',
      },
    ],
    startPageTitle: 'Was möchtest du wissen?',
    placeholder: 'Stell deine Frage zu grüner Politik...',
    headerIcon: HiCollection,
    exampleQuestions: [
      { icon: '🌍', tag: 'Klimaschutz', text: 'Was sagen die Grünen zum Klimaschutz?' },
      { icon: '🇪🇺', tag: 'EU', text: 'Wie ist die grüne Position zur EU?' },
      { icon: '⚡', tag: 'Energiewende', text: 'Was steht zur Energiewende in den Programmen?' },
    ],
    persistMessages: true,
    useSystemUserId: false,
  },

  gruene: {
    id: 'gruene',
    slug: 'grundsatz',
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
    headerIcon: HiInformationCircle,
    exampleQuestions: [
      { icon: '🌍', tag: 'Klimaschutz', text: 'Was steht im Grundsatzprogramm zu Klimaschutz?' },
      { icon: '🇪🇺', tag: 'EU', text: 'Wie positionieren sich die Grünen zur EU?' },
      { icon: '🏛️', tag: 'Bildung', text: 'Was sagt das Regierungsprogramm zu Bildung?' },
    ],
    documents: [
      { title: 'Grundsatzprogramm 2020', detail: '136 Seiten' },
      { title: 'EU-Wahlprogramm 2024', detail: '114 Seiten' },
      { title: 'Regierungsprogramm 2025', detail: '160 Seiten' },
    ],
    persistMessages: true,
    useSystemUserId: true,
    systemUserId: SYSTEM_USER_ID,
  },

  bundestagsfraktion: {
    id: 'bundestagsfraktion',
    slug: 'bundestagsfraktion',
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
    headerIcon: HiInformationCircle,
    exampleQuestions: [
      { icon: '🌍', tag: 'Klima', text: 'Was sind die Klimaziele der Fraktion?' },
      { icon: '📋', tag: 'Migration', text: 'Welche Positionen gibt es zur Migrationspolitik?' },
      { icon: '💶', tag: 'Haushalt', text: 'Wie positioniert sich die Fraktion zum Haushalt?' },
    ],
    documents: [
      { title: 'Fachtexte', detail: '468 Artikel' },
      { title: 'Unsere Ziele', detail: '50 Themengebiete' },
      { title: 'Einfach erklärt', detail: '24 Artikel' },
    ],
    externalUrl: 'https://www.gruene-bundestag.de',
    persistMessages: true,
    useSystemUserId: true,
    systemUserId: SYSTEM_USER_ID,
  },

  oesterreich: {
    id: 'oesterreich',
    slug: 'oesterreich',
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
    headerIcon: HiInformationCircle,
    exampleQuestions: [
      { icon: '🌍', tag: 'Klimaschutz', text: 'Was steht im Grundsatzprogramm zu Klimaschutz?' },
      { icon: '🇪🇺', tag: 'EU', text: 'Wie positionieren sich Die Grünen Österreich zur EU?' },
      { icon: '🏛️', tag: 'Wahlprogramm', text: 'Was sagt das Wahlprogramm zur Nationalratswahl?' },
    ],
    documents: [
      { title: 'Grundsatzprogramm', detail: '88 Seiten' },
      { title: 'EU-Wahlprogramm 2024', detail: '108 Seiten' },
      { title: 'Nationalratswahl-Programm', detail: '112 Seiten' },
    ],
    persistMessages: true,
    useSystemUserId: true,
    systemUserId: SYSTEM_USER_ID,
  },

  hamburg: {
    id: 'hamburg',
    slug: 'hamburg',
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
    headerIcon: HiInformationCircle,
    exampleQuestions: [
      { icon: '🌍', tag: 'Klimaschutz', text: 'Was sagen die Grünen Hamburg zum Klimaschutz?' },
      { icon: '🚲', tag: 'Mobilität', text: 'Welche Positionen gibt es zur Mobilitätswende?' },
      {
        icon: '🏙️',
        tag: 'Stadtentwicklung',
        text: 'Was sind die Beschlüsse zur Stadtentwicklung?',
      },
    ],
    documents: [
      { title: 'Beschlüsse', detail: 'Parteitagsbeschlüsse' },
      { title: 'Pressemitteilungen', detail: 'Aktuelle Positionen' },
    ],
    externalUrl: 'https://www.gruene-hamburg.de',
    persistMessages: true,
    useSystemUserId: true,
    systemUserId: SYSTEM_USER_ID,
  },

  schleswigHolstein: {
    id: 'schleswigHolstein',
    slug: 'schleswig-holstein',
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
    headerIcon: HiInformationCircle,
    exampleQuestions: [
      { icon: '🌊', tag: 'Küstenschutz', text: 'Was sagen die Grünen SH zum Küstenschutz?' },
      { icon: '🌍', tag: 'Klima', text: 'Welche Klimaziele hat das Wahlprogramm?' },
      { icon: '🚆', tag: 'Verkehr', text: 'Was steht zur Verkehrswende in Schleswig-Holstein?' },
    ],
    documents: [{ title: 'Wahlprogramm LTW 2022', detail: 'Landtagswahl' }],
    externalUrl: 'https://sh-gruene.de',
    persistMessages: true,
    useSystemUserId: true,
    systemUserId: SYSTEM_USER_ID,
  },

  bayern: {
    id: 'bayern',
    slug: 'bayern',
    title: 'Frag Grüne Bayern',
    authTitle: 'Frag Grüne Bayern',
    collectionType: 'single',
    collections: [{ id: 'bayern-system', name: 'Grüne Bayern' }],
    startPageTitle: 'Was möchtest du über die Grünen Bayern wissen?',
    placeholder: 'Stell deine Frage zum Regierungsprogramm der Grünen Bayern...',
    headerIcon: HiInformationCircle,
    exampleQuestions: [
      { icon: '🏔️', tag: 'Naturschutz', text: 'Was sagen die Grünen Bayern zum Naturschutz?' },
      { icon: '🌍', tag: 'Klima', text: 'Welche Klimaziele hat das Regierungsprogramm?' },
      { icon: '🚆', tag: 'Verkehr', text: 'Was steht zur Verkehrswende in Bayern?' },
    ],
    documents: [{ title: 'Regierungsprogramm LTW 2023', detail: 'Landtagswahl' }],
    externalUrl: 'https://www.gruene-bayern.de',
    persistMessages: true,
    useSystemUserId: true,
    systemUserId: SYSTEM_USER_ID,
  },
  thueringen: {
    id: 'thueringen',
    slug: 'thueringen',
    title: 'Frag Grüne Thüringen',
    authTitle: 'Frag Grüne Thüringen',
    collectionType: 'single',
    collections: [{ id: 'thueringen-system', name: 'Grüne Thüringen' }],
    startPageTitle: 'Was möchtest du über die Grünen Thüringen wissen?',
    placeholder: 'Stell deine Frage zu Beschlüssen und Positionen der Grünen Thüringen...',
    headerIcon: HiInformationCircle,
    exampleQuestions: [
      { icon: '🌳', tag: 'Waldschutz', text: 'Was sagen die Grünen Thüringen zum Waldschutz?' },
      { icon: '🌍', tag: 'Klima', text: 'Welche Klimaziele hat das Wahlprogramm?' },
      { icon: '🏘️', tag: 'Strukturwandel', text: 'Was steht zum Strukturwandel in Thüringen?' },
    ],
    documents: [
      { title: 'Wahlprogramme', detail: '5 Landtagswahlen' },
      { title: 'Beschlüsse', detail: '~90 LDK-Beschlüsse' },
      { title: 'Pressemitteilungen', detail: 'LV + Landtagsfraktion' },
    ],
    externalUrl: 'https://gruene-thueringen.de',
    persistMessages: true,
    useSystemUserId: true,
    systemUserId: SYSTEM_USER_ID,
  },

  berlin: {
    id: 'berlin',
    slug: 'berlin',
    title: 'Frag Grüne Berlin',
    authTitle: 'Frag Grüne Berlin',
    collectionType: 'single',
    collections: [{ id: 'berlin-system', name: 'Grüne Berlin' }],
    startPageTitle: 'Was möchtest du über die Grünen Berlin wissen?',
    placeholder: 'Stell deine Frage zu Beschlüssen und Positionen der Grünen Berlin...',
    headerIcon: HiInformationCircle,
    exampleQuestions: [
      { icon: '🌍', tag: 'Klimaschutz', text: 'Was sagen die Grünen Berlin zum Klimaschutz?' },
      { icon: '🚲', tag: 'Mobilität', text: 'Welche Positionen gibt es zur Mobilitätswende?' },
      {
        icon: '📋',
        tag: 'Stadtentwicklung',
        text: 'Was steht im Wahlprogramm zur Stadtentwicklung?',
      },
    ],
    documents: [
      { title: 'Wahlprogramm 2026', detail: '6 Kapitel' },
      { title: 'Pressemitteilungen', detail: 'Aktuelle Positionen' },
      { title: 'Beschlüsse', detail: 'Parteitagsbeschlüsse' },
    ],
    externalUrl: 'https://gruene.berlin',
    persistMessages: true,
    useSystemUserId: true,
    systemUserId: SYSTEM_USER_ID,
  },

  mecklenburgVorpommern: {
    id: 'mecklenburgVorpommern',
    slug: 'mecklenburg-vorpommern',
    title: 'Frag Grüne Mecklenburg-Vorpommern',
    authTitle: 'Frag Grüne Mecklenburg-Vorpommern',
    collectionType: 'single',
    collections: [{ id: 'mecklenburg-vorpommern-system', name: 'Grüne Mecklenburg-Vorpommern' }],
    startPageTitle: 'Was möchtest du über die Grünen Mecklenburg-Vorpommern wissen?',
    placeholder:
      'Stell deine Frage zu Beschlüssen und Positionen der Grünen Mecklenburg-Vorpommern...',
    headerIcon: HiInformationCircle,
    exampleQuestions: [
      { icon: '🌊', tag: 'Küstenschutz', text: 'Was sagen die Grünen MV zum Küstenschutz?' },
      { icon: '🌍', tag: 'Klima', text: 'Welche Klimaziele haben die Grünen MV?' },
      {
        icon: '🏗️',
        tag: 'Strukturwandel',
        text: 'Was steht zum Strukturwandel in Mecklenburg-Vorpommern?',
      },
    ],
    documents: [
      { title: 'Pressemitteilungen', detail: 'Aktuelle Positionen' },
      { title: 'Parteitagsbeschlüsse', detail: 'Beschlüsse' },
    ],
    externalUrl: 'https://gruene-mv.de',
    persistMessages: true,
    useSystemUserId: true,
    systemUserId: SYSTEM_USER_ID,
  },

  brandenburg: {
    id: 'brandenburg',
    slug: 'brandenburg',
    title: 'Frag Grüne Brandenburg',
    authTitle: 'Frag Grüne Brandenburg',
    collectionType: 'single',
    collections: [{ id: 'brandenburg-system', name: 'Grüne Brandenburg' }],
    startPageTitle: 'Was möchtest du über die Grünen Brandenburg wissen?',
    placeholder: 'Stell deine Frage zu Beschlüssen und Positionen der Grünen Brandenburg...',
    headerIcon: HiInformationCircle,
    exampleQuestions: [
      { icon: '🌍', tag: 'Klimaschutz', text: 'Was sagen die Grünen Brandenburg zum Klimaschutz?' },
      {
        icon: '🏗️',
        tag: 'Lausitz',
        text: 'Welche Beschlüsse gibt es zur Strukturpolitik in der Lausitz?',
      },
      { icon: '🚆', tag: 'Verkehr', text: 'Was steht im Wahlprogramm zur Verkehrswende?' },
    ],
    documents: [
      { title: 'Pressemitteilungen', detail: 'Aktuelle und archivierte PMs' },
      { title: 'Beschlüsse', detail: 'Parteitagsbeschlüsse' },
      { title: 'Landtagswahlprogramm 2024', detail: 'Wahlprogramm zur Landtagswahl' },
    ],
    externalUrl: 'https://gruene-brandenburg.de',
    persistMessages: true,
    useSystemUserId: true,
    systemUserId: SYSTEM_USER_ID,
  },

  'sachsen-anhalt': {
    id: 'sachsen-anhalt',
    slug: 'sachsen-anhalt',
    title: 'Frag Grüne Sachsen-Anhalt',
    authTitle: 'Frag Grüne Sachsen-Anhalt',
    collectionType: 'single',
    collections: [{ id: 'sachsen-anhalt-system', name: 'Grüne Sachsen-Anhalt' }],
    startPageTitle: 'Was möchtest du über die Grünen Sachsen-Anhalt wissen?',
    placeholder:
      'Stell deine Frage zum Wahlprogramm und zu Positionen der Grünen Sachsen-Anhalt...',
    headerIcon: HiInformationCircle,
    exampleQuestions: [
      {
        icon: '🌍',
        tag: 'Klimaschutz',
        text: 'Was sagen die Grünen Sachsen-Anhalt zum Klimaschutz?',
      },
      { icon: '🗳️', tag: 'Wahlprogramm', text: 'Was steht im Wahlprogramm zur Landtagswahl 2026?' },
      { icon: '🚆', tag: 'Verkehr', text: 'Welche Positionen gibt es zur Verkehrswende?' },
    ],
    documents: [
      { title: 'Pressemitteilungen', detail: 'Landesverband & Fraktion' },
      { title: 'Beschlüsse', detail: 'Parteitagsbeschlüsse' },
      { title: 'Landtagswahlprogramm 2026', detail: 'Wahlprogramm zur Landtagswahl' },
    ],
    externalUrl: 'https://www.gruene-lsa.de',
    persistMessages: true,
    useSystemUserId: true,
    systemUserId: SYSTEM_USER_ID,
  },
  hessen: {
    id: 'hessen',
    slug: 'hessen',
    title: 'Frag Grüne Hessen',
    authTitle: 'Frag Grüne Hessen',
    collectionType: 'single',
    collections: [{ id: 'hessen-system', name: 'Grüne Hessen' }],
    startPageTitle: 'Was möchtest du über die Grünen Hessen wissen?',
    placeholder: 'Stell deine Frage zu Positionen und Beschlüssen der Grünen Hessen...',
    headerIcon: HiInformationCircle,
    exampleQuestions: [
      { icon: '🌍', tag: 'Klimaschutz', text: 'Was sagen die Grünen Hessen zum Klimaschutz?' },
      {
        icon: '🚆',
        tag: 'Verkehr',
        text: 'Welche Positionen gibt es zur Verkehrswende im Rhein-Main-Gebiet?',
      },
      {
        icon: '🏙️',
        tag: 'Wohnen',
        text: 'Was fordern die Grünen zu bezahlbarem Wohnen in Frankfurt?',
      },
    ],
    documents: [
      { title: 'Pressemitteilungen', detail: 'Landesverband & Fraktion' },
      { title: 'Beschlüsse', detail: 'Parteitagsbeschlüsse' },
    ],
    externalUrl: 'https://www.gruene-hessen.de',
    persistMessages: true,
    useSystemUserId: true,
    systemUserId: SYSTEM_USER_ID,
  },

  kommunalwiki: {
    id: 'kommunalwiki',
    slug: 'kommunalwiki',
    title: 'Frag KommunalWiki',
    authTitle: 'Frag KommunalWiki',
    collectionType: 'single',
    collections: [{ id: 'kommunalwiki-system', name: 'KommunalWiki' }],
    startPageTitle: 'Was möchtest du über Kommunalpolitik wissen?',
    placeholder: 'Stell deine Frage zur Kommunalpolitik...',
    headerIcon: HiDocumentText,
    exampleQuestions: [
      { icon: '🏛️', tag: 'Gemeinderat', text: 'Wie funktioniert ein Gemeinderat?' },
      { icon: '📋', tag: 'Bürgermeister', text: 'Was sind die Aufgaben einer Bürgermeisterin?' },
      { icon: '💡', tag: 'Klimapolitik', text: 'Wie kann man kommunale Klimapolitik gestalten?' },
    ],
    externalUrl: 'https://kommunalwiki.boell.de',
    persistMessages: true,
    useSystemUserId: true,
    systemUserId: SYSTEM_USER_ID,
  },

  boellStiftung: {
    id: 'boellStiftung',
    slug: 'boell-stiftung',
    title: 'Frag Heinrich-Böll-Stiftung',
    authTitle: 'Frag Heinrich-Böll-Stiftung',
    collectionType: 'single',
    collections: [{ id: 'boell-stiftung-system', name: 'Heinrich-Böll-Stiftung' }],
    startPageTitle: 'Was möchtest du über die Analysen der Böll-Stiftung wissen?',
    placeholder: 'Stell deine Frage zu Analysen und Dossiers...',
    headerIcon: HiDocumentText,
    exampleQuestions: [
      { icon: '🌍', tag: 'Ernährung', text: 'Was sagt der Fleischatlas über Ernährung?' },
      { icon: '🔋', tag: 'Energiewende', text: 'Welche Analysen gibt es zur Energiewende?' },
      { icon: '🌐', tag: 'Digitalisierung', text: 'Was sind die Dossiers zu Digitalisierung?' },
    ],
    externalUrl: 'https://www.boell.de',
    persistMessages: true,
    useSystemUserId: true,
    systemUserId: SYSTEM_USER_ID,
  },

  gruenblog: {
    id: 'gruenblog',
    slug: 'gruenblog',
    title: 'Frag Grünblog',
    authTitle: 'Frag Grünblog',
    collectionType: 'single',
    collections: [{ id: 'gruenblog-system', name: 'Grünblog' }],
    startPageTitle: 'Was möchtest du über das Onlinemagazin der Grünen wissen?',
    placeholder: 'Stell deine Frage zu Artikeln aus dem Grünblog...',
    headerIcon: HiDocumentText,
    exampleQuestions: [
      { icon: '🌍', tag: 'Klimaschutz', text: 'Was schreibt der Grünblog zum Klimaschutz?' },
      { icon: '💡', tag: 'Demokratie', text: 'Welche Artikel gibt es zu Demokratie?' },
      { icon: '⚡', tag: 'Energiewende', text: 'Was steht zur Energiewende im Grünblog?' },
    ],
    externalUrl: 'https://gruenblog.com',
    persistMessages: true,
    useSystemUserId: true,
    systemUserId: SYSTEM_USER_ID,
  },
};

export const getNotebookConfig = (configId: string): NotebookConfig => {
  return NOTEBOOK_CONFIGS[configId] || NOTEBOOK_CONFIGS.gruenerator;
};

export const getNotebookConfigBySlug = (slug: string): NotebookConfig | undefined => {
  return Object.values(NOTEBOOK_CONFIGS).find((c) => c.slug === slug);
};

export const getNotebookPath = (config: { slug: string | null }): string => {
  return config.slug === null ? '/notebooks' : `/notebooks/${config.slug}`;
};

export type { NotebookConfig };
