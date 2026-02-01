import { HiDocumentText, HiInformationCircle, HiCollection } from 'react-icons/hi';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

export const NOTEBOOK_CONFIGS = {
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
    title: 'Frag Bündnis 90/Die Grünen',
    authTitle: 'Frag Bündnis 90/Die Grünen',
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
};

export const getNotebookConfig = (configId) => {
  return NOTEBOOK_CONFIGS[configId] || NOTEBOOK_CONFIGS.gruenerator;
};
