/**
 * Parses labelled `print("Label:", value)` stdout lines into a compute-result
 * payload ({ operation, entries, summary }) so browser-computed numbers can be
 * surfaced to the model — either as `computedResult` on the next request
 * (lastComputeStore) or as the `result` of a run_python client-tool resume.
 */

import type { ComputeResult } from '../stores/lastComputeStore';

/** Caps for figures travelling with the run_python resume payload: they end up
 *  as base64 in the message metadata (generatedImage pattern), so both count
 *  and per-figure size stay bounded. */
export const MAX_FIGURES = 3;
export const MAX_FIGURE_BASE64_LENGTH = 1_500_000;

export function capFigures(figures: string[]): string[] {
  return figures.filter((f) => f.length <= MAX_FIGURE_BASE64_LENGTH).slice(0, MAX_FIGURES);
}

/** Same idea for exported files: they also persist as base64 in the message
 *  metadata, so count and size stay tight. Oversized exports are dropped —
 *  the session-local CodeOutput still offers them for download. */
export const MAX_COMPUTE_FILES = 2;
export const MAX_COMPUTE_FILE_BASE64_LENGTH = 2_000_000;

export function capComputeFiles(
  files: Array<{ name: string; base64: string }>
): Array<{ name: string; b64: string }> {
  return files
    .filter((f) => f.base64.length <= MAX_COMPUTE_FILE_BASE64_LENGTH)
    .slice(0, MAX_COMPUTE_FILES)
    .map((f) => ({ name: f.name, b64: f.base64 }));
}

export function parseComputeResult(operation: string, stdout: string): ComputeResult {
  const summary = stdout.trim();
  const lines = summary.split('\n').filter(Boolean);
  let unlabelled = 0;
  const entries = lines.map((line) => {
    const idx = line.indexOf(':');
    if (idx > 0 && idx < line.length - 1) {
      return { label: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
    }
    unlabelled++;
    return { label: 'Ergebnis', value: line.trim() };
  });
  // Tabular/multi-line output (pivot tables, df prints) is mostly unlabelled —
  // keep it as ONE entry instead of a card row per line.
  if (entries.length === 0 || unlabelled > entries.length / 2) {
    return { operation, entries: [{ label: 'Ergebnis', value: summary }], summary };
  }
  return { operation, entries, summary };
}
