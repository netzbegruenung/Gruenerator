import { type SharepicTweakId } from '@gruenerator/canvas-editor/composer';
import { Button } from '@gruenerator/ui';
import { ArrowLeft, PencilLine, SlidersHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import ErrorBoundary from '../../../components/ErrorBoundary';
import { useAuthStore } from '../../../stores/authStore';
import { cn } from '../../../utils/cn';

import { clearCreatorSession } from './creatorSession';
import { readHandoff } from './freitextHandoff';
import { SharepicCreatorChat, WORKING } from './SharepicCreatorChat';
import { SharepicFinishBar, SharepicFinishSheet, SharepicSwatches } from './SharepicFinish';
import { mintCreatorCanvas, useSharepicCreator } from './useSharepicCreator';

function FreitextSharepicContent() {
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [finishOpen, setFinishOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
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

  // The Bild-Editor's „Sharepic" mode hands over its prompt and photos in router state — this
  // page has no start screen of its own. Read once, then replace the entry right away so a
  // reload or back/forward doesn't resend it (and lands back in the Bild-Editor).
  const location = useLocation();
  const [handoff] = useState(() => readHandoff(location.state));
  const handedOver = useRef(false);
  useEffect(() => {
    if (handedOver.current || !handoff) return;
    handedOver.current = true;
    clearCreatorSession();
    void navigate(location.pathname, { replace: true, state: null });
    void send(handoff.prompt, handoff.photos);
  }, [handoff, location.pathname, navigate, send]);

  // Without a hand-over this is a reload: once we know whose it is, the last session comes back.
  // With none to resume, the Bild-Editor is where a sharepic begins.
  const resumeTried = useRef(false);
  useEffect(() => {
    if (handoff || authLoading || resumeTried.current) return;
    resumeTried.current = true;
    if (!resume()) void navigate('/bild-editor', { replace: true, state: { mode: 'sharepic' } });
  }, [handoff, authLoading, navigate, resume]);

  const openInEditor = async () => {
    if (!design) return;
    setOpening(true);
    setOpenError(null);
    try {
      const firstPrompt = messages.find((m) => m.role === 'user')?.text ?? 'Sharepic';
      const id = await mintCreatorCanvas(design.composed, firstPrompt.slice(0, 60));
      void navigate(`/studio/canvas/${id}`);
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : 'Öffnen fehlgeschlagen.');
      setOpening(false);
    }
  };

  if (!handoff && messages.length === 0) return null;

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-sm bg-[image:var(--editor-menubar-gradient,linear-gradient(90deg,#00553B_0%,#3E7D63_55%,#6BA88C_100%))] px-md text-white">
        <button
          type="button"
          onClick={() => void navigate('/studio')}
          aria-label="Zurück zum Studio"
          title="Zurück zum Studio"
          className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] text-white/90 transition-colors hover:bg-white/15 hover:text-white max-md:size-11"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="m-0 truncate text-[15px] font-semibold leading-none text-white [font-family:inherit]">
            Sharepic aus Freitext
          </h1>
          <span className="shrink-0 rounded-full bg-white/15 px-2 py-1 text-[10px] font-bold uppercase leading-none tracking-wide text-white max-md:hidden">
            Experimentell
          </span>
        </div>
        {design && (
          <div className="ml-auto flex shrink-0 items-center gap-2">
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
            <Button
              size="sm"
              onClick={() => void openInEditor()}
              disabled={opening || busy}
              aria-label={opening ? 'Wird geöffnet …' : 'Im Editor öffnen'}
              title="Im Editor öffnen"
              className="bg-white text-primary-700 hover:bg-white/90 max-md:size-11 max-md:rounded-full max-md:p-0"
            >
              <PencilLine className="size-5 md:hidden" aria-hidden="true" />
              <span className="max-md:hidden lg:hidden">{opening ? '…' : 'Editor'}</span>
              <span className="max-lg:hidden">
                {opening ? 'Wird geöffnet …' : 'Im Editor öffnen'}
              </span>
            </Button>
          </div>
        )}
      </header>

      {design && hasBarTweaks && (
        <SharepicFinishBar
          tweaks={tweaks}
          onChange={onTweak}
          onReset={onReset}
          disabled={busy}
          hidden={!finishOpen}
        />
      )}
      {design && (
        <SharepicFinishSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          tweaks={tweaks}
          onChange={onTweak}
          onReset={onReset}
          disabled={busy}
        />
      )}

      <div className="flex min-h-0 flex-1 max-md:flex-col">
        <aside
          aria-label="Unterhaltung"
          className="flex w-[360px] shrink-0 flex-col [container-type:size] border-r border-grey-200 max-md:h-[45dvh] max-md:w-full max-md:border-b max-md:border-r-0 dark:border-grey-700"
        >
          <SharepicCreatorChat
            messages={messages}
            phase={phase}
            onSend={(text, picked) => void send(text, picked)}
            onPhotoError={reportPhotoError}
            photoCount={photoCount}
          />
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-sm bg-grey-50 p-lg dark:bg-grey-900">
          {design && design.previews.length === 1 ? (
            <img
              src={design.previews[0]}
              alt="Vorschau des Sharepics"
              className={cn(
                'min-h-0 w-auto max-w-full flex-1 rounded-xl object-contain shadow-lg transition-opacity',
                busy && 'opacity-50'
              )}
            />
          ) : design ? (
            <ol
              aria-label="Slides des Karussells"
              className={cn(
                'flex min-h-0 max-h-[720px] w-full flex-1 snap-x snap-mandatory items-center gap-md overflow-x-auto px-md transition-opacity',
                busy && 'opacity-50'
              )}
            >
              {design.previews.map((preview, i) => (
                // eslint-disable-next-line react/no-array-index-key -- slides have no id; order is the identity
                <li key={i} className="h-full max-h-full shrink-0 snap-center">
                  <img
                    src={preview}
                    alt={`Slide ${i + 1} von ${design.previews.length}`}
                    className="h-full w-auto rounded-xl shadow-lg"
                  />
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">{WORKING[phase] ?? ''}</p>
          )}
          {openError && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {openError}
            </p>
          )}
        </main>
      </div>
    </div>
  );
}

const FreitextSharepicPage = () => (
  <ErrorBoundary>
    <FreitextSharepicContent />
  </ErrorBoundary>
);

export default FreitextSharepicPage;
