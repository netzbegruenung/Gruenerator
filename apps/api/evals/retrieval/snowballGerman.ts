/**
 * Der deutsche Snowball-Stemmer (Porter 2001), als Vergleichsgegner für
 * CISTEM in `bm25Candidates.ts` (#3188).
 *
 * WARUM HANDGESCHRIEBEN UND NICHT AUS EINEM PAKET. `natural` liegt schon im
 * Baum (transitiv über `mem0ai`) und bringt `PorterStemmerDe` mit, das sich
 * ausdrücklich auf denselben Algorithmus beruft. Gegen die amtliche
 * Wortliste des Snowball-Projekts (35 053 Wörter, `snowball-data/german`,
 * abgerufen 04.09.2026) weicht es in **1265 Fällen (3,61 %)** ab, und zwar
 * systematisch: es lässt die Partizip-Endung `-et` stehen
 * (`abgeleitet` → `abgeleitet` statt `abgeleit`). Eine Messung damit hätte
 * nicht Snowball gegen CISTEM gestellt, sondern einen Fehler gegen CISTEM —
 * und die Endung, die es verfehlt, ist genau die, um die es bei einem
 * Stemmer-Vergleich geht.
 *
 * Diese Übersetzung folgt `algorithms/german.sbl` aus dem Snowball-Quellbaum
 * Zeile für Zeile und reproduziert die amtliche Ausgabe für **alle** 35 053
 * Wörter. `snowballGerman.vitest.ts` hält eine Stichprobe daraus als Fixture
 * fest; die Vollprüfung steht im Kopf dieses Tests.
 *
 * Der Cursor im `prelude` wird von Hand geführt statt per Regex, weil
 * `repeat goto` nach einem Treffer hinter dem ERSETZTEN Zeichen aufsetzt und
 * ein globales Regex hinter dem ganzen Treffer: `eueue` wird zu `eUeUe`, nicht
 * zu `eUeue`. Auf der amtlichen Wortliste macht das nachweislich keinen
 * Unterschied (0 von 35 053 Wörtern trennen die beiden Fassungen) — die
 * Handführung ist hier nicht die Reparatur eines beobachteten Fehlers, sondern
 * der Grund, warum diese Datei ohne eine solche Beobachtung richtig ist.
 */

const VOWELS = new Set([...'aeiouyäöü']);
/** `et_ending` — was vor einer abtrennbaren `-et`-Endung stehen darf. */
const ET_ENDING = new Set([...'dfgklmnrstUzä']);
/** `s_ending` — was vor einer abtrennbaren `-s`-Endung stehen darf. */
const S_ENDING = new Set([...'bdfghklmnrt']);
/** `st_ending` — dasselbe ohne `r`. */
const ST_ENDING = new Set([...'bdfghklmnt']);

/** Wörter, hinter denen `-et` NICHT fällt (Planet, Ticket, Internet …). */
const ET_BLOCKED = ['geordn', 'intern', 'plan', 'tick', 'tr'] as const;

/** Ob `w[0..end)` auf `suffix` endet. */
function endsAt(w: string, end: number, suffix: string): boolean {
  return suffix.length <= end && w.startsWith(suffix, end - suffix.length);
}

/** Das längste Element aus `list`, auf das `w[0..end)` endet — Snowballs `among`. */
function longestSuffix(w: string, end: number, list: readonly string[]): string | null {
  let best: string | null = null;
  for (const candidate of list) {
    if (endsAt(w, end, candidate) && (best === null || candidate.length > best.length)) {
      best = candidate;
    }
  }
  return best;
}

/** `prelude`: u/y zwischen Vokalen gross, dann ß/ae/oe/ue ersetzen (`qu` geschützt). */
function prelude(word: string): string {
  const chars = [...word];
  for (let i = 0; i + 2 < chars.length;) {
    const middle = chars[i + 1];
    if (VOWELS.has(chars[i]) && (middle === 'u' || middle === 'y') && VOWELS.has(chars[i + 2])) {
      chars[i + 1] = middle === 'u' ? 'U' : 'Y';
      i += 2;
    } else {
      i += 1;
    }
  }

  const source = chars.join('');
  let out = '';
  for (let i = 0; i < source.length;) {
    if (source.startsWith('ß', i)) {
      out += 'ss';
      i += 1;
    } else if (source.startsWith('ae', i)) {
      out += 'ä';
      i += 2;
    } else if (source.startsWith('oe', i)) {
      out += 'ö';
      i += 2;
    } else if (source.startsWith('ue', i)) {
      out += 'ü';
      i += 2;
    } else if (source.startsWith('qu', i)) {
      out += 'qu';
      i += 2;
    } else {
      out += source[i];
      i += 1;
    }
  }
  return out;
}

/** `mark_regions`: R1 (mindestens 3 Zeichen davor) und R2. */
function markRegions(w: string): { p1: number; p2: number } {
  const n = w.length;
  const atLeastThree = n >= 3 ? 3 : 0;
  let i = 0;

  const goPast = (inGroup: boolean): boolean => {
    while (i < n && VOWELS.has(w[i]) !== inGroup) i++;
    if (i >= n) return false;
    i++;
    return true;
  };

  if (!goPast(true) || !goPast(false)) return { p1: n, p2: n };
  const p1 = Math.max(i, atLeastThree);
  if (!goPast(true) || !goPast(false)) return { p1, p2: n };
  return { p1, p2: i };
}

const POSTLUDE: Readonly<Record<string, string>> = {
  Y: 'y',
  U: 'u',
  ä: 'a',
  ö: 'o',
  ü: 'u',
};

/** `standard_suffix`: die vier Rückwärts-Blöcke. */
function standardSuffix(input: string, p1: number, p2: number): string {
  let w = input;
  let cursor = w.length;
  const cut = (bra: number, ket: number, replacement = ''): void => {
    w = w.slice(0, bra) + replacement + w.slice(ket);
    cursor = bra + replacement.length;
  };

  // Block 1 — Flexionsendungen.
  {
    const ket = cursor;
    const hit = longestSuffix(w, ket, [
      'em',
      'ern',
      'er',
      'erin',
      'erinnen',
      'e',
      'en',
      'es',
      's',
      'ln',
      'lns',
    ]);
    const bra = hit === null ? -1 : ket - hit.length;
    if (hit !== null && p1 <= bra) {
      if (hit === 'em') {
        if (!endsAt(w, bra, 'syst')) cut(bra, ket);
      } else if (hit === 'ern' || hit === 'er' || hit === 'erin' || hit === 'erinnen') {
        cut(bra, ket);
      } else if (hit === 'e' || hit === 'en' || hit === 'es') {
        cut(bra, ket);
        if (endsAt(w, cursor, 'niss')) cut(cursor - 1, cursor);
      } else if (hit === 's') {
        if (bra >= 1 && S_ENDING.has(w[bra - 1])) cut(bra, ket);
      } else {
        cut(bra, ket, 'l');
      }
    }
  }

  // Block 2 — Verbendungen.
  {
    const ket = cursor;
    const hit = longestSuffix(w, ket, ['en', 'er', 'est', 'st', 'et']);
    const bra = hit === null ? -1 : ket - hit.length;
    if (hit !== null && p1 <= bra) {
      if (hit === 'en' || hit === 'er' || hit === 'est') {
        cut(bra, ket);
      } else if (hit === 'st') {
        if (bra >= 4 && ST_ENDING.has(w[bra - 1])) cut(bra, ket);
      } else if (
        bra >= 1 &&
        ET_ENDING.has(w[bra - 1]) &&
        !ET_BLOCKED.some((x) => endsAt(w, bra, x))
      ) {
        cut(bra, ket);
      }
    }
  }

  // Block 3 — Ableitungsendungen (R2).
  {
    const ket = cursor;
    const hit = longestSuffix(w, ket, ['end', 'ung', 'ig', 'ik', 'isch', 'lich', 'heit', 'keit']);
    const bra = hit === null ? -1 : ket - hit.length;
    if (hit !== null && p2 <= bra) {
      if (hit === 'end' || hit === 'ung') {
        cut(bra, ket);
        if (endsAt(w, cursor, 'ig') && !endsAt(w, cursor - 2, 'e') && p2 <= cursor - 2) {
          cut(cursor - 2, cursor);
        }
      } else if (hit === 'ig' || hit === 'ik' || hit === 'isch') {
        if (!endsAt(w, bra, 'e')) cut(bra, ket);
      } else if (hit === 'lich' || hit === 'heit') {
        cut(bra, ket);
        const tail = longestSuffix(w, cursor, ['er', 'en']);
        if (tail !== null && p1 <= cursor - tail.length) cut(cursor - tail.length, cursor);
      } else {
        cut(bra, ket);
        const tail = longestSuffix(w, cursor, ['lich', 'ig']);
        if (tail !== null && p2 <= cursor - tail.length) cut(cursor - tail.length, cursor);
      }
    }
  }

  // Block 4 — Genitiv-Apostroph. Ohne R1/R2, aber `not atlimit`.
  {
    const ket = cursor;
    const hit = longestSuffix(w, ket, ["'s", "'sch", "'"]);
    if (hit !== null && ket - hit.length - 1 > 0) cut(ket - hit.length, ket);
  }

  return w.slice(0, cursor);
}

/** Der Stamm nach `algorithms/german.sbl`. */
export function snowballGerman(word: string): string {
  const prepared = prelude(word.toLowerCase());
  const { p1, p2 } = markRegions(prepared);
  const stemmed = standardSuffix(prepared, p1, p2);
  return [...stemmed].map((ch) => POSTLUDE[ch] ?? ch).join('');
}
