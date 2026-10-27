'use client';

import { memo } from 'react';

import { RunPythonToolUI } from './RunPythonToolUI';

interface TabelleAuswertenToolUIProps {
  args: Record<string, unknown>;
  result?: unknown;
}

/**
 * Karte für das Loop-Werkzeug `tabelle_auswerten`: der Auftrag als Statuszeile,
 * darunter dieselbe Karte wie bei `run_python` mit dem erzeugten Code aus dem
 * Ergebnis. Die Zahlen selbst zeigt die `ComputeCard` (SSE `compute`).
 */
export const TabelleAuswertenToolUI = memo(function TabelleAuswertenToolUI({
  args,
  result,
}: TabelleAuswertenToolUIProps) {
  const auftrag = typeof args?.auftrag === 'string' ? args.auftrag : '';
  const code =
    result != null && typeof result === 'object' && 'code' in result
      ? String((result as { code: unknown }).code ?? '')
      : '';

  return (
    <div className="my-2">
      {auftrag && <p className="px-1 text-xs text-foreground-muted">{auftrag}</p>}
      <RunPythonToolUI args={{ code }} result={result} />
    </div>
  );
});
