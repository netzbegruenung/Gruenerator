'use client';

import { useMemo } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@gruenerator/ui';
import { SOCIAL_PLATFORM_INFO } from '@gruenerator/contracts';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  History,
  Loader2,
  Pencil,
  SquarePen,
  X,
} from 'lucide-react';
import { useCallback, useState } from 'react';

import { useSharepicArtifact } from '../hooks/useSharepicArtifact';
import { useSliderDeckArtifact } from '../hooks/useSliderDeckArtifact';
import { useSharepicLiveStore, type ActiveSharepic } from '../stores/sharepicLiveStore';
import { useSocialPostLiveStore } from '../stores/socialPostLiveStore';

import type { SharepicVariant } from '../hooks/useChatGraphStream';
import type { SocialPostPayload } from '@gruenerator/contracts';
import type { ReactNode } from 'react';

/**
 * Docked right-rail artifact view of the sharepic the user marked "active for
 * chat editing". While the inline card scrolls away during an iterative edit
 * session, this panel keeps the artifact pinned — the chat becomes the command
 * line. Renders nothing while no variant is active; hosts decide where (and at
 * which breakpoint) to dock it.
 */
export function SharepicArtifactPanel({ className }: { className?: string }) {
  const active = useSharepicLiveStore((s) => s.activeVariant);
  const activePost = useSocialPostLiveStore((s) => s.activePost);
  if (!active && !activePost) return null;

  // Combined-post mode (EXPERIMENTAL): the post text docks above the sharepic
  // preview; without an active variant, a text-only panel renders instead.
  const postSection = activePost ? (
    <PanelPostSection key={activePost.postId} seed={activePost.post} />
  ) : null;
  if (!active) {
    return <PostOnlyPanel className={className}>{postSection}</PostOnlyPanel>;
  }
  // Key by variant so stepper/preview state never leaks across sharepics.
  if (active.pages && active.pages.length > 0) {
    return (
      <DeckPanelInner
        key={active.variantId}
        active={active}
        className={className}
        postSection={postSection}
      />
    );
  }
  return (
    <PanelInner
      key={active.variantId}
      active={active}
      className={className}
      postSection={postSection}
    />
  );
}

/** Clear BOTH artifact modes — the combined panel closes as one unit. */
function closePanel() {
  useSharepicLiveStore.getState().setActiveVariant(null);
  useSocialPostLiveStore.getState().setActivePost(null);
}

/**
 * Post-text block shared by the combined and text-only panel variants. Reads
 * the live head from the store (chat edits bump it via social_post_updated).
 */
function PanelPostSection({ seed }: { seed: SocialPostPayload }) {
  const live = useSocialPostLiveStore((s) => s.entries[seed.postId]) ?? seed;
  const info = SOCIAL_PLATFORM_INFO[live.platform] ?? SOCIAL_PLATFORM_INFO.generic;
  const overLimit = live.charCount > info.maxChars;

  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    void navigator.clipboard.writeText(live.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [live.text]);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-1.5">
        <span className="text-xs font-medium text-foreground">{info.label}-Post</span>
        <div className="flex items-center gap-1.5">
          <span
            className={
              overLimit
                ? 'text-xs font-medium tabular-nums text-red-600 dark:text-red-400'
                : 'text-xs tabular-nums text-foreground-muted'
            }
          >
            {live.charCount}/{info.maxChars}
          </span>
          {live.version > 1 && (
            <span className="text-xs text-foreground-muted">v{live.version}</span>
          )}
          <button
            onClick={copy}
            className="rounded p-1 text-foreground-muted hover:bg-primary/10 hover:text-foreground"
            aria-label="Post-Text kopieren"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-primary" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
      <div className="max-h-48 overflow-y-auto whitespace-pre-wrap px-2.5 py-2 text-xs text-foreground">
        {live.text}
      </div>
    </div>
  );
}

/** Panel shell for a post without an active sharepic variant. */
function PostOnlyPanel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <aside
      className={
        className ??
        'flex w-[24rem] shrink-0 flex-col overflow-hidden border-l border-border bg-background-alt'
      }
      aria-label="Aktiver Social-Media-Post"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-white">
          <SquarePen className="h-3 w-3" />
          Social-Post-Modus
        </span>
        <button
          onClick={closePanel}
          className="rounded p-1 text-foreground-muted hover:bg-primary/10 hover:text-foreground"
          aria-label="Social-Post-Modus beenden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        {children}
        <p className="text-xs text-foreground-muted">
          Beschreibe Textänderungen einfach im Chat — sie landen direkt auf diesem Post.
        </p>
      </div>
    </aside>
  );
}

function PanelInner({
  active,
  className,
  postSection,
}: {
  active: ActiveSharepic;
  className?: string;
  postSection?: ReactNode | null;
}) {
  const variant = useMemo<SharepicVariant>(
    () => ({
      id: active.variantId,
      canvasType: active.canvasType,
      initialProps: active.initialProps,
      ...(active.label ? { label: active.label } : {}),
      ...(active.canvasId ? { canvasId: active.canvasId } : {}),
    }),
    [active]
  );

  const {
    imageBase64,
    isRendering,
    renderError,
    headVersion,
    viewVersion,
    showStepper,
    label,
    stepToVersion,
    restoreViewVersion,
    download,
    openInStudio,
  } = useSharepicArtifact(variant);

  return (
    <aside
      className={
        className ??
        'flex w-[24rem] shrink-0 flex-col overflow-hidden border-l border-border bg-background-alt'
      }
      aria-label={`Aktives Sharepic: ${label}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-white">
            <SquarePen className="h-3 w-3" />
            {postSection ? 'Social-Post-Modus' : 'Sharepic-Modus'}
          </span>
          <span className="truncate text-sm font-medium text-foreground">{label}</span>
        </div>
        <button
          onClick={closePanel}
          className="rounded p-1 text-foreground-muted hover:bg-primary/10 hover:text-foreground"
          aria-label={postSection ? 'Social-Post-Modus beenden' : 'Sharepic-Modus beenden'}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        {postSection}
        {renderError ? (
          <div className="rounded-lg border border-border p-4 text-sm text-foreground-muted">
            Sharepic-Vorschau konnte nicht gerendert werden.
            <button onClick={openInStudio} className="ml-2 text-primary hover:underline">
              Im Editor öffnen
            </button>
          </div>
        ) : (
          <div className="group/panelimg relative overflow-hidden rounded-lg border border-border bg-background">
            {isRendering && !imageBase64 && (
              <div className="flex h-72 items-center justify-center">
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
                className={
                  isRendering
                    ? 'mx-auto w-full opacity-50 transition-opacity'
                    : 'mx-auto w-full opacity-100 transition-opacity'
                }
              />
            )}
            {imageBase64 && !isRendering && (
              <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/0 opacity-0 transition-opacity group-hover/panelimg:bg-black/30 group-hover/panelimg:opacity-100 focus-within:bg-black/30 focus-within:opacity-100">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      className="flex size-11 items-center justify-center rounded-full bg-white text-grey-900 shadow-lg transition-transform hover:scale-105"
                      aria-label="Sharepic im Studio bearbeiten"
                    >
                      <Pencil className="h-5 w-5" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Im Studio öffnen?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Das Sharepic öffnet sich im Studio-Editor in einem neuen Tab. Änderungen
                        bleiben synchron — du kannst danach hier im Chat weiterarbeiten.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                      <AlertDialogAction onClick={openInStudio}>Im Studio öffnen</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <button
                  onClick={download}
                  className="flex size-11 items-center justify-center rounded-full bg-white text-grey-900 shadow-lg transition-transform hover:scale-105"
                  aria-label="Sharepic herunterladen"
                >
                  <Download className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          {showStepper ? (
            <span className="inline-flex items-center gap-0.5 text-xs text-foreground-muted">
              <button
                onClick={() => void stepToVersion(-1)}
                className="rounded p-0.5 hover:bg-primary/10 hover:text-foreground"
                aria-label="Vorherige Version anzeigen"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              v{viewVersion ?? headVersion}/{headVersion}
              <button
                onClick={() => void stepToVersion(1)}
                className="rounded p-0.5 hover:bg-primary/10 hover:text-foreground"
                aria-label="Nächste Version anzeigen"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </span>
          ) : (
            <span />
          )}
          {viewVersion != null && (
            <button
              onClick={() => void restoreViewVersion()}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-primary hover:bg-primary/10"
              aria-label={`Version ${viewVersion} wiederherstellen`}
            >
              <History className="h-3.5 w-3.5" />
              <span>Wiederherstellen</span>
            </button>
          )}
        </div>

        <p className="text-xs text-foreground-muted">
          Beschreibe Änderungen einfach im Chat — sie landen direkt auf diesem Sharepic.
        </p>
      </div>
    </aside>
  );
}

function DeckPanelInner({
  active,
  className,
  postSection,
}: {
  active: ActiveSharepic;
  className?: string;
  postSection?: ReactNode | null;
}) {
  const variant = useMemo<SharepicVariant>(
    () => ({
      id: active.variantId,
      canvasType: active.canvasType,
      initialProps: active.initialProps,
      ...(active.pages ? { pages: active.pages } : {}),
      ...(active.label ? { label: active.label } : {}),
      ...(active.canvasId ? { canvasId: active.canvasId } : {}),
    }),
    [active]
  );

  const {
    imageBase64,
    isRendering,
    renderError,
    isExporting,
    slideCount,
    selectedIndex,
    selectSlide,
    headVersion,
    viewVersion,
    showStepper,
    canDownloadZip,
    stepToVersion,
    restoreViewVersion,
    downloadZip,
    openInStudio,
  } = useSliderDeckArtifact(variant);

  return (
    <aside
      className={
        className ??
        'flex w-[24rem] shrink-0 flex-col overflow-hidden border-l border-border bg-background-alt'
      }
      aria-label="Aktives Karussell"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-white">
            <SquarePen className="h-3 w-3" />
            {postSection ? 'Social-Post-Modus' : 'Sharepic-Modus'}
          </span>
          <span className="truncate text-sm font-medium text-foreground">
            Slider · {slideCount} Folien
          </span>
        </div>
        <button
          onClick={closePanel}
          className="rounded p-1 text-foreground-muted hover:bg-primary/10 hover:text-foreground"
          aria-label={postSection ? 'Social-Post-Modus beenden' : 'Sharepic-Modus beenden'}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        {postSection}
        {renderError ? (
          <div className="rounded-lg border border-border p-4 text-sm text-foreground-muted">
            Karussell-Vorschau konnte nicht gerendert werden.
            <button onClick={openInStudio} className="ml-2 text-primary hover:underline">
              Im Editor öffnen
            </button>
          </div>
        ) : (
          <div className="group/panelimg relative overflow-hidden rounded-lg border border-border bg-background">
            {isRendering && !imageBase64 && (
              <div className="flex h-72 items-center justify-center">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-foreground-muted" />
                  <span className="text-xs text-foreground-muted">Rendere Karussell...</span>
                </div>
              </div>
            )}
            {imageBase64 && (
              <img
                src={imageBase64}
                alt={`Karussell-Folie ${selectedIndex + 1} von ${slideCount}`}
                className={
                  isRendering
                    ? 'mx-auto w-full opacity-50 transition-opacity'
                    : 'mx-auto w-full opacity-100 transition-opacity'
                }
              />
            )}
            {imageBase64 && slideCount > 1 && (
              <span className="absolute bottom-2 right-2 rounded-full bg-black/50 px-2 py-0.5 text-xs font-medium text-white">
                {selectedIndex + 1}/{slideCount}
              </span>
            )}
            {imageBase64 && !isRendering && (
              <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/0 opacity-0 transition-opacity group-hover/panelimg:bg-black/30 group-hover/panelimg:opacity-100 focus-within:bg-black/30 focus-within:opacity-100">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      className="flex size-11 items-center justify-center rounded-full bg-white text-grey-900 shadow-lg transition-transform hover:scale-105"
                      aria-label="Karussell im Studio bearbeiten"
                    >
                      <Pencil className="h-5 w-5" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Im Studio öffnen?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Das Karussell öffnet sich im Studio-Editor in einem neuen Tab. Änderungen
                        bleiben synchron — du kannst danach hier im Chat weiterarbeiten.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                      <AlertDialogAction onClick={openInStudio}>Im Studio öffnen</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                {canDownloadZip && (
                  <button
                    onClick={() => void downloadZip()}
                    disabled={isExporting}
                    className="flex size-11 items-center justify-center rounded-full bg-white text-grey-900 shadow-lg transition-transform hover:scale-105 disabled:opacity-50"
                    aria-label="Alle Folien als ZIP herunterladen"
                  >
                    {isExporting ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Download className="h-5 w-5" />
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {slideCount > 1 && (
          <div className="flex items-center justify-center gap-1">
            <button
              onClick={() => selectSlide(selectedIndex - 1)}
              disabled={selectedIndex === 0}
              className="rounded p-1 text-foreground-muted hover:bg-primary/10 hover:text-foreground disabled:opacity-30"
              aria-label="Vorherige Folie"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: slideCount }, (_, i) => (
              <button
                key={i}
                onClick={() => selectSlide(i)}
                className={
                  i === selectedIndex
                    ? 'h-6 min-w-6 rounded bg-primary px-1 text-xs font-medium text-white'
                    : 'h-6 min-w-6 rounded px-1 text-xs font-medium text-foreground-muted hover:bg-primary/10 hover:text-foreground'
                }
                aria-label={`Folie ${i + 1} anzeigen`}
                aria-current={i === selectedIndex}
              >
                {i + 1}
              </button>
            ))}
            <button
              onClick={() => selectSlide(selectedIndex + 1)}
              disabled={selectedIndex >= slideCount - 1}
              className="rounded p-1 text-foreground-muted hover:bg-primary/10 hover:text-foreground disabled:opacity-30"
              aria-label="Nächste Folie"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          {showStepper ? (
            <span className="inline-flex items-center gap-0.5 text-xs text-foreground-muted">
              <button
                onClick={() => void stepToVersion(-1)}
                className="rounded p-0.5 hover:bg-primary/10 hover:text-foreground"
                aria-label="Vorherige Version anzeigen"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              v{viewVersion ?? headVersion}/{headVersion}
              <button
                onClick={() => void stepToVersion(1)}
                className="rounded p-0.5 hover:bg-primary/10 hover:text-foreground"
                aria-label="Nächste Version anzeigen"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </span>
          ) : (
            <span />
          )}
          {viewVersion != null && (
            <button
              onClick={() => void restoreViewVersion()}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-primary hover:bg-primary/10"
              aria-label={`Version ${viewVersion} wiederherstellen`}
            >
              <History className="h-3.5 w-3.5" />
              <span>Wiederherstellen</span>
            </button>
          )}
        </div>

        <p className="text-xs text-foreground-muted">
          Beschreibe Änderungen einfach im Chat — z.B. „kürze die Headline auf Folie 2".
        </p>
      </div>
    </aside>
  );
}
