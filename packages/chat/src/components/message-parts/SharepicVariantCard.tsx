import { useCallback } from 'react';
import {
  Loader2,
  Pencil,
  Download,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  SquarePen,
  History,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSharepicArtifact } from '../../hooks/useSharepicArtifact';

import type { SharepicVariant } from '../../hooks/useChatGraphStream';

interface SharepicVariantCardProps {
  variant: SharepicVariant;
}

export function SharepicVariantCard({ variant }: SharepicVariantCardProps) {
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
    toggleActive,
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
      <div className="rounded-lg border border-border p-4 text-sm text-foreground-muted">
        Sharepic-Vorschau konnte nicht gerendert werden.
        <button onClick={openInStudio} className="ml-2 text-primary hover:underline">
          Im Editor öffnen
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group/sharepic relative overflow-hidden rounded-lg border bg-background-alt transition-all hover:shadow-md',
        isActiveForChat
          ? 'border-primary ring-1 ring-primary'
          : 'border-border hover:border-primary'
      )}
    >
      <button
        type="button"
        onClick={openInStudio}
        className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={`${label}-Variante im Editor öffnen`}
      >
        <div className="relative">
          {isRendering && !imageBase64 && (
            <div className="flex h-64 items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-foreground-muted" />
                <span className="text-xs text-foreground-muted">Rendere {label}...</span>
              </div>
            </div>
          )}
          {imageBase64 && (
            <img
              src={imageBase64}
              alt={`${label}-Sharepic`}
              className={cn(
                'mx-auto max-h-[420px] w-auto transition-opacity',
                isRendering ? 'opacity-50' : 'opacity-100'
              )}
            />
          )}
          {imageBase64 && !isRendering && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover/sharepic:bg-black/30 group-hover/sharepic:opacity-100">
              <div className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white shadow-lg">
                <ExternalLink className="h-4 w-4" />
                <span>Im Studio öffnen</span>
              </div>
            </div>
          )}
        </div>
      </button>

      {imageBase64 && (
        <div className="flex flex-wrap items-center justify-between gap-1 border-t border-border px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {label}
            </span>
            {isActiveForChat && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-white">
                <SquarePen className="h-3 w-3" />
                Aktiv im Chat
              </span>
            )}
            {showStepper && (
              <span className="inline-flex items-center gap-0.5 text-xs text-foreground-muted">
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
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-primary hover:bg-primary/10"
                aria-label={`Version ${viewVersion} wiederherstellen`}
              >
                <History className="h-3 w-3" />
                <span>Wiederherstellen</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleActive}
              className={cn(
                'flex items-center gap-1 rounded-lg px-2 py-1 text-xs',
                isActiveForChat
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground-muted hover:bg-primary/10 hover:text-foreground'
              )}
              aria-pressed={isActiveForChat}
              aria-label="Diese Variante per Chat bearbeiten"
            >
              <SquarePen className="h-3 w-3" />
              <span>{isActiveForChat ? 'Im Chat aktiv' : 'Im Chat bearbeiten'}</span>
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-foreground-muted hover:bg-primary/10 hover:text-foreground"
              aria-label="Sharepic herunterladen"
            >
              <Download className="h-3 w-3" />
              <span>Herunterladen</span>
            </button>
            <button
              onClick={openInStudio}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-primary hover:bg-primary/10"
              aria-label="Sharepic im Studio bearbeiten"
            >
              <Pencil className="h-3 w-3" />
              <span>Studio</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
