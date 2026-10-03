import { Button } from '@gruenerator/ui';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import ErrorBoundary from '../../../components/ErrorBoundary';
import { cn } from '../../../utils/cn';

import { readHandoff } from './freitextHandoff';
import { SharepicCreatorChat, WORKING } from './SharepicCreatorChat';
import { mintCreatorCanvas, useSharepicCreator } from './useSharepicCreator';

function FreitextSharepicContent() {
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const { messages, phase, design, send, reportPhotoError, photoCount } = useSharepicCreator();
  const busy = phase === 'drafting' || phase === 'checking';

  // The Bild-Editor's „Sharepic" mode hands over its prompt and photos in router state — this
  // page has no start screen of its own. Read once, then replace the entry right away so a
  // reload or back/forward doesn't resend it (and lands back in the Bild-Editor).
  const location = useLocation();
  const [handoff] = useState(() => readHandoff(location.state));
  const handedOver = useRef(false);
  useEffect(() => {
    if (handedOver.current || !handoff) return;
    handedOver.current = true;
    void navigate(location.pathname, { replace: true, state: null });
    void send(handoff.prompt, handoff.photos);
  }, [handoff, location.pathname, navigate, send]);

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

  // Nothing handed over and nothing started: the Bild-Editor is where a sharepic begins.
  if (!handoff && messages.length === 0) {
    return <Navigate to="/bild-editor" replace state={{ mode: 'sharepic' }} />;
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-sm bg-[image:var(--editor-menubar-gradient,linear-gradient(90deg,#00553B_0%,#3E7D63_55%,#6BA88C_100%))] px-md text-white">
        <button
          type="button"
          onClick={() => void navigate('/studio')}
          aria-label="Zurück zum Studio"
          title="Zurück zum Studio"
          className="flex size-[34px] items-center justify-center rounded-[10px] text-white/90 transition-colors hover:bg-white/15 hover:text-white"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="m-0 truncate text-[15px] font-semibold leading-none text-white [font-family:inherit]">
            Sharepic aus Freitext
          </h1>
          <span className="shrink-0 rounded-full bg-white/15 px-2 py-1 text-[10px] font-bold uppercase leading-none tracking-wide text-white">
            Experimentell
          </span>
        </div>
        {design && (
          <Button
            size="sm"
            onClick={() => void openInEditor()}
            disabled={opening || busy}
            className="ml-auto bg-white text-primary-700 hover:bg-white/90"
          >
            {opening ? 'Wird geöffnet …' : 'Im Editor öffnen'}
          </Button>
        )}
      </header>

      <div className="flex min-h-0 flex-1 max-md:flex-col">
        <aside
          aria-label="Unterhaltung"
          className="flex w-[360px] shrink-0 flex-col border-r border-grey-200 max-md:h-[45dvh] max-md:w-full max-md:border-b max-md:border-r-0 dark:border-grey-700"
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
                'max-h-full w-auto max-w-full rounded-xl shadow-lg transition-opacity',
                busy && 'opacity-50'
              )}
            />
          ) : design ? (
            <ol
              aria-label="Slides des Karussells"
              className={cn(
                'flex h-full max-h-[720px] w-full snap-x snap-mandatory items-center gap-md overflow-x-auto px-md transition-opacity',
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
