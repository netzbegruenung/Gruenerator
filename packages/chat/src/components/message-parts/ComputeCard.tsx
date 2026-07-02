'use client';

import { Calculator, Download, FileDown } from 'lucide-react';

import { downloadBase64, mimeFromFilename } from '../../lib/downloadBlob';

import type { ComputeData } from '../../hooks/useChatGraphStream';

/**
 * Inline card for a deterministic calculation (compute intent). Its whole
 * purpose is transparency: the numbers were computed in plain JS on the server
 * (not guessed by the model), and this card shows the user exactly that — a
 * labelled tool produced the figures. Purely presentational; no panel/store.
 */
export function ComputeCard({ data }: { data: ComputeData }) {
  return (
    <div
      className="my-2 w-full rounded-lg border border-border bg-background p-3"
      role="group"
      aria-label={`Berechnung: ${data.operation}`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Calculator className="h-4 w-4" />
        </span>
        <span className="text-sm font-medium text-foreground">{data.operation}</span>
        <span className="ml-auto text-[11px] uppercase tracking-wide text-foreground-muted">
          exakt berechnet
        </span>
      </div>
      {data.figures?.map((figure, i) => (
        // Index key on purpose: every PNG shares the same base64 prefix
        // (signature + IHDR), so content-slice keys collide.
        // eslint-disable-next-line react/no-array-index-key
        <div key={i} className="group relative mb-2">
          <img
            src={`data:image/png;base64,${figure}`}
            alt={`Diagramm ${i + 1}`}
            className="max-w-full rounded border border-border"
          />
          <button
            onClick={() => downloadBase64(figure, `diagramm-${i + 1}.png`, 'image/png')}
            className="absolute right-2 top-2 rounded-md border border-border bg-background/90 p-1.5 text-foreground-muted opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
            aria-label={`Diagramm ${i + 1} herunterladen`}
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {data.files && data.files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {data.files.map((file) => (
            <button
              key={file.name}
              onClick={() => downloadBase64(file.b64, file.name, mimeFromFilename(file.name))}
              className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10"
            >
              <FileDown className="h-3.5 w-3.5 text-primary" />
              {file.name}
            </button>
          ))}
        </div>
      )}
      <dl className="divide-y divide-border/60">
        {data.entries.map((entry, i) =>
          // Collapsed tabular output (pivot tables, df prints) lands as one
          // multi-line value — render it as a block, not a squashed dd row.
          entry.value.includes('\n') || entry.value.length > 120 ? (
            <div key={`${entry.label}-${i}`} className="py-1">
              <dt className="mb-1 text-xs text-foreground-muted">{entry.label}</dt>
              <dd>
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-foreground">
                  {entry.value}
                </pre>
              </dd>
            </div>
          ) : (
            <div
              key={`${entry.label}-${i}`}
              className="flex items-baseline justify-between gap-3 py-1"
            >
              <dt className="min-w-0 truncate text-xs text-foreground-muted">{entry.label}</dt>
              <dd className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                {entry.value}
              </dd>
            </div>
          )
        )}
      </dl>
    </div>
  );
}
