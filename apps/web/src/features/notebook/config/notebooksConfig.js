const PRODUCTION_NOTEBOOKS = [
  {
    id: 'gruenerator-notebook',
    path: '/gruenerator-notebook',
    title: 'Frag Grünerator',
    description: 'Durchsucht automatisch mehrere Quellen parallel und kombiniert die Ergebnisse.',
    meta: 'Mehrere Quellen',
    tags: ['Multi-Suche', 'Empfohlen'],
    order: 0,
  },
  {
    id: 'gruene-notebook',
    path: '/gruene-notebook',
    title: 'Frag Bündnis 90/Die Grünen',
    description: 'Durchsuchbar sind die offiziellen Grundsatzprogramme von Bündnis 90/Die Grünen.',
    meta: '3 Programme',
    tags: ['Grundsatzprogramm', 'EU-Wahl', 'Regierung'],
    order: 1,
  },
  {
    id: 'bundestagsfraktion-notebook',
    path: '/gruene-bundestag',
    title: 'Frag die Bundestagsfraktion',
    description:
      'Durchsuchbar sind die offiziellen Inhalte von gruene-bundestag.de – Fachtexte, politische Ziele und einfache Erklärungen.',
    meta: '542 Artikel',
    tags: ['Fachtexte', 'Ziele', 'Einfach erklärt'],
    order: 2,
  },
  {
    id: 'oesterreich-notebook',
    path: '/gruene-oesterreich',
    title: 'Frag Die Grünen Österreich',
    description:
      'Durchsuchbar sind die offiziellen Programme von Die Grünen – Die Grüne Alternative Österreich.',
    meta: '3 Programme',
    tags: ['Österreich', 'Grundsatzprogramm', 'Nationalrat'],
    order: 3,
  },
];

const DEV_ONLY_NOTEBOOKS = [
  {
    id: 'hamburg-notebook',
    path: '/gruene-hamburg',
    title: 'Frag Grüne Hamburg',
    description: 'Durchsuchbar sind Beschlüsse und Pressemitteilungen der Grünen Hamburg.',
    meta: 'Archiv',
    tags: ['Hamburg', 'Beschlüsse', 'Presse'],
    order: 4,
  },
  {
    id: 'schleswig-holstein-notebook',
    path: '/gruene-schleswig-holstein',
    title: 'Frag Grüne Schleswig-Holstein',
    description:
      'Durchsuchbar ist das Wahlprogramm der Grünen Schleswig-Holstein zur Landtagswahl.',
    meta: '1 Programm',
    tags: ['Schleswig-Holstein', 'Wahlprogramm'],
    order: 5,
  },
];

export const SYSTEM_NOTEBOOKS = [
  ...PRODUCTION_NOTEBOOKS,
  ...(import.meta.env.DEV ? DEV_ONLY_NOTEBOOKS : []),
];

export const getOrderedNotebooks = () => [...SYSTEM_NOTEBOOKS].sort((a, b) => a.order - b.order);

export const getNotebookById = (id) => SYSTEM_NOTEBOOKS.find((nb) => nb.id === id);

export const getNotebookByPath = (path) => SYSTEM_NOTEBOOKS.find((nb) => nb.path === path);
