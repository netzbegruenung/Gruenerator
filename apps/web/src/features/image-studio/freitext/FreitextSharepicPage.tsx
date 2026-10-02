import { AIPromptInput, Button } from '@gruenerator/ui';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import ErrorBoundary from '../../../components/ErrorBoundary';
import { cn } from '../../../utils/cn';

import { mintCreatorCanvas, useSharepicCreator, type CreatorPhase } from './useSharepicCreator';

const EXAMPLES = [
  { label: 'Mitglieder werben', text: 'Sharepic zur Mitgliederwerbung: Mach mit bei den Grünen!' },
  {
    label: 'Karussell',
    text: 'Karussell: Die Regierung kürzt beim Deutschlandticket. Der Preis steigt von 58 auf 63 Euro – wer auf Bus und Bahn angewiesen ist, zahlt drauf. Wir fordern ein Ticket, das bezahlbar bleibt.',
  },
  {
    label: 'Veranstaltung',
    text: 'Einladung zum Grünen Stammtisch am Donnerstag, 14.11., 19 Uhr im Café Linde, Hauptstraße 3',
  },
  { label: 'Thema', text: 'Mehr Busse auf dem Land – wir bauen den Nahverkehr aus' },
];

const WORKING: Partial<Record<CreatorPhase, string>> = {
  drafting: 'Entwerfe …',
  checking: 'Prüfe den Entwurf …',
};

function FreitextSharepicContent() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const { messages, phase, design, send } = useSharepicCreator();
  const chatEnd = useRef<HTMLDivElement>(null);
  const busy = phase === 'drafting' || phase === 'checking';

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, phase]);

  const submit = () => {
    const text = input.trim();
    if (text.length < 3 || busy) return;
    setInput('');
    void send(text);
  };

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

  const started = messages.length > 0;

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-sm bg-[image:var(--editor-menubar-gradient,linear-gradient(90deg,#00553B_0%,#3E7D63_55%,#6BA88C_100%))] px-md text-white">
        <button
          type="button"
          onClick={() => void navigate('/studio')}
          aria-label="Zurück zum Studio"
          className="flex size-9 items-center justify-center rounded-full hover:bg-white/15"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </button>
        <h1 className="text-sm font-semibold">Sharepic aus Freitext</h1>
        <span className="rounded-full border border-white/50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide">
          Experimentell
        </span>
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

      {!started ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-lg px-md pb-xl">
          <h2 className="text-center text-3xl font-extrabold tracking-[-.02em] text-foreground-heading max-sm:text-2xl">
            Was soll aufs Sharepic?
          </h2>
          <div className="w-full max-w-[720px]">
            <AIPromptInput
              value={input}
              onChange={setInput}
              onSubmit={submit}
              placeholder="Beschreibe dein Sharepic – Thema, Anlass, Text …"
              examples={EXAMPLES}
              rows={3}
            />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 max-md:flex-col">
          <aside
            aria-label="Unterhaltung"
            className="flex w-[360px] shrink-0 flex-col border-r border-grey-200 max-md:h-[45dvh] max-md:w-full max-md:border-b max-md:border-r-0 dark:border-grey-700"
          >
            <div className="flex min-h-0 flex-1 flex-col gap-sm overflow-y-auto p-md">
              {messages.map((message) => (
                <p
                  key={message.id}
                  className={cn(
                    'max-w-[90%] whitespace-pre-wrap rounded-2xl px-md py-sm text-sm',
                    message.role === 'user'
                      ? 'self-end bg-primary-600 text-white'
                      : 'self-start bg-grey-100 text-foreground dark:bg-grey-800',
                    message.error && 'text-red-700 dark:text-red-400'
                  )}
                >
                  {message.text}
                </p>
              ))}
              <p role="status" className="self-start text-sm text-muted-foreground">
                {WORKING[phase] ?? ''}
              </p>
              <div ref={chatEnd} />
            </div>
            <div className="border-t border-grey-200 p-sm dark:border-grey-700">
              <AIPromptInput
                value={input}
                onChange={setInput}
                onSubmit={submit}
                isLoading={busy}
                placeholder="Was soll anders sein?"
                rows={2}
              />
            </div>
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
      )}
    </div>
  );
}

const FreitextSharepicPage = () => (
  <ErrorBoundary>
    <FreitextSharepicContent />
  </ErrorBoundary>
);

export default FreitextSharepicPage;
