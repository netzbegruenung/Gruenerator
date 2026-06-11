import { useState, useCallback, useEffect, useRef } from 'react';
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
import { useChatConfigStore } from '../../stores/chatConfigStore';
import { useSharepicLiveStore } from '../../stores/sharepicLiveStore';

import type { SharepicVariant } from '../../hooks/useChatGraphStream';

interface SharepicVariantCardProps {
  variant: SharepicVariant;
}

const FALLBACK_LABELS: Record<string, string> = {
  dreizeilen: 'Dreizeiler',
  'zitat-pure': 'Zitat',
  zitat: 'Zitat',
  info: 'Info',
  simple: 'Sharepic',
  veranstaltung: 'Veranstaltung',
  slider: 'Slider',
  freeform: 'Freeform',
};

interface VersionEntry {
  version: number;
  summary: string | null;
}

/**
 * After a real edit (entry is thumbnail-dirty) the freshly rendered head PNG
 * doubles as the canvas thumbnail. Version previews never qualify, and the
 * flag is cleared up front — a failed upload is not worth a retry loop.
 */
function maybeUploadThumbnail(variantId: string, dataUrl: string, isVersionPreview: boolean) {
  if (isVersionPreview) return;
  const store = useSharepicLiveStore.getState();
  const entry = store.entries[variantId];
  if (!entry?.thumbnailDirty || !entry.canvasId) return;
  const upload = useChatConfigStore.getState().updateSharepicThumbnail;
  if (!upload) return;
  store.clearThumbnailDirty(variantId);
  upload(entry.canvasId, dataUrl).catch((err) => {
    console.warn('[SharepicVariantCard] Thumbnail-Update fehlgeschlagen:', err);
  });
}

export function SharepicVariantCard({ variant }: SharepicVariantCardProps) {
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(true);
  const [renderError, setRenderError] = useState(false);
  const [versions, setVersions] = useState<VersionEntry[] | null>(null);
  /** Version being previewed via the stepper; null = current head. */
  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const [viewState, setViewState] = useState<Record<string, unknown> | null>(null);
  const versionStateCache = useRef(new Map<number, Record<string, unknown>>());
  const hydratedRef = useRef(false);

  const live = useSharepicLiveStore((s) => s.entries[variant.id]);
  const isActiveForChat = useSharepicLiveStore((s) => s.activeVariant?.variantId === variant.id);

  const canvasId = live?.canvasId ?? variant.canvasId ?? null;
  const headVersion = live?.version ?? null;
  const renderInput = viewState ?? live?.state ?? variant.initialProps;

  // Render (and re-render after each chat edit / version step). renderInput
  // is the full flat state — StandaloneCanvas's createInitialState accepts it
  // in place of the original initialProps.
  useEffect(() => {
    let cancelled = false;
    const renderFn = useChatConfigStore.getState().renderSharepic;
    if (!renderFn) {
      setRenderError(true);
      setIsRendering(false);
      return undefined;
    }
    setIsRendering(true);
    renderFn(variant.canvasType, renderInput)
      .then((dataUrl) => {
        if (cancelled) return;
        if (dataUrl) {
          setImageBase64(dataUrl);
          setRenderError(false);
          maybeUploadThumbnail(variant.id, dataUrl, viewState != null);
        } else {
          setRenderError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setRenderError(true);
      })
      .finally(() => {
        if (!cancelled) setIsRendering(false);
      });
    return () => {
      cancelled = true;
    };
  }, [variant.canvasType, variant.id, renderInput, viewState]);

  // Thread-reload rehydration: a minted variant renders its CURRENT state
  // (which may have changed in the studio), not the stale initialProps.
  useEffect(() => {
    if (!canvasId || hydratedRef.current || live?.state) return;
    const fetchState = useChatConfigStore.getState().fetchSharepicState;
    if (!fetchState) return;
    hydratedRef.current = true;
    void fetchState(canvasId).then((result) => {
      if (!result) return;
      useSharepicLiveStore.getState().upsertEntry(variant.id, {
        canvasId,
        canvasType: variant.canvasType,
        version: result.version,
        state: result.state,
      });
    });
  }, [canvasId, live?.state, variant.id, variant.canvasType]);

  // New head version (chat edit applied) → drop any stale version preview.
  useEffect(() => {
    setViewVersion(null);
    setViewState(null);
    setVersions(null);
  }, [headVersion]);

  const loadVersions = useCallback(async (): Promise<VersionEntry[]> => {
    if (versions) return versions;
    const fetchVersions = useChatConfigStore.getState().fetchSharepicVersions;
    if (!canvasId || !fetchVersions) return [];
    const list = await fetchVersions(canvasId).catch(() => []);
    const entries = list.map((v) => ({ version: v.version, summary: v.summary }));
    setVersions(entries);
    return entries;
  }, [canvasId, versions]);

  const stepToVersion = useCallback(
    async (direction: -1 | 1) => {
      if (!canvasId) return;
      const list = await loadVersions();
      if (list.length < 2) return;
      const ordered = [...list].sort((a, b) => a.version - b.version);
      const currentIdx =
        viewVersion == null
          ? ordered.length - 1
          : ordered.findIndex((v) => v.version === viewVersion);
      const nextIdx = Math.min(Math.max(currentIdx + direction, 0), ordered.length - 1);
      const target = ordered[nextIdx];
      if (!target) return;
      if (nextIdx === ordered.length - 1) {
        setViewVersion(null);
        setViewState(null);
        return;
      }
      const cached = versionStateCache.current.get(target.version);
      if (cached) {
        setViewVersion(target.version);
        setViewState(cached);
        return;
      }
      const fetchVersionState = useChatConfigStore.getState().fetchSharepicVersionState;
      if (!fetchVersionState) return;
      const state = await fetchVersionState(canvasId, target.version).catch(() => null);
      if (state) {
        versionStateCache.current.set(target.version, state);
        setViewVersion(target.version);
        setViewState(state);
      }
    },
    [canvasId, loadVersions, viewVersion]
  );

  const handleRestore = useCallback(async () => {
    if (!canvasId || viewVersion == null) return;
    const restore = useChatConfigStore.getState().restoreSharepicVersion;
    if (!restore) return;
    const result = await restore(canvasId, viewVersion).catch(() => null);
    if (result) {
      useSharepicLiveStore.getState().upsertEntry(variant.id, {
        canvasId,
        canvasType: variant.canvasType,
        version: result.version,
        state: result.state,
        thumbnailDirty: true,
      });
    }
  }, [canvasId, viewVersion, variant.id, variant.canvasType]);

  const handleToggleActive = useCallback(() => {
    const store = useSharepicLiveStore.getState();
    if (store.activeVariant?.variantId === variant.id) {
      store.setActiveVariant(null);
    } else {
      store.setActiveVariant({
        variantId: variant.id,
        canvasId,
        canvasType: variant.canvasType,
      });
    }
  }, [variant.id, variant.canvasType, canvasId]);

  const handleDownload = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!imageBase64) return;
      const link = document.createElement('a');
      link.href = imageBase64;
      link.download = `sharepic-${variant.canvasType}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    [imageBase64, variant.canvasType]
  );

  const handleEdit = useCallback(() => {
    useChatConfigStore.getState().onEditSharepic?.({
      ...variant,
      initialProps: live?.state ?? variant.initialProps,
      ...(canvasId ? { canvasId } : {}),
    });
  }, [variant, live?.state, canvasId]);

  const label = variant.label ?? FALLBACK_LABELS[variant.canvasType] ?? 'Sharepic';
  const showStepper = canvasId != null && headVersion != null && headVersion > 1;

  if (renderError) {
    return (
      <div className="rounded-lg border border-border p-4 text-sm text-foreground-muted">
        Sharepic-Vorschau konnte nicht gerendert werden.
        <button onClick={handleEdit} className="ml-2 text-primary hover:underline">
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
        onClick={handleEdit}
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
                onClick={() => void handleRestore()}
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
              onClick={handleToggleActive}
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
              onClick={handleEdit}
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
