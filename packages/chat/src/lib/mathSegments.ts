/**
 * Split normalized message text into markdown and math segments so native
 * platforms (no rehype-katex) can interleave their markdown renderer with a
 * KaTeX WebView per math segment.
 *
 * Input must already be normalized via `normalizeMathDelimiters` +
 * `normalizeUnicodeMath` (backslash delimiters → dollar forms, Unicode
 * operators → LaTeX commands).
 *
 * Streaming safety: an UNCLOSED `$$` keeps the tail as one markdown segment
 * (raw text until the closing delimiter streams in). Closed segments are an
 * append-only prefix of the result, so content-keyed math views mount once
 * and never re-render mid-stream — only the trailing segment changes.
 */

export type MathSegment =
  /** Plain markdown — render with the platform markdown renderer. */
  | { kind: 'markdown'; content: string }
  /** Bare TeX from a `$$…$$` block — render with displayMode. */
  | { kind: 'math-display'; content: string }
  /** A paragraph mixing prose and closed inline `$…$` math — render with an
   *  auto-render pass over the whole paragraph. */
  | { kind: 'math-paragraph'; content: string };

/**
 * True when the paragraph contains at least one CLOSED inline `$…$` span whose
 * body doesn't touch whitespace at either delimiter (remark-math's rule) —
 * this keeps prices like "5$ und 10$" or "US$ 5" out of the math path.
 * Implemented without lookbehind for Hermes compatibility.
 */
function hasClosedInlineMath(paragraph: string): boolean {
  const re = /\$([^$\n]+?)\$/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(paragraph)) !== null) {
    const inner = match[1];
    if (inner && !/^\s/.test(inner) && !/\s$/.test(inner)) return true;
  }
  return false;
}

function pushProse(prose: string, out: MathSegment[]): void {
  for (const paragraph of prose.split(/\n{2,}/)) {
    if (!paragraph.trim()) continue;
    if (hasClosedInlineMath(paragraph)) {
      out.push({ kind: 'math-paragraph', content: paragraph.trim() });
    } else {
      out.push({ kind: 'markdown', content: paragraph });
    }
  }
}

export function splitMathSegments(text: string): MathSegment[] {
  const raw: MathSegment[] = [];
  let rest = text;
  // Display blocks first ($$…$$, spans newlines). An opening $$ without a
  // closing one is the streaming tail — keep it as raw prose.
  for (;;) {
    const open = rest.indexOf('$$');
    const close = open === -1 ? -1 : rest.indexOf('$$', open + 2);
    if (open === -1 || close === -1) {
      pushProse(rest, raw);
      break;
    }
    pushProse(rest.slice(0, open), raw);
    const body = rest.slice(open + 2, close).trim();
    if (body) raw.push({ kind: 'math-display', content: body });
    rest = rest.slice(close + 2);
  }
  // Merge adjacent markdown paragraphs back together so the number of native
  // views stays minimal (one Markdown per run of plain prose).
  const merged: MathSegment[] = [];
  for (const segment of raw) {
    const prev = merged[merged.length - 1];
    if (prev && prev.kind === 'markdown' && segment.kind === 'markdown') {
      prev.content += `\n\n${segment.content}`;
    } else {
      merged.push(segment);
    }
  }
  return merged;
}
