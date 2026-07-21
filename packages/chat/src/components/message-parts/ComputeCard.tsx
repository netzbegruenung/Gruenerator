'use client';

import { useEffect, useState } from 'react';
import { Calculator, Download, FileDown } from 'lucide-react';

import { downloadBase64, downloadBlob, mimeFromFilename } from '../../lib/downloadBlob';
import { useChatConfigStore } from '../../stores/chatConfigStore';
import { useComputeExportStore } from '../../stores/computeExportStore';

import type { ComputeData } from '../../hooks/useChatGraphStream';

/**
 * Server compute assets (figures/exports) are AUTHENTICATED endpoints, so they
 * must be fetched with the injected config fetch (cookies on web, Bearer on
 * desktop) — a plain <a href>/<img src> carries no Bearer and fails on
 * desktop. Same pattern as MessageActions' docx export: fetch → blob → save.
 */
async function fetchAssetBlob(url: string): Promise<Blob | null> {
  try {
    const { fetch: configFetch } = useChatConfigStore.getState();
    const response = await configFetch(url, { method: 'GET' });
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

/** Authenticated figure: loads the asset into an object URL. An expired or
 *  unreachable asset (90-day retention, wiped volume) hides itself — same
 *  behavior the plain <img onError> had. */
function ComputeFigure({ url, index }: { url: string; index: number }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    void fetchAssetBlob(url).then((blob) => {
      if (cancelled || !blob) {
        if (!blob) setFailed(true);
        return;
      }
      revoked = URL.createObjectURL(blob);
      setObjectUrl(revoked);
    });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [url]);

  if (failed || !objectUrl) return null;
  return (
    <div className="group relative mb-2">
      <img
        src={objectUrl}
        alt={`Diagramm ${index + 1}`}
        className="max-w-full rounded border border-border"
      />
      {/* Object URLs are local blobs — the download needs no auth anymore. */}
      <a
        href={objectUrl}
        download={`diagramm-${index + 1}.png`}
        className="absolute right-2 top-2 rounded-md border border-border bg-background/90 p-1.5 text-foreground-muted opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
        aria-label={`Diagramm ${index + 1} herunterladen`}
      >
        <Download className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

const CHIP_CLASS =
  'flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10';

/**
 * Inline card for a deterministic calculation (compute intent). Its whole
 * purpose is transparency: the numbers were computed by real code (not guessed
 * by the model), and this card shows the user exactly that — a labelled tool
 * produced the figures. Purely presentational; no panel/store.
 */
export function ComputeCard({ data }: { data: ComputeData }) {
  const [unavailable, setUnavailable] = useState<ReadonlySet<string>>(new Set());

  const handleAssetDownload = async (file: { name: string; url: string }) => {
    // Fresh export: the interpreter just wrote these bytes in THIS browser —
    // serve them directly, no server dependency (asset storage, retention).
    const local = useComputeExportStore.getState().files[file.name];
    if (local) {
      downloadBase64(local, file.name, mimeFromFilename(file.name));
      return;
    }
    // Reloaded thread: fetch the stored asset with the authenticated fetch.
    const blob = await fetchAssetBlob(file.url);
    if (blob) {
      downloadBlob(blob, file.name);
    } else {
      setUnavailable((prev) => new Set(prev).add(file.url));
    }
  };

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
      {/* Server-stored figures (URL, small metadata) — the normal path. */}
      {data.figureUrls?.map((url, i) => (
        <ComputeFigure key={url} url={url} index={i} />
      ))}
      {/* Legacy inline-base64 figures (messages persisted before asset storage). */}
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
      {((data.fileAssets?.length ?? 0) > 0 || (data.files?.length ?? 0) > 0) && (
        <div className="mb-2 flex flex-wrap gap-2">
          {data.fileAssets?.map((file) =>
            unavailable.has(file.url) ? (
              <span
                key={file.url}
                className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground-muted opacity-60"
                title="Die Datei ist auf dem Server nicht mehr verfügbar."
              >
                <FileDown className="h-3.5 w-3.5" />
                {file.name} (nicht mehr verfügbar)
              </span>
            ) : (
              <button
                key={file.url}
                onClick={() => void handleAssetDownload(file)}
                className={CHIP_CLASS}
              >
                <FileDown className="h-3.5 w-3.5 text-primary" />
                {file.name}
              </button>
            )
          )}
          {data.files?.map((file) => (
            <button
              key={file.name}
              onClick={() => downloadBase64(file.b64, file.name, mimeFromFilename(file.name))}
              className={CHIP_CLASS}
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
