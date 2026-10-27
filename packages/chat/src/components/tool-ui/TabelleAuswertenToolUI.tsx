'use client';

import { Loader2 } from 'lucide-react';
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

  // Solange kein Ergebnis da ist, gibt es auch keinen Code — nur die Statuszeile.
  // Ein Fehlschlag ist ein Ergebnis und zeigt die Karte mit der Meldung.
  const done = result !== undefined;

  return (
    <div className="my-2">
      {(auftrag || !done) && (
        <p className="flex items-center gap-1.5 px-1 text-xs text-foreground-muted">
          {!done && (
            <Loader2 aria-hidden className="h-3 w-3 flex-shrink-0 animate-spin text-primary" />
          )}
          <span>{auftrag || 'Tabelle wird ausgewertet…'}</span>
        </p>
      )}
      {done && <RunPythonToolUI args={{ code }} result={result} />}
    </div>
  );
});
