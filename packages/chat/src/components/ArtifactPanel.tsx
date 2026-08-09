'use client';

import { ARTIFACT_TYPE_META, subtypeToArtifactKind } from '@gruenerator/shared/docs';
import { Code2, Download, ExternalLink, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';

import { useArtifactLiveStore } from '../stores/artifactLiveStore';
import { useChatConfigStore } from '../stores/chatConfigStore';

/**
 * Namespaced postMessage type the docked document iframe listens for (see
 * SheetsEditorPage's embedded-mode listener). Same-origin only — the iframe is
 * always our own `/office/:id` route, never third-party.
 */
const EDITOR_OPS_MESSAGE_SOURCE = 'gruenerator-artifact-panel';

// Sandbox + CSP, honestly: `sandbox="allow-scripts"` WITHOUT allow-same-origin
// keeps the iframe on an opaque/null origin — scripts DO run, but they cannot
// reach `window.parent`, cookies, or our origin's storage. The CSP closes the
// remaining network exits: connect-src 'none' (no fetch/XHR/WebSocket) and
// img-src limited to `data:` — no `https:`, because an arbitrary HTTPS GET via
// an <img> beacon would let a script exfiltrate artifact content. NOT blocked:
// the iframe can still navigate itself via plain links (sandbox permits
// self-navigation), which leaks at most the clicked URL, not page content.
const ARTIFACT_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";

/** Document previews go into a NON-sandboxed same-origin iframe, so only
 *  server-built relative `/office/:id` paths may ever reach it. Rejects `//`
 *  and `/\` second chars — browsers treat both as scheme-relative URLs. */
const isRelativeUrl = (url: string) => url.startsWith('/') && url[1] !== '/' && url[1] !== '\\';

/**
 * Docked right-rail view of the active artifact. Two variants:
 *  - generic HTML/SVG the model authored — mirrors SharepicArtifactPanel's
 *    docking UX, rendered inside a sandboxed iframe that allows inline
 *    scripts (`sandbox="allow-scripts"`, deliberately without
 *    `allow-same-origin`) so live/interactive artifacts work — see the
 *    ARTIFACT_CSP comment for what that combination does and doesn't block.
 *  - a generated document (sheet/presentation/doc) — a plain, unsandboxed
 *    iframe at its own `/office/:id` editor route, same origin as the app.
 * Renders nothing while no artifact is active; hosts decide where to dock it.
 */
export function ArtifactPanel({ className }: { className?: string }) {
  const active = useArtifactLiveStore((s) => s.activeArtifact);
  const isDocument = active?.type === 'document';
  const documentIframeRef = useRef<HTMLIFrameElement>(null);

  // Tell the cards a panel exists — without one, "öffnen" writes to the store
  // and nothing visible happens, so they fall back to a plain link.
  useEffect(() => {
    useArtifactLiveStore.getState().setPanelMounted(true);
    return () => useArtifactLiveStore.getState().setPanelMounted(false);
  }, []);

  // Relay `editor_operations` (planned by a chat-driven edit, e.g. edit_sheet)
  // into the docked document iframe — a separate JS realm the outer page's SSE
  // stream can't reach directly. Registering into the SAME useChatConfigStore
  // instance parseSSEStream reads from means: sheet open here → relayed via
  // postMessage; nothing docked (or docked on something else) → falls through
  // to parseSSEStream's existing "no handler registered" warning, unchanged.
  const activeDocumentId = active?.type === 'document' ? active.documentId : null;
  useEffect(() => {
    if (!activeDocumentId) return;
    return useChatConfigStore.getState().registerEditorOpsHandler(activeDocumentId, (payload) => {
      documentIframeRef.current?.contentWindow?.postMessage(
        { source: EDITOR_OPS_MESSAGE_SOURCE, payload },
        window.location.origin
      );
    });
  }, [activeDocumentId]);

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

  // The docked panel is a glance-sized preview, not the full workspace — the
  // editor's own topbar (title/back/share) is redundant with the header this
  // panel already renders below. `embedded=true` is the editor pages' own
  // opt-in to drop that chrome (see DocsEditorPage's `isEmbedded`); the "open
  // in new tab" link deliberately omits it so the full editor is one click
  // away.
  const embeddedUrl = isDocument
    ? `${active.url}${active.url.includes('?') ? '&' : '?'}embedded=true`
    : '';

  return (
    <aside
      className={
        className ??
        'flex w-[var(--gr-artifact-panel-width,24rem)] shrink-0 flex-col overflow-hidden border-l border-border bg-background-alt'
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
          isRelativeUrl(active.url) ? (
            <iframe
              ref={documentIframeRef}
              title={active.title}
              src={embeddedUrl}
              className="h-full w-full border-0"
            />
          ) : (
            <p className="p-4 text-sm text-foreground-muted">
              <a
                href={active.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                Dokument in neuem Tab öffnen
              </a>
            </p>
          )
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
