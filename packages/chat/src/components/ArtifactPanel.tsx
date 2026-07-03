'use client';

import { useMemo } from 'react';
import { Code2, Download, X } from 'lucide-react';

import { useArtifactLiveStore } from '../stores/artifactLiveStore';

/**
 * Docked right-rail view of the generic artifact (HTML/SVG) the user is looking
 * at. Mirrors SharepicArtifactPanel's docking UX, but renders arbitrary
 * model-authored markup — so it does so inside a fully locked-down sandboxed
 * iframe (`sandbox=""`: no scripts, no same-origin, no forms). Renders nothing
 * while no artifact is active; hosts decide where to dock it.
 */
export function ArtifactPanel({ className }: { className?: string }) {
  const active = useArtifactLiveStore((s) => s.activeArtifact);

  // Wrap the artifact in a minimal, self-contained HTML document. SVG is
  // centered; HTML is rendered as-is. The document is fed via srcDoc into a
  // sandboxed iframe, so any <script>/onload the model slipped in cannot run.
  const srcDoc = useMemo(() => {
    if (!active) return '';
    const body =
      active.type === 'svg'
        ? `<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;padding:12px;box-sizing:border-box">${active.content}</div>`
        : active.content;
    // No <base target="_blank">: under sandbox="" link navigation/window.open
    // is blocked anyway, so it would be a dead, misleading attribute.
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0;font-family:system-ui,sans-serif;color:#1a1a1a}img,svg{max-width:100%;height:auto}</style></head><body>${body}</body></html>`;
  }, [active]);

  if (!active) return null;

  const close = () => useArtifactLiveStore.getState().setActiveArtifact(null);

  const download = () => {
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
            {active.type === 'svg' ? 'SVG' : 'HTML'}
          </span>
          <span className="truncate text-sm font-medium text-foreground">{active.title}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={download}
            className="rounded p-1 text-foreground-muted hover:bg-primary/10 hover:text-foreground"
            aria-label="Artefakt herunterladen"
          >
            <Download className="h-4 w-4" />
          </button>
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
        <iframe
          title={active.title}
          srcDoc={srcDoc}
          sandbox=""
          className="h-full w-full border-0"
        />
      </div>

      <p className="border-t border-border px-3 py-2 text-xs text-foreground-muted">
        Beschreibe Änderungen einfach im Chat — z.B. „mach den Hintergrund grün".
      </p>
    </aside>
  );
}
