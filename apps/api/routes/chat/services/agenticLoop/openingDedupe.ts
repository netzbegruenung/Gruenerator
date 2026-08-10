/**
 * Deduplication of the split-mode opening sentence.
 *
 * Since the narration wall came down (#2418), the planner's FIRST narration
 * sentence streams as real answer text before any tool card. The synth is told
 * via prompt that this sentence is already on screen — but the small synth
 * lanes routinely restate it anyway, and the user reads "Hallo zusammen, Hallo
 * zusammen, …" / a doubled "Betreff:" line. A prompt instruction cannot secure
 * an output invariant, so this module enforces it deterministically: if the
 * synth's answer BEGINS with the already-emitted opening sentence, that prefix
 * is dropped before it reaches the wire and the persisted text.
 *
 * Matching is whitespace-run- and case-insensitive, and tolerates a short run
 * of markdown decoration (`**`, `#`, `>`) around the duplicate — the synth
 * likes to bold the very line it repeats. The strip only commits once real
 * content FOLLOWS the duplicate: an answer that IS just the opening sentence
 * (steps=0, one-line answer) must survive untouched, otherwise the empty-text
 * fallback would replace a correct answer with an apology.
 */

const LEADING_DECORATION_RE = /^[\s#*_>-]{0,12}/;

type PrefixMatch = { kind: 'mismatch' } | { kind: 'partial' } | { kind: 'matched'; end: number };

const isWs = (ch: string): boolean => /\s/.test(ch);

/**
 * Does `buffer` start with `opening` (modulo whitespace runs, case and a bit of
 * markdown decoration)? `partial` means the buffer is still a strict prefix of
 * a possible match — the caller should wait for more deltas before deciding.
 */
export function matchOpeningPrefix(buffer: string, opening: string): PrefixMatch {
  let i = LEADING_DECORATION_RE.exec(buffer)?.[0].length ?? 0;
  let j = 0;
  while (j < opening.length) {
    if (isWs(opening[j])) {
      while (j < opening.length && isWs(opening[j])) j++;
      if (i >= buffer.length) return { kind: 'partial' };
      if (!isWs(buffer[i])) return { kind: 'mismatch' };
      while (i < buffer.length && isWs(buffer[i])) i++;
      continue;
    }
    if (i >= buffer.length) return { kind: 'partial' };
    if (buffer[i].toLowerCase() !== opening[j].toLowerCase()) return { kind: 'mismatch' };
    i++;
    j++;
  }
  // Consume ONLY what still belongs to the duplicate: its closing emphasis
  // (`**`/`_`, directly attached, max 3 chars) and the whitespace after it.
  // Nothing beyond — an unbounded `[\s*_#]` sweep here ate the `#` of a real
  // heading and the opening `**` of a `**Betreff:**` label that START the
  // actual answer ("**Opening.**\n\n**Betreff:** …" must keep its bold).
  let emphasis = 0;
  while (i < buffer.length && emphasis < 3 && /[*_]/.test(buffer[i])) {
    i++;
    emphasis++;
  }
  while (i < buffer.length && isWs(buffer[i])) i++;
  return { kind: 'matched', end: i };
}

/** One-shot variant for already-complete text (retry replacements). */
export function stripDuplicatedOpening(text: string, opening: string | null): string {
  if (!opening) return text;
  const m = matchOpeningPrefix(text, opening);
  if (m.kind !== 'matched') return text;
  const rest = text.slice(m.end);
  return rest.trim().length > 0 ? rest : text;
}

/**
 * Streaming wrapper around `emit`. Buffers the head of the answer only while a
 * duplicate is still possible; the moment the stream diverges from the opening
 * (or no opening was ever narrated) every delta passes straight through.
 * `flush()` releases whatever is still held — call it when the stream ends,
 * including on error paths, so buffered real text is never lost.
 */
export function createOpeningDedupe(
  getOpening: () => string | null,
  emit: (delta: string) => void
): { push(delta: string): void; flush(): void } {
  let passthrough = false;
  let buf = '';

  const decide = (final: boolean): void => {
    const opening = getOpening();
    if (!opening) {
      emit(buf);
      buf = '';
      passthrough = true;
      return;
    }
    const m = matchOpeningPrefix(buf, opening);
    if (m.kind === 'mismatch') {
      emit(buf);
      buf = '';
      passthrough = true;
      return;
    }
    if (m.kind === 'matched') {
      const rest = buf.slice(m.end);
      if (rest.trim().length > 0) {
        emit(rest);
        buf = '';
        passthrough = true;
        return;
      }
      // Duplicate matched but nothing follows yet — keep holding: if the
      // stream ends here, the "answer" was only the opening and must ship.
    }
    if (final && buf.length > 0) {
      emit(buf);
      buf = '';
    }
  };

  return {
    push(delta: string): void {
      if (!delta) return;
      if (passthrough) {
        emit(delta);
        return;
      }
      buf += delta;
      decide(false);
    },
    flush(): void {
      if (!passthrough && buf.length > 0) decide(true);
      buf = '';
      passthrough = true;
    },
  };
}
