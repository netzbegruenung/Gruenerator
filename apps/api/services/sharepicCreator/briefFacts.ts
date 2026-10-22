/**
 * The brief is a quote when it says "Zitat" and carries a quoted passage.
 * Straight quotes must open after whitespace, so a revision's JSON
 * (`"text":"…"`) does not count.
 */
const QUOTED_PASSAGE = /„[^“”"]{8,}[“”"]|»[^«]{8,}«|(?:^|\s)"[^"]{8,}"/;
export function isQuoteBrief(given: string): boolean {
  return /\bZitat\b/.test(given) && QUOTED_PASSAGE.test(given);
}

/**
 * A speaker counts as named only where a name stands: the capitalised pair
 * directly before the colon / quote ("Sabine Moser: „…“") or after "von"
 * ("Zitat von Lena Hoffmann"). Capitalised nouns elsewhere ("Neues Sharepic
 * mit Zitat", "Grünen Woche") are no speaker. Conservative on purpose: a miss
 * only drops the extra guard, a false hit would demand a name that is not there.
 */
const NAME_PAIR = '\\p{Lu}[\\p{L}-]+\\s+\\p{Lu}[\\p{L}-]+';
const SPEAKER_BEFORE_QUOTE = new RegExp(
  `(?:^|[\\s,])(?:(\\p{Ll}+)\\s+)?(${NAME_PAIR})(?:\\s*\\([^)]*\\))?\\s*:\\s*$`,
  'u'
);
/** "…“, sagt Sabine Moser", "…“ – Sabine Moser" */
const SPEAKER_AFTER_QUOTE = new RegExp(
  `^[\\s,.]*(?:(?:sagt|sagte|meint|betont|so|–|—)\\s+(${NAME_PAIR})|\\(\\s*(${NAME_PAIR})\\s*\\))`,
  'u'
);
const SPEAKER_AFTER_VON = new RegExp(`\\bvon\\s+(${NAME_PAIR})`, 'u');
/** "zur Grünen Woche:" — a noun phrase behind a preposition or article, not a person. */
const NOT_A_NAME_INTRO =
  /^(?:zu[rm]?|der|des|die|den|dem|im|in|bei|mit|für|auf|am|aus|nach|vom|ins|über|um|zum)$/;
/** A pair opening with an article or determiner ("Die Grünen", "Unsere Partei") is no person. */
const ARTICLE_FIRST = /^(?:die|der|das|den|dem|des|unsere|unser|alle)\s/i;
/** Second word of an event or thing ("Grüne Woche", "Klimagipfel", "Landtagswahl"), not a surname. */
const THING_SUFFIX = /(?:woche|tage?|wahl|konferenz|gipfel|markt|fest|partei|grünen)$/i;
/** "Grüne Wien", "Bündnis Grüne", "(Foto Archiv)": a party or a production note, whichever word it stands in. */
const PARTY_WORD = /^(?:grüne[nrs]?|bündnis|format|foto|bild|quelle|archiv|video|grafik)$/i;
function isPerson(pair: string): boolean {
  const words = pair.split(/\s+/);
  return (
    !ARTICLE_FIRST.test(pair) && !words.some((w) => THING_SUFFIX.test(w) || PARTY_WORD.test(w))
  );
}
export function namesSpeaker(given: string): boolean {
  const quoted = QUOTED_PASSAGE.exec(given);
  const quote = quoted ? quoted.index : -1;
  const before = (quote === -1 ? given : given.slice(0, quote)).replace(/\bZitat\b/g, ' ');
  if (quoted) {
    const after = SPEAKER_AFTER_QUOTE.exec(given.slice(quote + quoted[0].length));
    const pair = after ? (after[1] ?? after[2]) : '';
    if (pair && isPerson(pair)) return true;
  }
  const match = SPEAKER_BEFORE_QUOTE.exec(before.trimEnd());
  if (match && isPerson(match[2]) && !(match[1] && NOT_A_NAME_INTRO.test(match[1]))) return true;
  const von = SPEAKER_AFTER_VON.exec(before);
  return von !== null && isPerson(von[1]);
}

/** Words that say nothing about which medium a quote came from. */
const GENERIC_SOURCE_WORDS = new Set([
  'Interview',
  'Im',
  'In',
  'Mit',
  'Der',
  'Die',
  'Dem',
  'Das',
  'Auf',
]);

/** `quelle` may only name a medium the brief names — an invented one is a false attribution. */
export function sourceInBrief(quelle: string, given: string): boolean {
  const outside = given.replace(new RegExp(QUOTED_PASSAGE, 'g'), ' ');
  const words = quelle.match(/\p{Lu}[\p{L}]*/gu) ?? [];
  return words.some((w) => w.length >= 2 && !GENERIC_SOURCE_WORDS.has(w) && outside.includes(w));
}

/**
 * Lowercased words without marks, quotes, punctuation and `[…]`/`…` cuts, so a
 * shortened or re-marked quote still matches the brief word by word (order is
 * not checked).
 */
export function wordsOf(value: string): string[] {
  return value
    .replace(/\[(?:…|\.{3})\]|…/g, ' ')
    .replace(/\\[nrt]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .toLowerCase()
    .split(' ')
    .filter(Boolean);
}

/**
 * A fact check's correction may be reworded, not invented: most of its
 * content words (four letters and up, matched on their first five so
 * „Regionalbusse“ finds „Regionalbussen“) must stand in the brief.
 */
const FOUNDED_SHARE = 0.6;
export function foundedInBrief(fakt: string, givenWords: string[]): boolean {
  const stem = (w: string) => w.slice(0, 5);
  const stems = new Set(givenWords.map(stem));
  const content = wordsOf(fakt).filter((w) => w.length >= 4);
  if (!content.length) return true;
  return content.filter((w) => stems.has(stem(w))).length >= content.length * FOUNDED_SHARE;
}

/** Every name token of 2+ letters ("S. Moser" → Moser) must stand in the brief as a whole word. */
export function nameInBrief(name: string, givenWords: Set<string>): boolean {
  const tokens = wordsOf(name).filter((w) => w.length >= 2);
  return tokens.length > 0 && tokens.every((w) => givenWords.has(w));
}

/** A label word stands in the brief, as is or inflected („zufrieden" → „Zufriedene"). */
export function wordInBrief(word: string, givenWords: Set<string>): boolean {
  if (givenWords.has(word)) return true;
  if (word.length < 4) return false;
  for (const g of givenWords) {
    if (
      g.length >= 4 &&
      Math.abs(g.length - word.length) <= 2 &&
      (g.startsWith(word) || word.startsWith(g))
    ) {
      return true;
    }
  }
  return false;
}

/** The brief's own words for a value: „72 Prozent wünschen sich mehr …" → „wünschen sich mehr …". */
export function briefWordsFor(wert: number, given: string): string | null {
  const value = String(wert).replace('.', '[.,]');
  const match = new RegExp(
    `(?<![\\d.,])${value}(?!\\d)\\s*(?:%|Prozent)?\\s+((?:[\\p{L}-]+\\s+){0,3}[\\p{L}-]+)`,
    'iu'
  ).exec(given);
  return match ? match[1]! : null;
}

/** Digits glued to letters are part of a name (CO2, A7), not a figure. */
export const NUMBER = /(?<!\p{L})\d+(?:[.,]\d+)*/gu;
/** `3.300` and `3300` are the same number — compare digits only. */
export const digits = (value: string) => value.replace(/[.,]/g, '');

/**
 * Small numbers a poll spells out — „Neun von zehn“, „jedes fünfte Kind“,
 * „ein Drittel“. They count only for a share (`anteil`): everywhere else
 * „jeden Tag“ or „wir achten“ would license a 1 or an 8 nobody gave.
 * Ordinals and fractions name the whole; „jede“, „ein Drittel“ and „die
 * Hälfte“ the part one.
 */
const FRACTION = '(?:dritt|viert|fünft|sechst|siebt|acht|neunt|zehnt)el';
const SPELLED: [RegExp, number][] = (
  [
    [`eins|jede[mnrs]?|hälfte|ein(?:e[mnrs]?)?\\s+von|ein\\s+${FRACTION}`, 1],
    ['zwei|hälfte|zweite[mnrs]?', 2],
    ['drei|dritte[lmnrs]?', 3],
    ['vier|vierte[lmnrs]?', 4],
    ['fünf|fünfte[lmnrs]?', 5],
    ['sechs|sechste[lmnrs]?', 6],
    ['sieben|siebte[lmnrs]?', 7],
    ['acht|achte[lmnrs]?', 8],
    ['neun|neunte[lmnrs]?', 9],
    ['zehn|zehnte[lmnrs]?', 10],
  ] as const
).map(([words, n]) => [new RegExp(`(?<!\\p{L})(?:${words})(?!\\p{L})`, 'u'), n]);
export function spelledNumbers(text: string): string[] {
  const lower = text.toLowerCase();
  return SPELLED.filter(([word]) => word.test(lower)).map(([, n]) => String(n));
}

/**
 * A clock time: „10 Uhr“, „18h“, „18.30 Uhr“, „20 Uhr 30“, „18:30“, and a
 * span „10–13 Uhr“ or „10 bis 13 Uhr“ — not „14.11.“. Groups: span start,
 * hour, minutes (two places), and hour and minutes of the bare „18:30“.
 */
const CLOCK_TIME =
  /(?<![\d.:])(?:(\d{1,2})(?:\s*[–-]\s*|\s+bis\s+))?(\d{1,2})(?:[:.](\d{2}))?\s*(?:Uhr|h)(?!\p{L})(?:\s{1,3}(\d{2})(?![\d:]|\.\d))?|(?<![\d.:])(\d{1,2}):(\d{2})(?![\d:])/giu;

/** Clock times as [hour, minutes], both ends of a span. */
export function clockTimes(text: string): [number, number][] {
  const times: [number, number][] = [];
  for (const m of text.matchAll(CLOCK_TIME)) {
    if (m[1] !== undefined) times.push([Number(m[1]), 0]);
    times.push(
      m[2] !== undefined ? [Number(m[2]), Number(m[3] ?? m[4] ?? 0)] : [Number(m[5]), Number(m[6])]
    );
  }
  return times;
}

/** `datum.time` in `sharepicSlideSchema`. */
const TIME_MAX = 12;

/**
 * The one time a request names, as the circle shows it: „19 Uhr“, „18:30 Uhr“,
 * „10–13 Uhr“. None when it names several („Einlass 18 Uhr, Beginn 19 Uhr“).
 */
export function orderedTime(order: string): string | null {
  const found = [...order.matchAll(CLOCK_TIME)];
  if (found.length !== 1) return null;
  const m = found[0]!;
  const hour = m[2] ?? m[5]!;
  const minutes = m[3] ?? m[4] ?? m[6];
  const time = `${m[1] !== undefined ? `${m[1]}–` : ''}${hour}${minutes ? `:${minutes}` : ''} Uhr`;
  return time.length <= TIME_MAX ? time : null;
}

/** Own extraction, `digits()` would collapse „18.30“ to „1830“; a time only in words is skipped. */
export function timeInBrief(time: string, given: string): boolean {
  const stated = clockTimes(given);
  if (
    !stated.length &&
    /\p{L}{1,20}\s{1,3}Uhr(?!\p{L})|\b(?:halb|viertel|dreiviertel)\s+\p{L}/iu.test(given)
  ) {
    return true;
  }
  const parsed = /(\d{1,2})(?:[:.](\d{2}))?/.exec(time);
  const first = parsed && [Number(parsed[1]), Number(parsed[2] ?? 0)];
  if (!first) return true;
  return stated.some(([h, m]) => h === first[0] && (first[1] === 0 || m === first[1]));
}

const MONTHS: Record<string, number> = {
  jan: 1,
  jän: 1,
  feb: 2,
  mär: 3,
  mrz: 3,
  apr: 4,
  mai: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  okt: 10,
  nov: 11,
  dez: 12,
};
/**
 * Day and month of every date a text names, as `d.m` — „15. November",
 * „15. Nov." and „15.11." are the same day. AT „Jänner" and „Feber" count.
 */
export function calendarDays(text: string): Set<string> {
  const days = new Set<string>();
  const add = (d: string, m: number) => {
    const day = Number(d);
    if (day >= 1 && day <= 31 && m >= 1 && m <= 12) days.add(`${day}.${m}`);
  };
  for (const [, d, m] of text.matchAll(/(\d{1,2})\.\s?(\d{1,2})\.?(?!\d)/g)) add(d!, Number(m));
  for (const [, d, name] of text.matchAll(/(\d{1,2})\.\s?([A-Za-zÄäÖöÜü]{3,})/g)) {
    const month =
      MONTHS[name!.toLowerCase().slice(0, 3)] ?? (name!.toLowerCase().startsWith('feber') ? 2 : 0);
    add(d!, month);
  }
  return days;
}

export const POINTS_TO_ACTION =
  /(?<!\p{L})(?:link|bio|petition\p{L}*|unterschr\p{L}*|unterzeichn\p{L}*|https?:\/\/|www\.|\p{L}+\.(?:de|at|eu|org)(?!\p{L}))/iu;
const ADDRESS_WORDS = new Set([
  'herr',
  'frau',
  'liebe',
  'lieber',
  'an',
  'die',
  'den',
  'der',
  'das',
  'und',
]);

/** "Herr Merz" or "@Schwarzrot": every name word must be in the brief. */
export function addresseeInBrief(adressat: string, givenWords: ReadonlySet<string>): boolean {
  const names = wordsOf(adressat.replace(/^@/, '')).filter((w) => !ADDRESS_WORDS.has(w));
  return names.length > 0 && names.every((w) => givenWords.has(w));
}
