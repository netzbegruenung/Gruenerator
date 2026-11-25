/**
 * Which Bundesland a monitor article belongs to — decided once, at ingest,
 * and stored in `monitor_articles.lands`.
 *
 * Two signals, measured on 25.11.2026 against every press source:
 * - A Landes-Rubrik (a feed whose every item is about one Land) attributes by
 *   source. Only real Land sections qualify: `merkur.de/welt`, `hna.de/welt`
 *   and `fr.de` are world feeds despite their regional publishers.
 * - Place names in the title: the Land and its adjective, the ~20 largest
 *   cities, the head of government. The excerpt only counts with the Land name
 *   itself — an Event Registry body names Frankfurt in plenty of national stories.
 *
 * Cities that are also common words („Essen", „Siegen", „Gießen") only count
 * after a place preposition („in Essen", „aus Gießen") or as their adjective
 * („Essener"); bare, „Gesundes Essen für Kitas" would land in NRW.
 *
 * Sport is tagged like everything else and filtered when reading
 * (`isSport`): it is about the Land, just not briefing material.
 */
import { LANDESVERBAENDE } from '@gruenerator/shared/agents';

import type { MonitorLand, MonitorLocale } from './types.js';

const LETTER = 'A-Za-zÄÖÜäöüß';
const BEFORE = `(?<![${LETTER}-])`;
const AFTER = `(?![${LETTER}-])`;
const PLACE_PREPOSITION = '(?<=\\b(?:[Ii]n|[Aa]us|[Nn]ach|[Bb]ei|[Vv]on|[Uu]m|[Ff]ür) )';

/**
 * One regex for a Land's headline signals. A hyphen counts as part of the
 * word, so „Sachsen" never matches inside „Sachsen-Anhalt". A word-like city
 * also counts as the dateline that opens a headline („Essen: …").
 */
function headlinePattern(places: readonly string[], wordLike: readonly string[]): RegExp {
  const plain = `${BEFORE}(?:${places.join('|')})${AFTER}`;
  if (wordLike.length === 0) return new RegExp(plain);
  const cities = `(?:${wordLike.join('|')})`;
  return new RegExp(`${plain}|${PLACE_PREPOSITION}${cities}${AFTER}|^${cities}(?=:)`);
}

interface LandConfig {
  locale: MonitorLocale;
  /** Land name and its adjective forms — the only words trusted in an excerpt. */
  core: readonly string[];
  /** Cities, regions and people that mark the Land in a headline. */
  places: readonly string[];
  /** Cities that are also common words; they count only after a place preposition. */
  wordLike: readonly string[];
  /** Keys of `KNOWN_RSS_FEEDS` / `KNOWN_NEWS_SITEMAPS` that only carry this Land. */
  rubriken: readonly string[];
  /** Nouns that name the Land itself; dropped from its keyword cloud. */
  selfNouns: readonly string[];
  /** Qdrant collection of the Landtag notebook, where one is kept current. */
  landtagCollection: string | null;
}

const LAENDER = {
  hessen: {
    locale: 'de',
    core: ['Hessen', 'hessisch\\w*', 'Hessische\\w*'],
    places: [
      'Frankfurt(?! \\(Oder\\)| an der Oder| \\(O\\.\\))',
      'Frankfurter\\w*',
      'Wiesbaden',
      'Wiesbadener\\w*',
      'Kassel',
      'Kasseler\\w*',
      'Darmstadt',
      'Darmstädter\\w*',
      'Offenbach',
      'Offenbacher\\w*',
      'Hanau',
      'Gießener\\w*',
      'Marburg',
      'Marburger\\w*',
      'Fulda',
      'Fuldaer\\w*',
      'Rüsselsheim',
      'Bad Homburg',
      'Wetzlar',
      'Rodgau',
      'Oberursel',
      'Dreieich',
      'Bensheim',
      'Hofheim',
      'Maintal',
      'Neu-Isenburg',
      'Bad Hersfeld',
      'Rhein-Main',
      'Rheingau',
      'Wetterau',
      'Odenwald',
      'Vogelsberg',
    ],
    wordLike: ['Gießen', 'Langen'],
    rubriken: ['hessenschau.de', 'hna.de/hessen', 'fr.de/rhein-main'],
    selfNouns: ['hessen', 'frankfurt'],
    landtagCollection: null,
  },
  'nordrhein-westfalen': {
    locale: 'de',
    core: ['Nordrhein-Westfalen', 'NRW', 'NRW-\\w+', 'nordrhein-westfälisch\\w*'],
    places: [
      'Köln',
      'Kölner\\w*',
      'Düsseldorf',
      'Düsseldorfer\\w*',
      'Dortmund',
      'Dortmunder\\w*',
      'Essener\\w*',
      'Duisburg',
      'Duisburger\\w*',
      'Bochum',
      'Bochumer\\w*',
      'Wuppertal',
      'Wuppertaler\\w*',
      'Bielefeld',
      'Bielefelder\\w*',
      'Bonn',
      'Bonner\\w*',
      'Münsteraner\\w*',
      'Mönchengladbach',
      'Gelsenkirchen',
      'Aachen',
      'Aachener\\w*',
      'Krefeld',
      'Oberhausen',
      'Herne',
      'Mülheim an der Ruhr',
      'Solingen',
      'Leverkusen',
      'Paderborn',
      'Recklinghausen',
      'Bottrop',
      'Remscheid',
      'Bergisch Gladbach',
      'Gütersloh',
      'Neuss',
      'Siegener\\w*',
      'Ruhrgebiet',
      'Sauerland',
      'Münsterland',
      'Rheinland',
      'Ostwestfalen',
      'Wüst',
    ],
    // „Münster" also names cathedrals („Freiburger Münster"), „Hagen" people („Nina Hagen").
    wordLike: ['Essen', 'Siegen', 'Hamm', 'Münster', 'Hagen'],
    rubriken: ['wdr.de', 'ksta.de', 'rp-online.de'],
    selfNouns: ['nrw', 'nordrhein-westfalen', 'köln', 'düsseldorf'],
    landtagCollection: 'landtag_nrw_documents',
  },
  steiermark: {
    locale: 'at',
    core: ['Steiermark', 'steirisch\\w*', 'Steirer\\w*'],
    places: [
      'Graz',
      'Grazer\\w*',
      'Leoben',
      'Kapfenberg',
      'Bruck an der Mur',
      'Feldbach',
      'Leibnitz',
      'Weiz',
      'Knittelfeld',
      'Judenburg',
      'Köflach',
      'Voitsberg',
      'Gleisdorf',
      'Hartberg',
      'Deutschlandsberg',
      'Fürstenfeld',
      'Mürzzuschlag',
      'Liezen',
      'Trofaiach',
      'Schladming',
      'Bad Aussee',
      'Murtal',
      'Kunasek',
    ],
    wordLike: [],
    rubriken: ['kleinezeitung.at/steiermark'],
    selfNouns: ['steiermark', 'graz'],
    landtagCollection: null,
  },
} as const satisfies Record<MonitorLand, LandConfig>;

export const MONITOR_LAENDER = Object.keys(LAENDER) as MonitorLand[];

const MATCHERS = MONITOR_LAENDER.map((land) => {
  const config: LandConfig = LAENDER[land];
  return {
    land,
    title: headlinePattern([...config.core, ...config.places], config.wordLike),
    excerpt: new RegExp(`${BEFORE}(?:${config.core.join('|')})${AFTER}`),
    rubriken: new Set(config.rubriken),
  };
});

/**
 * The Länder an article belongs to. `feedKey` is the `rssFeeds.ts` key the
 * item came from, or null for sources without one (Event Registry, Bluesky).
 */
export function landsOf(
  item: { title: string; excerpt: string },
  feedKey: string | null
): MonitorLand[] {
  return MATCHERS.filter(
    (m) =>
      (feedKey !== null && m.rubriken.has(feedKey)) ||
      m.title.test(item.title) ||
      m.excerpt.test(item.excerpt)
  ).map((m) => m.land);
}

const SPORT =
  /Bundesliga|Champions League|Europa League|Conference League|Eintracht|BVB|Borussia|Schalke|1\. FC|FC Köln|Fortuna|VfL|VfB|Bayer 04|Sturm Graz|GAK|Kapfenberger SV|Trainer|Torwart|Handball|Eishockey|Basketball|Volleyball|Skispringen|Weltcup|Slalom|Formel 1|Tennis|Liveticker|\b\d+:\d+\b|Derby|Spieltag|Stürmer/;

/** Sport headlines are tagged but left out of the Land briefing. */
export function isSport(title: string): boolean {
  return SPORT.test(title);
}

export function landLocale(land: MonitorLand): MonitorLocale {
  return LAENDER[land].locale;
}

export function landSelfNouns(land: MonitorLand): readonly string[] {
  return LAENDER[land].selfNouns;
}

export function landtagCollectionOf(land: MonitorLand): string | null {
  return LAENDER[land].landtagCollection;
}

/**
 * Landesverband short codes (party + Landtag faction) for the Land, from
 * `LANDESVERBAENDE`; null where the Land has no Landesverband notebook with
 * dated posts (Austria's collection holds programmes only).
 */
export function landesverbandCodesOf(land: MonitorLand): string[] | null {
  if (landLocale(land) !== 'de') return null;
  const entry = LANDESVERBAENDE.find((lv) => lv.id === land);
  if (!entry) return null;
  return typeof entry.codes === 'string' ? [entry.codes] : [...entry.codes];
}
