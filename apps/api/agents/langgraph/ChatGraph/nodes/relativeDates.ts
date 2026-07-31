/**
 * Deterministic German relative-date parser.
 *
 * Exists because the only component that ever turned "letzte Woche" into a date
 * range was the 27k-character Tier-4 prompt: `extractFilters` merely VALIDATES
 * `^\d{4}-\d{2}-\d{2}$` on whatever the model returned, and
 * `heuristicExtractFilters` extracts no dates at all. Any route that skips the
 * LLM therefore silently lost date-windowed recall — which is the one thing that
 * made the chat-recall path worth its latency.
 *
 * NOT wired into `heuristicExtractFilters`, deliberately. There a date range
 * narrows a Qdrant search over PUBLISHED documents, where a temporal word is
 * usually rhetorical: "Was ist die Position der Grünen zur Windkraft heute?"
 * would filter the corpus down to documents published today and answer "keine
 * Quellen". On the chat-recall route the same words are literal — the user is
 * pointing at when THEY wrote something — so the filter helps instead of
 * emptying the result set. Whoever wants dates on the document path needs a
 * separate decision about which phrasings are literal there, not a second
 * caller of this function.
 *
 * Windows are recall-friendly on purpose: "vor 3 Tagen" opens a window from that
 * day to today rather than pinning the single day, because a recall that misses
 * is worse than one that returns a neighbour.
 *
 * `\p{L}` boundaries with the `u` flag instead of `\b`, because `\b` needs a
 * `\w`/non-`\w` transition and without `u` "ä" is not `\w` — every alternative
 * starting with an umlaut ("März") would be dead. Same idiom as
 * `SYSTEM_MCP_PHRASING` and `parseScope`.
 *
 * Austrian month names (jänner/feber) are first-class, not an afterthought:
 * de-AT is a first-class audience.
 */

export interface RecallDateRange {
  date_from: string;
  date_to: string;
}

const MS_PER_DAY = 86_400_000;

/**
 * The reference day, as a UTC-midnight timestamp whose Y/M/D are the LOCAL
 * calendar date.
 *
 * Both halves matter. Local components, because "heute" means the user's today:
 * reading UTC components turned every request between midnight and 02:00 CEST
 * into yesterday's window — an hour when a wrong answer is indistinguishable
 * from a right one. UTC midnight for the arithmetic, because UTC has no DST, so
 * "+ 7 days" is exactly seven days and `toISOString().slice(0, 10)` prints the
 * date that was computed.
 */
function startOfDay(now: Date): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function range(fromMs: number, toMs: number): RecallDateRange {
  return { date_from: iso(fromMs), date_to: iso(toMs) };
}

/** Monday of the week containing `dayMs` (German week starts Monday). */
function startOfWeek(dayMs: number): number {
  const weekday = new Date(dayMs).getUTCDay(); // 0 = Sunday
  const backToMonday = (weekday + 6) % 7;
  return dayMs - backToMonday * MS_PER_DAY;
}

function startOfMonth(ms: number, monthOffset = 0): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + monthOffset, 1);
}

/** Last day of the month that `ms` falls into, offset by whole months. */
function endOfMonth(ms: number, monthOffset = 0): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + monthOffset + 1, 0);
}

const WORD_NUMBERS: Record<string, number> = {
  ein: 1,
  eine: 1,
  einem: 1,
  einer: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  fünf: 5,
  fuenf: 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9,
  zehn: 10,
  elf: 11,
  zwölf: 12,
  zwoelf: 12,
  vierzehn: 14,
};

/** Month index (0-based) per German/Austrian name. */
const MONTH_INDEX: Record<string, number> = {
  januar: 0,
  jänner: 0,
  jaenner: 0,
  februar: 1,
  feber: 1,
  märz: 2,
  maerz: 2,
  april: 3,
  mai: 4,
  juni: 5,
  juli: 6,
  august: 7,
  september: 8,
  oktober: 9,
  november: 10,
  dezember: 11,
};

const AGO_RE =
  /(?<!\p{L})vor\s+(\d{1,3}|ein|eine|einem|einer|zwei|drei|vier|fünf|fuenf|sechs|sieben|acht|neun|zehn|elf|zwölf|zwoelf|vierzehn)\s+(tag|tagen|woche|wochen|monat|monaten|jahr|jahren)(?!\p{L})/iu;

const MONTH_RE =
  /(?<!\p{L})(januar|jänner|jaenner|februar|feber|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)(?:\s+((?:19|20)\d{2}))?(?!\p{L})/iu;

/**
 * A bare four-digit number is a year only when a temporal word introduces it.
 * "Wahlprogramm 2025" is a title; "aus dem Jahr 2025" is a window.
 */
const YEAR_RE = /(?<!\p{L})(seit|im\s+jahr|aus\s+dem\s+jahr|jahr)\s+((?:19|20)\d{2})(?!\d)/iu;

/**
 * Turn a German temporal phrase into an inclusive ISO date window.
 *
 * @param text  raw user message
 * @param now   reference "today"; injected so the behaviour is testable
 * @returns     the window, or `null` when the text names no period at all
 */
export function parseRelativeDateRange(
  text: string,
  now: Date = new Date()
): RecallDateRange | null {
  const t = (text ?? '').trim();
  if (!t) return null;
  const today = startOfDay(now);

  // Most specific first: an explicit count beats the fuzzy words it contains
  // ("vor zwei Wochen" also matches /wochen/).
  const ago = AGO_RE.exec(t);
  if (ago) {
    const rawCount = ago[1].toLowerCase();
    const count = /^\d+$/.test(rawCount) ? Number(rawCount) : (WORD_NUMBERS[rawCount] ?? 0);
    if (count > 0) {
      const unit = ago[2].toLowerCase();
      if (unit.startsWith('tag')) return range(today - count * MS_PER_DAY, today);
      if (unit.startsWith('woche')) return range(today - count * 7 * MS_PER_DAY, today);
      if (unit.startsWith('monat')) return range(startOfMonth(today, -count), today);
      return range(Date.UTC(new Date(today).getUTCFullYear() - count, 0, 1), today);
    }
  }

  if (/(?<!\p{L})vorgestern(?!\p{L})/iu.test(t)) {
    const d = today - 2 * MS_PER_DAY;
    return range(d, d);
  }
  if (/(?<!\p{L})gestern(?!\p{L})/iu.test(t)) {
    const d = today - MS_PER_DAY;
    return range(d, d);
  }
  if (/(?<!\p{L})heute(?!\p{L})/iu.test(t)) return range(today, today);

  const lastWeek = /(?<!\p{L})(letzte|vergangene|vorige|vorletzte)\w*\s+woche(?!\p{L})/iu.exec(t);
  if (lastWeek) {
    const weeksBack = lastWeek[1].toLowerCase() === 'vorletzte' ? 2 : 1;
    const monday = startOfWeek(today) - weeksBack * 7 * MS_PER_DAY;
    return range(monday, monday + 6 * MS_PER_DAY);
  }
  if (/(?<!\p{L})diese\w*\s+woche(?!\p{L})/iu.test(t)) return range(startOfWeek(today), today);

  const lastMonth = /(?<!\p{L})(letzte|vergangene|vorige|vorletzte)\w*\s+monat(?!\p{L})/iu.exec(t);
  if (lastMonth) {
    const monthsBack = lastMonth[1].toLowerCase() === 'vorletzte' ? 2 : 1;
    return range(startOfMonth(today, -monthsBack), endOfMonth(today, -monthsBack));
  }
  if (/(?<!\p{L})diese\w*\s+monat(?!\p{L})/iu.test(t)) return range(startOfMonth(today), today);

  const lastYear = /(?<!\p{L})(letzte|vergangene|vorige|vorletzte)\w*\s+jahr(?!\p{L})/iu.exec(t);
  if (lastYear) {
    const yearsBack = lastYear[1].toLowerCase() === 'vorletzte' ? 2 : 1;
    const year = new Date(today).getUTCFullYear() - yearsBack;
    return range(Date.UTC(year, 0, 1), Date.UTC(year, 11, 31));
  }
  if (/(?<!\p{L})diese\w*\s+jahr(?!\p{L})/iu.test(t)) {
    return range(Date.UTC(new Date(today).getUTCFullYear(), 0, 1), today);
  }

  // `seit` FIRST, because it changes the shape of whatever follows it: an open
  // window to today, not the closed period the word names. Checking the month
  // pattern first collapsed "seit März 2024" to March 2024 and silently dropped
  // everything the user actually asked for.
  const since = /(?<!\p{L})seit(?!\p{L})/iu.test(t);

  const month = MONTH_RE.exec(t);
  if (month) {
    const monthIndex = MONTH_INDEX[month[1].toLowerCase()];
    const nowYear = new Date(today).getUTCFullYear();
    // No year named → the most recent occurrence at or before this month. A
    // future month can only mean last year's.
    const year = month[2]
      ? Number(month[2])
      : monthIndex > new Date(today).getUTCMonth()
        ? nowYear - 1
        : nowYear;
    const start = Date.UTC(year, monthIndex, 1);
    return range(start, since ? today : Date.UTC(year, monthIndex + 1, 0));
  }

  const year = YEAR_RE.exec(t);
  if (year) {
    const y = Number(year[2]);
    // "seit 2024" is open-ended; the other three name a closed year.
    if (year[1].toLowerCase() === 'seit') return range(Date.UTC(y, 0, 1), today);
    return range(Date.UTC(y, 0, 1), Date.UTC(y, 11, 31));
  }

  return null;
}
