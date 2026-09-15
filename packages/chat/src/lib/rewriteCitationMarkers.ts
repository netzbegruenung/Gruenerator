/**
 * Rewrites `[N]` / `[N, M]` citation markers to `<citation n="…">` custom
 * elements, for the Streamdown rendering path (StreamdownMarkdownText). Runs
 * inside `preprocess`, BEFORE markdown parsing — the parser then sees raw
 * inline HTML, which Streamdown passes through `allowedTags` to the
 * `citation` component (CitationMarker → CitationBadge).
 *
 * Semantics mirror `citationProcessing.ts` (the react-markdown path), which
 * only ever rendered badges in prose (p/li/td overrides) and never inside
 * code: markers in fenced code blocks and inline code spans are copied
 * verbatim, not rewritten. Out-of-range ids (> 999) are dropped from a group;
 * a group whose ids are ALL out of range stays literal text.
 *
 * Scanner style follows normalizeMathDelimiters.ts: `indexOf`-based, no
 * nested quantifiers — every streamed assistant token runs through here, so
 * regex backtracking on unbalanced input (CodeQL js/polynomial-redos) is out.
 */
const CITATION_MARKER_RE = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
const MAX_CITATION_ID = 999;

function rewriteMarkersInText(segment: string): string {
  return segment.replace(CITATION_MARKER_RE, (match, ids: string) => {
    const renderable = ids
      .split(',')
      .map((n) => parseInt(n, 10))
      .filter((id) => id >= 1 && id <= MAX_CITATION_ID);
    if (renderable.length === 0) return match;
    return renderable.map((id) => `<citation n="${id}"></citation>`).join('');
  });
}

/**
 * Finds the end of the code span/fence opened by a run of `ch` with length
 * `minRun`: the next run of the same char at least as long. Returns the index
 * just past the closing run, or -1 when unclosed.
 */
function findClosingRun(text: string, from: number, ch: string, minRun: number): number {
  let cursor = from;
  for (;;) {
    const idx = text.indexOf(ch, cursor);
    if (idx === -1) return -1;
    let run = 1;
    while (idx + run < text.length && text[idx + run] === ch) run++;
    if (run >= minRun) return idx + run;
    cursor = idx + run;
  }
}

export function rewriteCitationMarkers(text: string): string {
  let out = '';
  let cursor = 0;
  const len = text.length;

  while (cursor < len) {
    const nextBacktick = text.indexOf('`', cursor);
    const nextTilde = text.indexOf('~', cursor);
    const next =
      nextBacktick === -1
        ? nextTilde
        : nextTilde === -1
          ? nextBacktick
          : Math.min(nextBacktick, nextTilde);

    if (next === -1) {
      out += rewriteMarkersInText(text.slice(cursor));
      break;
    }

    const ch = text[next];
    let run = 1;
    while (next + run < len && text[next + run] === ch) run++;

    // GFM strikethrough (`~~`) and lone tildes are prose, not code.
    if (ch === '~' && run < 3) {
      out += rewriteMarkersInText(text.slice(cursor, next + run));
      cursor = next + run;
      continue;
    }

    // Backtick run (inline code / fence) or tilde fence: rewrite the prose
    // before it, copy the code span verbatim.
    out += rewriteMarkersInText(text.slice(cursor, next));
    const close = findClosingRun(text, next + run, ch, run);
    if (close === -1) {
      out += text.slice(next);
      break;
    }
    out += text.slice(next, close);
    cursor = close;
  }

  return out;
}
