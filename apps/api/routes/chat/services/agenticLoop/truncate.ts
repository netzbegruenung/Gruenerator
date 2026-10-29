/**
 * Safety-net truncation for model-facing tool results.
 *
 * The loop must never let one oversized tool result (a long web page, a big MCP
 * blob) blow the context window. Es kürzt gezielt: nur die größten String-Felder,
 * so weit wie nötig, an einer Absatz- oder Satzgrenze; alles Kleine (IDs, Titel,
 * Hinweise, `error`) bleibt ganz, und `_gekuerzt` nennt, was wie weit gezeigt
 * wird. Passt es auch dann nicht, werden Arrays gekappt, zuletzt kommt eine
 * begrenzte Vorschau. Deliberately generic — search tools already return
 * compact data, so for them this is a no-op.
 */

/** Untergrenze der Kürzung: kein Feld wird je kürzer gezeigt als bei der alten, gleichmäßigen Kürzung (maxChars/8). */
const PER_FIELD_FLOOR = 400;
const MAX_ARRAY_ITEMS = 20;
const TRUNCATION_MARK = '…[gekürzt]';

/**
 * Top-level fields whose producing tool already applied its own char budget.
 *
 * `sources` is the numbered source block from the registry, bounded per source
 * by the registering tool's `snippetChars` and — in split mode, where
 * `renderAll()` rebuilds it — again by SOURCE_BLOCK_CHARS across all sources.
 * Handing it to the generic truncation is not a safety net but a second,
 * dumber cap: the per-field floor is maxChars/8 = 750, so ten sources would collapse into
 * 750 chars TOTAL. In unified mode there is no `renderAll()` later in the turn,
 * so those 750 chars would be the model's entire grounding.
 *
 * What that leaves uncapped is one turn's accumulated `register()` returns in
 * unified mode. Bounded in practice by what a search can produce: the widest is
 * `tiefenrecherche` at ~37.5k chars (3 read pages + 17 snippets), and unified
 * mode is the Mistral lane at 262k tokens — three such calls are ~12 % of it.
 * Split mode, where the smaller lanes live, goes through `renderAll()`.
 *
 * This is why the pre-distillation snippet length of 300 chars was load-bearing
 * by accident: 10 x 300 stayed just under the 6000 ceiling, so the block was
 * never truncated. Raising it without this exemption is a regression, not an
 * improvement.
 */
const PRE_BUDGETED_FIELDS: ReadonlySet<string> = new Set(['sources']);

/** Ein gekürztes Feld: Pfad, Länge vorher, Länge nachher. */
export interface TruncationNote {
  feld: string;
  gesamtZeichen: number;
  gezeigtZeichen: number;
}

/** Ein gekapptes Array: Pfad, Einträge vorher, Einträge nachher. */
export interface ArrayTruncationNote {
  feld: string;
  gesamtEintraege: number;
  gezeigtEintraege: number;
}

type CutNote = TruncationNote | ArrayTruncationNote;

/** Marker am Ergebnis: ein Eintrag als Objekt, mehrere als Liste. */
export const TRUNCATION_FIELD = '_gekuerzt';

/**
 * Ob `truncateResultForModel` etwas gekürzt hat. Liest `_gekuerzt` und das
 * alte `_truncated` (der Vorschau-Rückfall setzt beides).
 */
export function wasShortened(result: unknown): boolean {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return false;
  const r = result as Record<string, unknown>;
  return r[TRUNCATION_FIELD] != null || r._truncated === true;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Ab hier zählt eine Grenze noch als „nah genug am Schnitt", sonst wird hart geschnitten. */
const BOUNDARY_MIN_SHARE = 0.6;
const SENTENCE_END = /[.!?…:](?=\s)/g;

/**
 * Schneidet `text` auf höchstens `level` Zeichen, bevorzugt an einer
 * Absatzgrenze, dann an einem Satzende, dann an einer Zeile, zuletzt am Wort.
 */
function cutText(text: string, level: number): string {
  if (text.length <= level) return text;
  const head = text.slice(0, level);
  const min = Math.floor(level * BOUNDARY_MIN_SHARE);

  const para = head.lastIndexOf('\n\n');
  if (para >= min) return head.slice(0, para).trimEnd();

  let sentence = -1;
  for (const m of head.matchAll(SENTENCE_END)) sentence = m.index + 1;
  if (sentence >= min) return head.slice(0, sentence);

  const line = head.lastIndexOf('\n');
  if (line >= min) return head.slice(0, line).trimEnd();

  const space = head.search(/\s\S*$/);
  if (space >= Math.floor(level * 0.8)) return head.slice(0, space).trimEnd();
  return head;
}

function longestString(value: unknown): number {
  if (typeof value === 'string') return value.length;
  if (Array.isArray(value)) return value.reduce<number>((n, v) => Math.max(n, longestString(v)), 0);
  if (value && typeof value === 'object') {
    return Object.values(value).reduce<number>((n, v) => Math.max(n, longestString(v)), 0);
  }
  return 0;
}

/** Kappt jedes String-Blatt über `level` und sammelt, was dabei gekürzt wurde. */
function shrink(value: unknown, level: number, path: string, notes: CutNote[]): unknown {
  if (typeof value === 'string') {
    if (value.length <= level) return value;
    const cut = cutText(value, level);
    notes.push({ feld: path, gesamtZeichen: value.length, gezeigtZeichen: cut.length });
    return cut + TRUNCATION_MARK;
  }
  if (Array.isArray(value)) {
    return value.map((v, i) => shrink(v, level, `${path}[${i}]`, notes));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = shrink(v, level, path ? `${path}.${k}` : k, notes);
    }
    return out;
  }
  return value;
}

function capArrays(value: unknown, path: string, notes: CutNote[]): unknown {
  if (Array.isArray(value)) {
    const kept = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((v, i) => capArrays(v, `${path}[${i}]`, notes));
    if (value.length > MAX_ARRAY_ITEMS) {
      notes.push({
        feld: path || '(Liste)',
        gesamtEintraege: value.length,
        gezeigtEintraege: MAX_ARRAY_ITEMS,
      });
      kept.push(`…${value.length - MAX_ARRAY_ITEMS} weitere ausgelassen`);
    }
    return kept;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = capArrays(v, path ? `${path}.${k}` : k, notes);
    }
    return out;
  }
  return value;
}

interface Fitted {
  value: unknown;
  notes: CutNote[];
  fits: boolean;
}

/** Das Ergebnis als Objekt, mit `_gekuerzt`, wenn etwas gekürzt wurde. */
function attachMarker(shown: unknown, notes: CutNote[]): Record<string, unknown> {
  const base = Array.isArray(shown) ? { eintraege: shown } : (shown as Record<string, unknown>);
  const marker = notes.length === 0 ? null : notes.length === 1 ? notes[0] : notes;
  return marker ? { ...base, [TRUNCATION_FIELD]: marker } : base;
}

/**
 * Kürzt die String-Blätter von `value` auf die größte Schnitthöhe, bei der das
 * JSON noch in `target` passt (Wasserstand: nur Felder über der Höhe verlieren
 * etwas, das größte zuerst). Nie unter `floor`.
 */
function fitStrings(
  value: unknown,
  target: number,
  floor: number,
  priorNotes: CutNote[] = []
): Fitted {
  const sizeAt = (level: number): Fitted => {
    const notes: CutNote[] = [];
    const shrunk = shrink(value, level, '', notes);
    // Der Marker steht im Ergebnis und zählt zum Platz.
    const size = safeStringify(attachMarker(shrunk, [...priorNotes, ...notes])).length;
    return { value: shrunk, notes, fits: size <= target };
  };
  let hi = longestString(value);
  if (hi <= floor) return sizeAt(floor);
  const atFloor = sizeAt(floor);
  if (!atFloor.fits) return atFloor;
  let lo = floor;
  let best = atFloor;
  while (hi - lo > 8) {
    const mid = Math.floor((lo + hi) / 2);
    const attempt = sizeAt(mid);
    if (attempt.fits) {
      best = attempt;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return best;
}

/**
 * Returns a model-safe version of `value` whose JSON serialization is at most
 * ~`maxChars` — except for {@link PRE_BUDGETED_FIELDS}, which pass through
 * whole because their producing tool already bounded them. Primitives and
 * already-small results pass through untouched.
 *
 * Gekürzt wird nur, was nötig ist: die größten String-Felder, an einer
 * Absatz- oder Satzgrenze, nie unter maxChars/8 je Feld (so viel blieb auch bei
 * der früheren, gleichmäßigen Kürzung). `_gekuerzt` nennt Feld, Gesamt- und
 * gezeigte Länge.
 */
export function truncateResultForModel(
  value: unknown,
  maxChars: number,
  exemptFields: ReadonlySet<string> = PRE_BUDGETED_FIELDS
): unknown {
  if (value == null || typeof value !== 'object') return value;

  const json = safeStringify(value);
  if (json.length <= maxChars) return value;

  // Split off the pre-budgeted fields; only the remainder gets truncated.
  const exempt: Record<string, unknown> = {};
  let rest: unknown = value;
  if (!Array.isArray(value) && exemptFields.size > 0) {
    const others: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (exemptFields.has(k)) exempt[k] = v;
      else others[k] = v;
    }
    if (Object.keys(exempt).length > 0) rest = others;
  }
  const hasExempt = Object.keys(exempt).length > 0;

  const floor = Math.max(PER_FIELD_FLOOR, Math.floor(maxChars / 8));
  // Die ausgenommenen Felder zählen zum Platz, den der Rest nicht mehr hat.
  const target = hasExempt ? Math.max(0, maxChars - safeStringify(exempt).length) : maxChars;

  let fitted = fitStrings(rest, target, floor);
  if (!fitted.fits) {
    // Zeichen allein reichen nicht (viele Einträge): Listen kappen, dann neu.
    const capNotes: CutNote[] = [];
    const capped = capArrays(rest, '', capNotes);
    const again = fitStrings(capped, target, floor, capNotes);
    fitted = { value: again.value, notes: [...capNotes, ...again.notes], fits: again.fits };
  }

  const { [TRUNCATION_FIELD]: marker, ...shown } = attachMarker(fitted.value, fitted.notes);
  const merged = { ...shown, ...exempt, ...(marker ? { [TRUNCATION_FIELD]: marker } : {}) };

  if (hasExempt || fitted.fits) return merged;

  // Keine Feldstruktur, die sich kürzen ließe: begrenzte Vorschau.
  return {
    _truncated: true,
    [TRUNCATION_FIELD]: {
      feld: '(gesamt)',
      gesamtZeichen: json.length,
      gezeigtZeichen: maxChars,
    } satisfies TruncationNote,
    preview: json.slice(0, maxChars),
  };
}
