'use client';

import { ARTIFACT_TYPE_META, subtypeToArtifactKind } from '@gruenerator/shared/docs';
import { Code2, Download, ExternalLink, X } from 'lucide-react';
import { useMemo } from 'react';

import { useArtifactLiveStore } from '../stores/artifactLiveStore';

// No allow-same-origin: paired with allow-scripts this keeps the iframe on a
// permanently opaque/null origin, so a script inside the artifact can never
// reach `window.parent`, read cookies, or touch our own origin's storage.
const ARTIFACT_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";

/**
 * Docked right-rail view of the active artifact. Two variants:
 *  - generic HTML/SVG the model authored — mirrors SharepicArtifactPanel's
 *    docking UX, rendered inside a sandboxed iframe that allows inline
 *    scripts (`sandbox="allow-scripts"`, deliberately without
 *    `allow-same-origin`) so live/interactive artifacts work, while a CSP
 *    meta tag blocks network egress, nested iframes, and non-inline script
 *    sources from inside that sandbox.
 *  - a generated document (sheet/presentation/doc) — a plain, unsandboxed
 *    iframe at its own `/office/:id` editor route, same origin as the app.
 * Renders nothing while no artifact is active; hosts decide where to dock it.
 */
export function ArtifactPanel({ className }: { className?: string }) {
  const active = useArtifactLiveStore((s) => s.activeArtifact);
  const isDocument = active?.type === 'document';

  // Wrap the artifact in a minimal, self-contained HTML document. SVG is
  // centered; HTML is rendered as-is. The document is fed via srcDoc into the
  // sandboxed iframe above; the CSP meta tag is the actual script/network
  // fence, not the sandbox attribute alone. Document previews skip this
  // entirely — they iframe the real (same-origin, trusted) editor route.
  const srcDoc = useMemo(() => {
    if (!active || active.type === 'document') return '';
    const body =
      active.type === 'svg'
        ? `<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;padding:12px;box-sizing:border-box">${active.content}</div>`
        : active.content;
    // No <base target="_blank">: link navigation/window.open still has no
    // same-origin browsing context to escape into, so it would be a dead,
    // misleading attribute.
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${ARTIFACT_CSP}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0;font-family:system-ui,sans-serif;color:#1a1a1a}img,svg{max-width:100%;height:auto}</style></head><body>${body}</body></html>`;
  }, [active]);

  if (!active) return null;

  const close = () => useArtifactLiveStore.getState().setActiveArtifact(null);

  const download = () => {
    if (active.type === 'document') return;
    const mime = active.type === 'svg' ? 'image/svg+xml' : 'text/html';
    const ext = active.type === 'svg' ? 'svg' : 'html';
    const blob = new Blob([active.content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${active.title || 'artefakt'}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const badge = isDocument
    ? ARTIFACT_TYPE_META[subtypeToArtifactKind(active.subtype)].label
    : active.type === 'svg'
      ? 'SVG'
      : 'HTML';

  return (
    <aside
      className={
        className ??
        'flex w-[24rem] shrink-0 flex-col overflow-hidden border-l border-border bg-background-alt'
      }
      aria-label={`Aktives Artefakt: ${active.title}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-white">
            <Code2 className="h-3 w-3" />
            {badge}
          </span>
          <span className="truncate text-sm font-medium text-foreground">{active.title}</span>
        </div>
        <div className="flex items-center gap-1">
          {isDocument ? (
            <a
              href={active.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded p-1 text-foreground-muted hover:bg-primary/10 hover:text-foreground"
              aria-label="In neuem Tab öffnen"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : (
            <button
              onClick={download}
              className="rounded p-1 text-foreground-muted hover:bg-primary/10 hover:text-foreground"
              aria-label="Artefakt herunterladen"
            >
              <Download className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={close}
            className="rounded p-1 text-foreground-muted hover:bg-primary/10 hover:text-foreground"
            aria-label="Artefakt schließen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-white">
        {isDocument ? (
          <iframe title={active.title} src={active.url} className="h-full w-full border-0" />
        ) : (
          <iframe
            title={active.title}
            srcDoc={srcDoc}
            sandbox="allow-scripts"
            className="h-full w-full border-0"
          />
        )}
      </div>

      {!isDocument && (
        <p className="border-t border-border px-3 py-2 text-xs text-foreground-muted">
          Beschreibe Änderungen einfach im Chat — z.B. „mach den Hintergrund grün".
        </p>
      )}
    </aside>
  );
}
