import { type MyOpenCard } from '../boards/myOpenCards.js';

export type BriefingLocale = 'de-DE' | 'de-AT';

/** Eine Zeile des geteilten Lagebilds. `url` stammt immer aus der Eingabe. */
export interface LagebildItem {
  kind: 'partei' | 'welt';
  /** Monitor-Thema der Quelle (z. B. `klima`), bei Partei-Zeilen null. */
  topic: string | null;
  text: string;
  url: string;
  source: string;
}

export interface Lagebild {
  locale: 'de' | 'at';
  generatedAt: string;
  items: LagebildItem[];
}

export interface LvNewsItem {
  title: string;
  url: string;
  sourceName: string;
  /** `YYYY-MM-DD` */
  day: string;
}

/** Eigene Arbeit der letzten Tage — Grundlage für die Idee. */
export interface RecentWorkItem {
  /** Stabile Kurz-Id für `basedOn` (`c1`, `d1` …). */
  ref: string;
  kind: 'chat' | 'document';
  title: string;
  /** Tags eines Chats bzw. Untertyp eines Dokuments. */
  detail: string | null;
  /** `YYYY-MM-DD` (Berlin) */
  day: string;
}

export interface BriefingInputs {
  userId: string;
  firstName: string | null;
  locale: BriefingLocale;
  /** „Dein Kontext"-Zeile aus der ersten Rolle, oder null. */
  roleLine: string | null;
  /** Ebene der ersten Rolle (`bund`, `land`, `kreisverband` …), oder null. */
  ebene: string | null;
  cards: MyOpenCard[];
  lagebild: Lagebild | null;
  /** Anzeigename des LV (z. B. „Bayern"), nur bei LGS-Rolle. */
  lvName: string | null;
  lvNews: LvNewsItem[];
  /** Neueste Artikel der Bundespartei (gruene.de bzw. gruene.at), für alle. */
  partyNews: LvNewsItem[];
  recent: RecentWorkItem[];
}

/** Was das Modell persönlich beisteuert. */
export interface PersonalLines {
  intro: string;
  /** Überleitung vor der Aufgabenliste, oder null. */
  tasksLead: string | null;
  /** Überleitung vor dem Lagebild, oder null. */
  newsLead: string | null;
  /** Rückblick auf die eigene Arbeit, oder null. */
  recap: string | null;
  /** Überleitung zu den Vorschlägen, oder null. */
  ideasLead: string | null;
  /** 2–4 Vorschläge, wie es weitergehen kann (Satzfortsetzungen). */
  ideas: string[];
  basedOn: string | null;
  suggestions: string[];
}
