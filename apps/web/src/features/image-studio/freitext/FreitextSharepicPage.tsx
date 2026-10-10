import { type SharepicTweakId } from '@gruenerator/canvas-editor/composer';
import { useQueryClient } from '@tanstack/react-query';
import { SlidersHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import ErrorBoundary from '../../../components/ErrorBoundary';
import { useAuthStore } from '../../../stores/authStore';
import { cn } from '../../../utils/cn';
import { seedCanvasQuery } from '../canvasQuery';
import { DownloadButton, OpenInEditorButton } from '../editor-shell/StudioEditorActions';
import { StudioEditorShell } from '../editor-shell/StudioEditorShell';
import { StudioPreviewStage } from '../editor-shell/StudioPreviewStage';
import { useCyclingStatus } from '../editor-shell/useCyclingStatus';
import { dropTabPayload, readTabPayload } from '../tabHandoff';

import { downloadDesign } from './creatorRender';
import { clearCreatorSession } from './creatorSession';
import { readHandoff } from './freitextHandoff';
import { SharepicCreatorChat, WORKING } from './SharepicCreatorChat';
import { SharepicFinishBar, SharepicFinishSheet, SharepicSwatches } from './SharepicFinish';
import { mintCreatorCanvas, useSharepicCreator } from './useSharepicCreator';

/** After the phase's own words, while a draft takes its time. */
const STATUS_TEXTS = ['Die Farben finden ihren Platz …', 'Gleich ist es so weit …'];

function FreitextSharepicContent() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [finishOpen, setFinishOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const authLoading = useAuthStore((s) => s.isLoading);
  const {
    messages,
    phase,
    design,
    send,
    resume,
    reportPhotoError,
    photoCount,
    tweaks,
    tweak,
    resetTweaks,
    tweaked,
  } = useSharepicCreator(userId);
  const busy = phase === 'drafting' || phase === 'checking';
  const farbe = tweaks.find((t) => t.id === 'farbe') ?? null;
  const hasBarTweaks = tweaks.some((t) => t.id !== 'farbe');
  const onTweak = (id: SharepicTweakId, value: string) => void tweak(id, value);
  const onReset = tweaked ? () => void resetTweaks() : null;

  // On a phone a design that arrives while a turn or a restore runs opens the preview; a tweak
  // re-renders from `ready` and leaves the tab alone. (A fast turn can go drafting → ready without
  // `checking` ever rendering, so this compares to `ready`.)
  const [reveal, setReveal] = useState(0);
  const [seen, setSeen] = useState({ design, phase });
  if (seen.design !== design || seen.phase !== phase) {
    if (design && seen.design !== design && seen.phase !== 'ready') setReveal((n) => n + 1);
    setSeen({ design, phase });
  }
  const status = useCyclingStatus(busy ? [WORKING[phase] ?? '', ...STATUS_TEXTS] : [], busy);

  // The Studio composer hands over its prompt and photos in router state — this
  // page has no start screen of its own. Read once, then replace the entry right away so a
  // reload or back/forward doesn't resend it (and lands back in the Studio).
  const location = useLocation();
  // From the Studio composer the request arrives in a new tab, via storage instead of router state.
  const [handoff] = useState(
    () => readHandoff(location.state) ?? readHandoff(readTabPayload(location.search))
  );
  const handedOver = useRef(false);
  useEffect(() => {
    if (handedOver.current || !handoff) return;
    handedOver.current = true;
    dropTabPayload(location.search);
    clearCreatorSession();
    void navigate(location.pathname, { replace: true, state: null });
    void send(handoff.prompt, handoff.photos);
  }, [handoff, location.pathname, location.search, navigate, send]);

  // Without a hand-over this is a reload: once we know whose it is, the last session comes back.
  // With none to resume, the Studio is where a sharepic begins.
  const resumeTried = useRef(false);
  useEffect(() => {
    if (handoff || authLoading || resumeTried.current) return;
    resumeTried.current = true;
    if (!resume()) void navigate('/studio', { replace: true });
  }, [handoff, authLoading, navigate, resume]);

  const openInEditor = async () => {
    if (!design) return;
    setOpening(true);
    setOpenError(null);
    try {
      const firstPrompt = messages.find((m) => m.role === 'user')?.text ?? 'Sharepic';
      const canvas = await mintCreatorCanvas(
        design.composed,
        firstPrompt.slice(0, 60),
        design.source
      );
      seedCanvasQuery(queryClient, canvas);
      void navigate(`/studio/canvas/${canvas.id}`);
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : 'Öffnen fehlgeschlagen.');
      setOpening(false);
    }
  };

  const download = async () => {
    if (!design) return;
    setExporting(true);
    setOpenError(null);
    try {
      await downloadDesign(design.composed);
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : 'Download fehlgeschlagen.');
    } finally {
      setExporting(false);
    }
  };

  if (!handoff && messages.length === 0) return null;

  return (
    <StudioEditorShell
      title="Sharepic aus Freitext"
      idPrefix="sharepic"
      revealKey={reveal || null}
      actions={
        design && (
          <>
            {farbe && (
              <div className="max-md:hidden">
                <SharepicSwatches
                  tweak={farbe}
                  onChange={onTweak}
                  disabled={busy}
                  size="sm"
                  tone="header"
                />
              </div>
            )}
            {hasBarTweaks && (
              <button
                type="button"
                onClick={() => setFinishOpen((v) => !v)}
                aria-expanded={finishOpen}
                aria-controls="sharepic-feinschliff"
                aria-label="Feinschliff"
                title="Feinschliff"
                className={cn(
                  'flex h-9 items-center justify-center gap-1.5 rounded-full border border-white/50 text-[13px] font-bold text-white transition-colors hover:bg-white/15 max-md:hidden md:max-lg:w-9 lg:px-3.5',
                  finishOpen && 'bg-white/20'
                )}
              >
                <SlidersHorizontal className="size-4" aria-hidden="true" />
                <span className="max-lg:hidden">Feinschliff</span>
              </button>
            )}
            {tweaks.length > 0 && (
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                aria-expanded={sheetOpen}
                aria-haspopup="dialog"
                aria-label="Feinschliff"
                title="Feinschliff"
                className={cn(
                  'flex size-11 items-center justify-center rounded-full border border-white/50 text-white transition-colors hover:bg-white/15 md:hidden',
                  sheetOpen && 'bg-white/20'
                )}
              >
                <SlidersHorizontal className="size-5" aria-hidden="true" />
              </button>
            )}
            <DownloadButton
              onClick={() => void download()}
              disabled={busy}
              exporting={exporting}
              label={design.previews.length > 1 ? 'Als ZIP herunterladen' : 'Herunterladen'}
            />
            <OpenInEditorButton
              onClick={() => void openInEditor()}
              disabled={busy}
              opening={opening}
            />
          </>
        )
      }
      belowHeader={
        design && (
          <>
            {hasBarTweaks && (
              <SharepicFinishBar
                tweaks={tweaks}
                onChange={onTweak}
                onReset={onReset}
                disabled={busy}
                hidden={!finishOpen}
              />
            )}
            <SharepicFinishSheet
              open={sheetOpen}
              onOpenChange={setSheetOpen}
              tweaks={tweaks}
              onChange={onTweak}
              onReset={onReset}
              disabled={busy}
            />
          </>
        )
      }
      chat={
        <SharepicCreatorChat
          messages={messages}
          phase={phase}
          onSend={(text, picked) => void send(text, picked)}
          onPhotoError={reportPhotoError}
          photoCount={photoCount}
        />
      }
      preview={
        <StudioPreviewStage
          images={design?.previews ?? []}
          alt="Vorschau des Sharepics"
          busy={busy}
          status={status}
          aspect={4 / 5}
          error={openError}
        />
      }
    />
  );
}

const FreitextSharepicPage = () => (
  <ErrorBoundary>
    <FreitextSharepicContent />
  </ErrorBoundary>
);

export default FreitextSharepicPage;
