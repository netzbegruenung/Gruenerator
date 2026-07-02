/**
 * Parses labelled `print("Label:", value)` stdout lines into a compute-result
 * payload ({ operation, entries, summary }) so browser-computed numbers can be
 * surfaced to the model — either as `computedResult` on the next request
 * (lastComputeStore) or as the `result` of a run_python client-tool resume.
 */

import type { ComputeResult } from '../stores/lastComputeStore';

export function parseComputeResult(operation: string, stdout: string): ComputeResult {
  const lines = stdout.trim().split('\n').filter(Boolean);
  const entries = lines.map((line) => {
    const idx = line.indexOf(':');
    if (idx > 0 && idx < line.length - 1) {
      return { label: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
    }
    return { label: 'Ergebnis', value: line.trim() };
  });
  return {
    operation,
    entries: entries.length > 0 ? entries : [{ label: 'Ergebnis', value: stdout.trim() }],
    summary: stdout.trim(),
  };
}
