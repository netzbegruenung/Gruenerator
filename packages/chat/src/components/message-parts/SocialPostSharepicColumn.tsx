import { useCallback, useEffect, useState } from 'react';
import { Button } from '@gruenerator/ui';
import { ChevronLeft, ChevronRight, Download, ExternalLink, History, Loader2 } from 'lucide-react';

import { useSharepicArtifact } from '../../hooks/useSharepicArtifact';
import { cn } from '../../lib/utils';
import { useSharepicLiveStore } from '../../stores/sharepicLiveStore';

import { SharepicVariantThumb } from './SharepicVariantStack';

import type { SharepicData, SharepicVariant } from '../../hooks/useChatGraphStream';

/**
 * Compact sharepic column for the combined SocialPostCard: hero preview,
 * mini-thumbnail switcher and the primary actions stacked into a narrow
 * side column instead of a full-width SharepicVariantStack embed.
 */
export function SocialPostSharepicColumn({ data }: { data: SharepicData }) {
  const variants = data.variants ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeVariantId = useSharepicLiveStore((s) => s.activeVariant?.variantId ?? null);

  // Activating a variant for chat editing (panel / post toggle) pulls it into
  // the hero slot so column and docked panel show the same artifact.
  const activeIsOwn = activeVariantId != null && variants.some((v) => v.id === activeVariantId);
  useEffect(() => {
    if (activeIsOwn) setSelectedId(activeVariantId);
  }, [activeIsOwn, activeVariantId]);

  const selected = variants.find((v) => v.id === selectedId) ?? variants[0];
  if (!selected) return null;

  const thumbs =
    variants.length > 1 ? (
      <div
        className="grid grid-cols-3 gap-1.5"
        role="group"
        aria-label={`${variants.length} Sharepic-Varianten`}
      >
        {variants.map((variant) => (
          <SharepicVariantThumb
            key={variant.id}
            variant={variant}
            isSelected={variant.id === selected.id}
            onSelect={() => setSelectedId(variant.id)}
            className="w-full"
          />
        ))}
      </div>
    ) : null;

  return <SharepicColumnContent key={selected.id} variant={selected} thumbs={thumbs} />;
}

function SharepicColumnContent({
  variant,
  thumbs,
}: {
  variant: SharepicVariant;
  thumbs: React.ReactNode;
}) {
  const {
    imageBase64,
    isRendering,
    renderError,
    headVersion,
    viewVersion,
    isActiveForChat,
    showStepper,
    label,
    stepToVersion,
    restoreViewVersion,
    download,
    openInStudio,
  } = useSharepicArtifact(variant);

  const handleDownload = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      download();
    },
    [download]
  );

  if (renderError) {
    return (
      <div className="flex flex-col gap-2">
        <div className="rounded-lg border border-border p-3 text-xs text-foreground-muted">
          Sharepic-Vorschau konnte nicht gerendert werden.
          <button onClick={openInStudio} className="ml-1 text-primary hover:underline">
            Im Editor öffnen
          </button>
        </div>
        {thumbs}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={openInStudio}
        className={cn(
          'group/hero relative block w-full overflow-hidden rounded-lg border text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          isActiveForChat ? 'border-primary ring-1 ring-primary' : 'border-border'
        )}
        aria-label={`${label}-Variante im Editor öffnen`}
      >
        {imageBase64 ? (
          <img
            src={imageBase64}
            alt={`${label}-Sharepic`}
            className={cn(
              'aspect-[4/5] w-full object-cover transition-opacity',
              isRendering ? 'opacity-50' : 'opacity-100'
            )}
          />
        ) : (
          <span className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 bg-background text-foreground-muted">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-xs">Rendere {label}...</span>
          </span>
        )}
        {imageBase64 && !isRendering && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover/hero:bg-black/30 group-hover/hero:opacity-100">
            <span className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-white shadow-lg">
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Im Studio öffnen</span>
            </span>
          </span>
        )}
      </button>

      {thumbs}

      {(showStepper || viewVersion != null) && (
        <div className="flex flex-wrap items-center gap-1 text-xs text-foreground-muted">
          {showStepper && (
            <span className="inline-flex items-center gap-0.5">
              <button
                onClick={() => void stepToVersion(-1)}
                className="rounded p-0.5 hover:bg-primary/10 hover:text-foreground"
                aria-label="Vorherige Version anzeigen"
              >
                <ChevronLeft className="h-3 w-3" />
              </button>
              v{viewVersion ?? headVersion}/{headVersion}
              <button
                onClick={() => void stepToVersion(1)}
                className="rounded p-0.5 hover:bg-primary/10 hover:text-foreground"
                aria-label="Nächste Version anzeigen"
              >
                <ChevronRight className="h-3 w-3" />
              </button>
            </span>
          )}
          {viewVersion != null && (
            <button
              onClick={() => void restoreViewVersion()}
              className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-primary hover:bg-primary/10"
              aria-label={`Version ${viewVersion} wiederherstellen`}
            >
              <History className="h-3 w-3" />
              <span>Wiederherstellen</span>
            </button>
          )}
        </div>
      )}

      <div className="flex gap-1.5">
        <Button
          variant="brand"
          size="brand-sm"
          className="flex-1"
          onClick={handleDownload}
          disabled={!imageBase64}
          aria-label="Sharepic herunterladen"
        >
          <Download />
          Herunterladen
        </Button>
        <Button
          variant="brand-outline"
          size="brand-sm"
          className="flex-1"
          onClick={openInStudio}
          aria-label="Sharepic im Studio bearbeiten"
        >
          Studio
        </Button>
      </div>
    </div>
  );
}
