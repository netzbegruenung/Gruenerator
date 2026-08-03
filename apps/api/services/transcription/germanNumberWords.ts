/**
 * Turns spelled-out German numbers into digits, token by token.
 *
 * Why this exists: GreenPT's `smart_format` is documented as English-only and
 * unsupported on `green-s-pro`, and switching it on for German audio does more
 * harm than good — measured over 45 minutes of broadcast speech it produced one
 * correct conversion and eleven wrong ones, because it cannot tell the numeral
 * "eins" from the article "einer" ("von einer Bundestagswahl" → "von 1
 * Bundestagswahl") or an ordinal adjective from a list marker ("das Zweite ist"
 * → "das 2. Ist", mangling the capitalisation of the next word too).
 *
 * That direction is not repairable: "1" carries no trace of whether the speaker
 * said ein/eine/einer/einem/einen. The opposite direction is, because a German
 * number word determines its digits exactly — so we transcribe without
 * smart_format and convert here, skipping precisely the ambiguous class.
 *
 * Conversion is deliberately token-for-token: the subtitle position mapping
 * aligns the word-timestamp array against the transcript string, so both must
 * be rewritten identically or every touched cue falls back to a word join.
 */

const TEENS: Readonly<Record<string, number>> = {
  zehn: 10,
  elf: 11,
  zwölf: 12,
  dreizehn: 13,
  vierzehn: 14,
  fünfzehn: 15,
  sechzehn: 16,
  siebzehn: 17,
  achtzehn: 18,
  neunzehn: 19,
};

const TENS: Readonly<Record<string, number>> = {
  zwanzig: 20,
  dreißig: 30,
  dreissig: 30,
  vierzig: 40,
  fünfzig: 50,
  sechzig: 60,
  siebzig: 70,
  achtzig: 80,
  neunzig: 90,
};

const UNITS: Readonly<Record<string, number>> = {
  ein: 1,
  eins: 1,
  eine: 1,
  einer: 1,
  einem: 1,
  einen: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  fünf: 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9,
};

/**
 * The article/pronoun forms of "ein". Indistinguishable from the numeral
 * without syntax, and the overwhelmingly more common reading in speech — this
 * is the exact class smart_format gets wrong, so it stays untouched.
 */
const AMBIGUOUS_ONE = /^ein(s|e|er|em|en)?$/i;

/** Everything that is not a letter, at the edges only — "zehn," keeps its comma. */
const OUTER_NON_LETTERS = /^[^\p{L}]+|[^\p{L}]+$/gu;

function parseNumberWord(word: string): number | null {
  if (word === '') return null;

  // "zweitausendneunzehn" → 2 * 1000 + 19. Thousands before hundreds so that
  // "zwölfhundert…" and "zweitausendfünfhundert" both split at the right seam.
  for (const [separator, multiplier] of [
    ['tausend', 1000],
    ['hundert', 100],
  ] as const) {
    const at = word.indexOf(separator);
    if (at === -1) continue;

    // A bare leading "tausend"/"hundert" means one of them.
    const head = at === 0 ? 1 : parseNumberWord(word.slice(0, at));
    if (head === null) return null;

    const tailWord = word.slice(at + separator.length);
    const tail = tailWord === '' ? 0 : parseNumberWord(tailWord);
    if (tail === null) return null;

    return head * multiplier + tail;
  }

  if (word in TEENS) return TEENS[word];
  if (word in TENS) return TENS[word];

  // "fünfundvierzig" → 5 + 40.
  const und = word.indexOf('und');
  if (und > 0) {
    const unit = UNITS[word.slice(0, und)];
    const ten = TENS[word.slice(und + 'und'.length)];
    if (unit !== undefined && ten !== undefined) return unit + ten;
  }

  if (word in UNITS) return UNITS[word];
  return null;
}

/**
 * Converts a single token, preserving whatever punctuation it carries.
 * Returns null when the token is not a number word, or is one we refuse to
 * touch — callers keep the original in that case.
 */
export function germanNumberWordToDigits(token: string): string | null {
  const core = token.replace(OUTER_NON_LETTERS, '');
  if (core === '' || AMBIGUOUS_ONE.test(core)) return null;

  const value = parseNumberWord(core.toLowerCase());
  // < 2 can only come from an "ein" spelling we did not already reject.
  if (value === null || value < 2) return null;

  return token.replace(core, String(value));
}

/**
 * Rewrites every number word in a text. Whitespace is preserved exactly, and
 * the token count never changes — the property the position mapping relies on.
 *
 * Known residual: "Acht" as a noun ("Acht geben") would be converted. Not seen
 * once in 8.849 words of measured broadcast speech, and the alternative — a
 * capitalisation heuristic — would wrongly skip a sentence-initial "Acht
 * Prozent". Left simple on purpose.
 */
export function convertGermanNumberWords(text: string): string {
  return text
    .split(/(\s+)/)
    .map((token) => germanNumberWordToDigits(token) ?? token)
    .join('');
}
