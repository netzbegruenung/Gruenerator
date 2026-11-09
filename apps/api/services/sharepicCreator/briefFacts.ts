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

/** A word that says a figure went up or down, saved or added. */
const DIRECTION =
  /(?<!\p{L})(?:weniger|mehr|minder|gesunken|gestiegen|gesenkt|gesteigert|gespart|eingespart|ersparnis|rückgang|anstieg|zuwachs|plus|minus|sank|sinkt|sinken|stieg|steigt|steigen|reduziert|reduzierung|senkung|steigerung|zusätzlich\w*)(?!\p{L})/iu;
/** Words on either side of a figure that count as „next to it". */
const NEAR = 4;

/**
 * Clause ends: sentence punctuation, or a comma/colon followed by a space —
 * the decimal comma of „2,4" has none. A direction word only counts for a
 * figure in its own clause: „Mehr Radwege. 2,4 km Länge" says nothing about
 * the 2,4 (review #5490).
 */
const CLAUSE_END = /[.;!?]+(?:\s+|$)|[,:]\s+|\n+/u;

/**
 * A directed figure: its digits and what it counts. The counted thing is the
 * word after the number („17 Unfälle“, `%` for a percent sign), else the last
 * capitalised word before it in the clause — German nouns are capitalised
 * („Die Zahl der Unfälle sank um 17“ → `unfälle`).
 */
interface DirectedFigure {
  num: string;
  noun: string | null;
}

const wordOf = (token: string | undefined): string | null => {
  if (token == null) return null;
  if (token.startsWith('%')) return '%';
  const w = token.toLowerCase().replace(/[^\p{L}]/gu, '');
  return w === 'prozent' ? '%' : w || null;
};

/** Each number of `text` that has a direction word within a few words of its clause (or a +/− sign). */
function directedNumbers(text: string): DirectedFigure[] {
  const found: DirectedFigure[] = [];
  for (const clause of text.split(CLAUSE_END)) {
    const tokens = clause.split(/\s+/).filter(Boolean);
    tokens.forEach((token, i) => {
      const num = token.match(NUMBER)?.[0];
      if (!num) return;
      const window = tokens.slice(Math.max(0, i - NEAR), i + NEAR + 1).join(' ');
      if (!/^[+\-−–]\d/.test(token) && !DIRECTION.test(window)) return;
      // Skip direction words: in „17 weniger Unfälle" the figure counts Unfälle (review #5490).
      const after = token.endsWith('%')
        ? '%'
        : (tokens
            .slice(i + 1, i + 3)
            .filter((t) => !DIRECTION.test(t))
            .map(wordOf)
            .find((w) => w != null) ?? null);
      const before = tokens
        .slice(0, i)
        .filter((t) => /^\p{Lu}/u.test(t))
        .map(wordOf)
        .filter((w): w is string => w != null)
        .at(-1);
      found.push({ num: digits(num), noun: after ?? before ?? null });
    });
  }
  return found;
}

/**
 * Numbers of `text` that carry a direction („17 Unfälle weniger“, „−5 %“)
 * the brief does not give for the same figure. The figure may be in the brief
 * — a hotspot count — and still not mean a reduction. „Same figure" means
 * same digits AND same counted thing on both sides (review #5490: „Der
 * Verkehr sank um 17 %" says nothing about „17 Unfälle"). Only a tile figure
 * with no word at all („−17") is vague enough to be covered by the digits.
 */
export function invertedNumbers(text: string, given: string): string[] {
  const inGiven = directedNumbers(given);
  const covered = (f: DirectedFigure) =>
    inGiven.some((g) => g.num === f.num && (f.noun == null || g.noun === f.noun));
  return [
    ...new Set(
      directedNumbers(text)
        .filter((f) => !covered(f))
        .map((f) => f.num)
    ),
  ];
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
 * Words that say which way a figure moved, by direction, as word stems.
 * „17 Unfälle“ and „17 Unfälle weniger“ carry the same digits — the number
 * check in `validateDraft` sees no difference (#5480).
 */
const DIRECTION_STEMS: Record<'ab' | 'auf' | 'verhindert', readonly string[]> = {
  ab: [
    'weniger',
    'sank',
    'sink',
    'gesunk',
    'senk',
    'gesenk',
    'rückgang',
    'reduz',
    'minus',
    'halbiert',
    'leiser',
    'billiger',
    'günstiger',
    'spar',
    'gespar',
    'eingespar',
  ],
  auf: [
    'mehr',
    'stieg',
    'steig',
    'gestieg',
    'anstieg',
    'zuwachs',
    'plus',
    'verdoppel',
    'verdreifach',
    'lauter',
    'teurer',
    'rauf',
  ],
  verhindert: ['verhinder', 'vermieden'],
};
function directionsOf(text: string): Set<string> {
  const found = new Set<string>();
  for (const word of wordsOf(text)) {
    for (const [direction, stems] of Object.entries(DIRECTION_STEMS)) {
      if (stems.some((stem) => word.startsWith(stem))) found.add(direction);
    }
  }
  return found;
}

/** How far around a figure the brief may say which way it moved. */
const DIRECTION_WINDOW = 100;
/** How close a direction word stands to the figure it moves, in words („17 Unfälle weniger“). */
const DIRECTION_REACH = 3;

/**
 * The figures a text gives a direction the brief does not give them: a
 * direction word next to a number in the text needs a word of the same
 * direction near the same number in the brief. Numbers missing from the brief
 * are the number check's. Only words next to the figure count — „Mehr Busse:
 * 3.300 Fahrgäste betroffen“ says nothing about the 3.300.
 */
export function unbackedDirections(text: string, given: string): string[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  const briefNumbers = [...given.matchAll(NUMBER)];
  const unbacked: string[] = [];
  tokens.forEach((token, i) => {
    const shown = token.match(NUMBER)?.[0];
    if (!shown) return;
    const around = tokens
      .slice(Math.max(0, i - DIRECTION_REACH), i + DIRECTION_REACH + 1)
      .join(' ');
    const directions = directionsOf(around);
    if (!directions.size) return;
    const near = briefNumbers
      .filter((m) => digits(m[0]) === digits(shown))
      .map((m) =>
        given.slice(
          Math.max(0, m.index - DIRECTION_WINDOW),
          m.index + m[0].length + DIRECTION_WINDOW
        )
      );
    if (!near.length) return;
    const backed = [...directions].every((d) => near.some((w) => directionsOf(w).has(d)));
    if (!backed) unbacked.push(shown);
  });
  return unbacked;
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

export type WeekdayId = 'mo' | 'di' | 'mi' | 'do' | 'fr' | 'sa' | 'so';
const WEEKDAY_NAMES: [WeekdayId, string][] = [
  ['mo', 'montag'],
  ['di', 'dienstag'],
  ['mi', 'mittwoch'],
  ['do', 'donnerstag'],
  ['fr', 'freitag'],
  ['sa', 'samstag|sonnabend'],
  ['so', 'sonntag'],
];
/**
 * A day mention: the name alone, genitive/adverb „-s“ or a time of day
 * („Donnerstagabend“). Not „Sonntagsfrage“, „Montage“ or „Montagsdemo“ —
 * those name no date (a recurring „Montagsdemo“ is left out on purpose, the
 * model has to take its weekday from the order's own words).
 */
const DAY_SUFFIX = '(?:s|(?:früh|vor|nach)?(?:mittag|abend|morgen|nacht)s?)?';
const WEEKDAY_FULL = WEEKDAY_NAMES.map(
  ([id, names]) => [id, new RegExp(`(?<!\\p{L})(?:${names})${DAY_SUFFIX}(?!\\p{L})`, 'iu')] as const
);
const ABBREVIATIONS: WeekdayId[] = WEEKDAY_NAMES.map(([id]) => id);
const cap = (id: string) => id[0]!.toUpperCase() + id[1]!;
const ABBR_GROUP = ABBREVIATIONS.map(cap).join('|');
/** „Mo.“, „Sa./So.“ — a dot, capitalised; „Fr.“ before a surname is „Frau“. */
const WEEKDAY_DOTTED = new RegExp(
  `(?<!\\p{L})(${ABBR_GROUP})\\.(?!\\p{L})(?<!Fr\\.(?=\\s+\\p{Lu}\\p{Ll}))`,
  'gu'
);
/** „Mo–Fr“, „Sa/So“: both ends capitalised, undotted only inside a range or list. */
const WEEKDAY_RANGE = new RegExp(
  `(?<!\\p{L})(${ABBR_GROUP})\\s*[–\\-/]\\s*(${ABBR_GROUP})(?!\\p{L})`,
  'gu'
);

/**
 * Undotted „Do“ / „Sa“ is a weekday only with a hint: after „am“, „ab“,
 * „jeden“, „bis“ or right before a clock time or a calendar date. Bare
 * „So geht’s“ or „Mo Farah“ stay words and names.
 */
const AFTER_PREPOSITION = new RegExp(
  `(?<![\\p{L}])(?:am|ab|jeden|bis)\\s+(${ABBR_GROUP})(?!\\p{L})(?!\\.\\s+\\p{Lu}\\p{Ll})`,
  'giu'
);
const BEFORE_TIME_OR_DATE = new RegExp(
  `(?<!\\p{L})(${ABBR_GROUP})(?!\\p{L})[,\\s]*(?=\\d{1,2}(?:[:.]\\d{2})?\\s*(?:Uhr|h(?!\\p{L}))|\\d{1,2}:\\d{2}|\\d{1,2}\\.\\s?\\d{1,2}\\.)`,
  'gu'
);

/** The weekdays a text names, as full word, compound or abbreviation. */
export function weekdaysIn(text: string): Set<WeekdayId> {
  const found = new Set<WeekdayId>();
  for (const [id, full] of WEEKDAY_FULL) if (full.test(text)) found.add(id);
  const add = (short: string) => found.add(short.toLowerCase() as WeekdayId);
  for (const m of text.matchAll(WEEKDAY_DOTTED)) add(m[1]!);
  for (const m of text.matchAll(WEEKDAY_RANGE)) {
    add(m[1]!);
    add(m[2]!);
  }
  // The preposition is case-insensitive, the abbreviation must stay capitalised.
  for (const m of text.matchAll(AFTER_PREPOSITION)) if (/^\p{Lu}/u.test(m[1]!)) add(m[1]!);
  for (const m of text.matchAll(BEFORE_TIME_OR_DATE)) add(m[1]!);
  return found;
}

/** A weekday as the model writes it: a full name (with day-part suffix) or a known abbreviation — else null. */
export function weekdayId(value: string): WeekdayId | null {
  const word = value.trim().replace(/\.$/, '');
  const short = word.toLowerCase();
  if (word.length === 2 && ABBREVIATIONS.includes(short as WeekdayId)) return short as WeekdayId;
  const full = WEEKDAY_FULL.find(([, re]) => new RegExp(`^${re.source}$`, 'iu').test(word));
  return full ? full[0] : null;
}

/** The brief names a day: a calendar date or a weekday. */
export function hasTermin(given: string): boolean {
  return calendarDays(given).size > 0 || weekdaysIn(given).size > 0;
}
