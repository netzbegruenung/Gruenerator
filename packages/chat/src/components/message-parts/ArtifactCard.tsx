'use client';

import { Code2, ExternalLink } from 'lucide-react';

import { useArtifactLiveStore, type ActiveArtifact } from '../../stores/artifactLiveStore';

/**
 * Inline chat card for a generated artifact. The docked ArtifactPanel scrolls
 * away during a long conversation; clicking this card re-opens the artifact in
 * the panel (mirrors how SharepicVariantCard re-activates a sharepic).
 */
export function ArtifactCard({ artifact }: { artifact: ActiveArtifact }) {
  const activeId = useArtifactLiveStore((s) => s.activeArtifact?.id);
  const isOpen = activeId === artifact.id;

  return (
    <button
      onClick={() => useArtifactLiveStore.getState().setActiveArtifact(artifact)}
      className="my-2 flex w-full items-center gap-3 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-primary hover:bg-primary/5"
      aria-label={`Artefakt "${artifact.title}" im Panel öffnen`}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Code2 className="h-5 w-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-foreground">{artifact.title}</span>
        <span className="text-xs text-foreground-muted">
          {artifact.type === 'svg' ? 'SVG-Grafik' : 'HTML-Artefakt'}
          {isOpen ? ' · geöffnet' : ''}
        </span>
      </span>
      <ExternalLink className="h-4 w-4 shrink-0 text-foreground-muted" />
    </button>
  );
}
