import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@gruenerator/ui';
import { useEffect, useLayoutEffect, useRef, type JSX } from 'react';

import useCitationStore from '../../../stores/citationStore';
import { cn } from '../../../utils/cn';
import { Markdown } from '../Markdown';

/**
 * Das Zitat-Modal als echter Dialog (#3133).
 *
 * Fokusfalle, Fokusrückgabe, Escape, Scroll-Sperre, der 44-px-Schliesser und
 * die Ebene 1010 kommen aus packages/ui/src/components/dialog.tsx — nicht mehr
 * von Hand. Ersatzlos entfallen sind damit: der `document`-Escape-Listener (er
 * schloss auch Dialoge, die über diesem lagen), der Hintergrundklick-Handler
 * samt zwei eslint-disable-Zeilen, `z-[1100]` (neben der Skala 1010/1020/1030
 * aus scripts/check-overlay-layers.mjs:42-44) und `animate-[modalSlideIn]`.
 * Das Keyframe selbst bleibt in citation-remaining.css:99 — base-popup.css:42
 * benutzt es ebenfalls.
 *
 * Die Komponente bleibt IMMER montiert: geschlossen rendert Radix nichts, und
 * nur so kann der Store-Wechsel das Öffnen auslösen (es gibt keinen
 * DialogTrigger).
 *
 * Der Fokus fällt bewusst in den Textbereich und nicht auf den Schliesser:
 * Radix nimmt den ersten fokussierbaren Nachfahren, und der Schliesser steht in
 * der Primitive NACH {children} (dialog.tsx:68-69). Läge er vorn, beantwortete
 * dasselbe Enter, mit dem man das Zitat öffnet, den Dialog sofort mit
 * „schliessen" (#2833).
 */
const CitationModal = (): JSX.Element => {
  const highlightRef = useRef<HTMLSpanElement>(null);
  // Radix's default onCloseAutoFocus (packages/ui's DialogContentModal
  // equivalent, @radix-ui/react-dialog) refocuses `context.triggerRef.current`
  // — the DialogTrigger. There is none here (the store opens the modal, not a
  // trigger), so that ref is always null and, since the default handler also
  // calls preventDefault(), FocusScope's own "restore to previously focused
  // element" fallback never runs either: focus is silently dropped on
  // document.body. Captured in a layout effect — layout effects for a commit
  // all run before FocusScope's own (passive) effect can move focus into the
  // dialog — and restored explicitly on close below.
  const openerElementRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  const { selectedCitation, closeCitationModal, contextData, isLoadingContext, contextError } =
    useCitationStore();

  const isOpen = !!selectedCitation;

  useLayoutEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      openerElementRef.current = document.activeElement as HTMLElement | null;
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    if (contextData && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [contextData]);

  // Vorher hatten Laden und Fehler je eine eigene Live-Region, die mit ihrem
  // Text zusammen ein- und aushängte — eine Ansage per Screenreader ist dabei
  // unzuverlässig, und beim Eintreffen des Kontexts verschwindet die Region
  // ersatzlos, ohne dass irgendetwas angesagt wird. Angesagt wird stattdessen
  // über EINE dauerhaft montierte Live-Region (unten in der Dialog-Ausgabe),
  // deren Text sich mit dem Zustand ändert; die sichtbaren Blöcke unten tragen
  // dafür keine eigenen Live-Region-Attribute mehr.
  const getContextStatusText = (): string => {
    if (isLoadingContext) return 'Kontext wird geladen...';
    if (contextError) return contextError;
    if (contextData && contextData.contextChunks && contextData.contextChunks.length > 0) {
      return 'Kontext geladen';
    }
    return '';
  };

  const renderContextView = () => {
    if (!selectedCitation) return null;

    if (isLoadingContext) {
      return (
        <div className="flex items-center justify-center gap-sm p-lg text-disabled text-[clamp(0.9rem,1.5vw,1rem)] min-h-[100px] max-sm:p-xl max-sm:text-base">
          {/* Der Ring sagt nichts, was der Text nicht schon sagt. */}
          <span
            aria-hidden="true"
            className="size-5 border-2 border-grey-200 dark:border-grey-700 border-t-accent rounded-full animate-spin shrink-0 max-sm:size-6 max-sm:border-[3px]"
          />
          <span>Kontext wird geladen...</span>
        </div>
      );
    }

    if (contextError) {
      // Bis hierher rendete dieser Zweig dasselbe wie der Rückfall unten und
      // warf `contextError` weg (gesetzt in citationStore.ts:181 und :186) —
      // der Fehlerzustand existierte nicht. Jetzt: erst die Meldung, dann das,
      // was man trotzdem hat.
      return (
        <div className="flex flex-col gap-md">
          <p className="m-0 text-[0.9rem] text-muted-foreground">{contextError}</p>
          <div className="text-foreground italic leading-[1.6] p-md rounded-sm bg-background-alt text-[clamp(0.9rem,1.5vw,1rem)] max-sm:p-md max-sm:text-base max-sm:leading-[1.7]">
            &ldquo;{selectedCitation.cited_text}&rdquo;
          </div>
        </div>
      );
    }

    if (contextData && contextData.contextChunks && contextData.contextChunks.length > 0) {
      return (
        <div className="citation-context-view markdown-content">
          {contextData.contextChunks.map((chunk, idx) => (
            <span
              key={`chunk-${chunk.chunkIndex}-${idx}`}
              ref={chunk.isCenter ? highlightRef : null}
              // Kein `opacity-70`: Deckkraft wirkt auf das ganze Element und
              // frisst den Kontrast von allem darin; axe meldet dann eine
              // Mischfarbe, die in keiner Rampe vorkommt
              // (docs/CLAUDE-a11y.md:48-52).
              className={chunk.isCenter ? 'citation-highlight' : 'text-muted-foreground'}
            >
              <Markdown>{chunk.text}</Markdown>{' '}
            </span>
          ))}
        </div>
      );
    }

    return (
      <div
        className={cn(
          'text-foreground italic leading-[1.6] p-md rounded-sm bg-background-alt text-[clamp(0.9rem,1.5vw,1rem)]',
          'max-sm:p-md max-sm:text-base max-sm:leading-[1.7]',
          'markdown-content'
        )}
      >
        &ldquo;<Markdown>{selectedCitation.cited_text || ''}</Markdown>&rdquo;
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeCitationModal()}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          openerElementRef.current?.focus();
        }}
        className={cn(
          // Kopf / Körper / Fuss statt der Vorgabe `grid gap-4 p-6`; das Scrollen
          // wandert von DialogContent (dialog.tsx:63, overflow-y-auto) in den
          // Mittelteil, damit Kopf und Fuss stehen bleiben.
          'grid-rows-[auto_1fr_auto] gap-0 overflow-hidden p-0',
          // Die Breitenstaffel der alten Karte. `sm:max-w-[800px]` ist nötig,
          // weil tailwind-merge Varianten getrennt behandelt und das
          // `sm:max-w-[32rem]` der Primitive sonst stehen bliebe.
          'max-h-[85vh] w-[90%] max-w-[800px] sm:max-w-[800px]',
          'md:max-lg:w-[85%] md:max-lg:max-w-[700px]',
          'lg:w-[70%] lg:max-w-[900px]',
          'min-[1440px]:w-[65%] min-[1440px]:max-w-[1000px]',
          // Bodenblatt auf schmalen Breiten: die Primitive zentriert mit
          // top-1/2 + translate-y-1/2, beides muss zurückgenommen werden
          // (dieselbe Bauform wie SettingsDialog.tsx:180).
          'max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:w-full max-sm:max-w-none',
          'max-sm:max-h-[92vh] max-sm:translate-x-0 max-sm:translate-y-0',
          'max-sm:rounded-t-lg max-sm:rounded-b-none'
        )}
      >
        {selectedCitation && (
          <>
            <DialogHeader
              className={cn(
                'shrink-0 border-b border-grey-200 dark:border-grey-700',
                // pr-14 hält den Titel vom absolut gesetzten Schliesser frei
                // (dialog.tsx:76: top-3 right-3, auf Touch size-11).
                'px-xl py-lg pr-14 text-left',
                'max-sm:px-md max-sm:py-md',
                'lg:px-xxlarge lg:py-md'
              )}
            >
              {/* Getrennte Textknoten mit Absicht: der zugängliche Name ist die
                  Verkettung („Zitat [1] — Grundsatzprogramm"), aber RTLs
                  getByText prüft die DIREKTEN Textkinder — so bleiben
                  MonitorThemenPage.vitest.tsx:58 und :59 gültig. */}
              <DialogTitle
                className={cn(
                  'flex min-w-0 items-baseline gap-1',
                  'text-foreground-heading text-[clamp(1.1rem,2vw,1.35rem)] font-semibold',
                  'max-sm:text-[1.1rem]'
                )}
              >
                <span className="shrink-0">Zitat [{selectedCitation.index}]</span>
                {selectedCitation.document_title ? (
                  <>
                    {' — '}
                    <span className="min-w-0 truncate font-normal text-foreground">
                      {selectedCitation.document_title}
                    </span>
                  </>
                ) : null}
              </DialogTitle>
              {/* Unsichtbar, aber vorlesbar (sr-only statt hidden,
                  docs/CLAUDE-a11y.md:66-68). Radix warnt ohne
                  aria-describedby auf der Konsole, und die Nummer allein sagt
                  nicht, was der Dialog zeigt. Vorbild: SettingsDialog.tsx:181. */}
              <DialogDescription className="sr-only">
                Der zitierte Abschnitt im Zusammenhang des Dokuments.
              </DialogDescription>
            </DialogHeader>

            {/* Einzige Live-Region für den Kontext-Zustand — siehe
                getContextStatusText oben. Bleibt montiert, solange der Dialog
                offen ist; nur ihr Text wechselt, damit Laden/Fehler/Erfolg
                jeweils genau einmal angesagt werden. */}
            <p role="status" aria-live="polite" className="sr-only">
              {getContextStatusText()}
            </p>

            {/* Scrollfläche und zugleich das erste fokussierbare Element im
                Inhalt — siehe Kopfkommentar. WCAG 2.1.1 verlangt für eine
                Scrollfläche ohnehin einen Tastaturweg. */}
            <div
              role="region"
              // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Scrollfläche muss laut WCAG 2.1.1 per Tastatur erreichbar sein; role="region" bleibt, der Tabstopp entfällt nicht (docs/CLAUDE-a11y.md)
              tabIndex={0}
              aria-label="Zitat im Zusammenhang"
              className={cn(
                'min-h-0 overflow-y-auto px-xl py-md',
                'focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2',
                'max-sm:px-lg max-sm:py-md',
                'max-[399px]:px-md max-[399px]:py-sm',
                'lg:px-xxlarge lg:py-lg'
              )}
            >
              {renderContextView()}
            </div>

            {selectedCitation.similarity_score ? (
              <div
                className={cn(
                  'flex shrink-0 items-center justify-end gap-md',
                  'border-t border-grey-200 dark:border-grey-700 bg-background-alt',
                  'px-xl py-sm max-sm:px-md max-sm:py-xs lg:px-xxlarge'
                )}
              >
                <span className="shrink-0 rounded-[10px] bg-background-pure px-2 py-0.5 text-[0.8rem] text-disabled max-sm:text-[0.75rem]">
                  {Math.round(Number(selectedCitation.similarity_score) * 100)}%
                </span>
              </div>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CitationModal;
