export const TRANSFER_AGENTS = [
  'gruenerator-leichte-sprache',
  'gruenerator-einfache-sprache',
] as const;
export type TransferAgent = (typeof TRANSFER_AGENTS)[number];

const LS = 'gruenerator-leichte-sprache';
const ES = 'gruenerator-einfache-sprache';

export const TRANSFER_CASES = [
  {
    id: 'mdl-radvorrangnetz-ls',
    agent: LS,
    fixture: 'mdl-radvorrangnetz.txt',
    sourceUrl:
      'https://martinmetz.de/landesweites-radvorrangnetz-10-500-kilometer-fuer-den-alltagsradverkehr-in-nrw',
    fetchedAt: '2026-10-19',
    note: 'MdL-Blog, viele Zahlen (10.500 km), Seitennavigation im Text',
  },
  {
    id: 'mdl-radvorrangnetz-es',
    agent: ES,
    fixture: 'mdl-radvorrangnetz.txt',
    sourceUrl:
      'https://martinmetz.de/landesweites-radvorrangnetz-10-500-kilometer-fuer-den-alltagsradverkehr-in-nrw',
    fetchedAt: '2026-10-19',
    note: 'wie oben, Einfache Sprache',
  },
  {
    id: 'mdl-radschnell-ls',
    agent: LS,
    fixture: 'mdl-radschnellverbindungen.txt',
    sourceUrl: 'https://martinmetz.de/nrw-schafft-erstmals-bedarfsplan-fuer-radschnellverbindungen',
    fetchedAt: '2026-10-19',
    note: 'MdL-Blog, Fachbegriffe (Bedarfsplan, Radschnellverbindung)',
  },
  {
    id: 'bund-sozialstaat-ls',
    agent: LS,
    fixture: 'bund-sozialstaat.txt',
    sourceUrl: 'https://www.gruene.de/artikel/sozialstaat-verteidigen/',
    fetchedAt: '2026-10-19',
    note: 'Bundespartei, politischer Text mit Abstrakta',
  },
  {
    id: 'bund-sozialstaat-es',
    agent: ES,
    fixture: 'bund-sozialstaat.txt',
    sourceUrl: 'https://www.gruene.de/artikel/sozialstaat-verteidigen/',
    fetchedAt: '2026-10-19',
    note: 'wie oben, Einfache Sprache',
  },
  {
    id: 'bund-klimaschutz-ls',
    agent: LS,
    fixture: 'bund-klimaschutz-kabinettsklausur.txt',
    sourceUrl:
      'https://www.gruene.de/artikel/kabinettsklausur-es-braucht-180-grad-wende-beim-klimaschutz/',
    fetchedAt: '2026-10-19',
    note: 'Bundespartei, Pressemitteilung, kurz',
  },
  {
    id: 'bund-klimaschutz-es',
    agent: ES,
    fixture: 'bund-klimaschutz-kabinettsklausur.txt',
    sourceUrl:
      'https://www.gruene.de/artikel/kabinettsklausur-es-braucht-180-grad-wende-beim-klimaschutz/',
    fetchedAt: '2026-10-19',
    note: 'wie oben, Einfache Sprache',
  },
  {
    id: 'at-stvo-ls',
    agent: LS,
    fixture: 'at-stvo-novelle.txt',
    sourceUrl: 'https://gruene.at/news/stvo-novelle/',
    fetchedAt: '2026-10-19',
    note: 'Österreich, Austriazismen und Fachbegriffe (StVO)',
  },
  {
    id: 'at-stvo-es',
    agent: ES,
    fixture: 'at-stvo-novelle.txt',
    sourceUrl: 'https://gruene.at/news/stvo-novelle/',
    fetchedAt: '2026-10-19',
    note: 'wie oben, Einfache Sprache',
  },
  {
    id: 'at-armut-ls',
    agent: LS,
    fixture: 'at-armut.txt',
    sourceUrl: 'https://gruene.at/news/armut-bekaempfen-heisst-zusammenhalt-staerken/',
    fetchedAt: '2026-10-19',
    note: 'Österreich, sehr kurz, überwiegend Seitennavigation',
  },
  {
    id: 'lang-geschichte-ls',
    agent: LS,
    fixture: 'lang-gruene-geschichte.txt',
    sourceUrl: 'https://www.gruene.de/unsere-gruene-geschichte',
    fetchedAt: '2026-10-19',
    note: 'über 25.000 Zeichen (ca. 96.000): abschnittsweise Übertragung. Kein Beschluss, aber längste öffentliche Seite',
  },
] as const satisfies readonly {
  id: string;
  agent: TransferAgent;
  fixture: string;
  sourceUrl: string;
  fetchedAt: string;
  note: string;
}[];

export type TransferCase = (typeof TRANSFER_CASES)[number];
export type TransferCaseId = TransferCase['id'];
