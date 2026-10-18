import { useMediaQuery } from '@gruenerator/shared/hooks';
import {
  Button,
  canRequestFeedback,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  requestFeedback,
} from '@gruenerator/ui';
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from 'motion/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  HiArrowLeft,
  HiArrowRight,
  HiCheck,
  HiOutlineArrowDownTray,
  HiOutlineArrowTopRightOnSquare,
  HiOutlineChatBubbleLeftRight,
  HiOutlinePencilSquare,
  HiOutlinePhoto,
  HiOutlineSquares2X2,
  HiOutlineSwatch,
} from 'react-icons/hi2';
import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '@/stores/authStore';
import { getDocsUrl } from '@/utils/docsUrl';

type Country = 'de' | 'at';

const DOCS_LINKS = [
  { label: 'Alle Sharepic-Formen auf einen Blick', path: '/docs/features/sharepics' },
  {
    label: 'Guide: Wie erstelle ich ein Sharepic?',
    path: '/docs/guides/einsteigerinnen/sharepic-erstellen',
  },
] as const;
const IMG = '/images/sharepic-news';
const LAUNCH_VIDEO = '/videos/sharepic-launch';

const EXAMPLE_PROMPT =
  'Sharepic mit vier Tipps zum Mitmachen: wählen gehen, informiert bleiben, zur Demo kommen, weitersagen. Mit Emojis.';

const LOCAL_GROUP: Record<Country, string> = { de: 'deines Ortsverbands', at: 'deiner Ortsgruppe' };

const TEMPLATES: Record<Country, readonly string[]> = {
  de: ['de-zitat', 'de-karussell', 'de-zahl', 'de-vergleich'],
  at: ['at-termine', 'at-emoji', 'at-markierungen', 'at-diagramm'],
};

// Fächer: links und rechts gekippt hinter dem mittleren Bild.
const FAN = [
  'md:-rotate-[7deg] md:-translate-x-[42%] md:translate-y-4',
  'md:z-10 md:scale-105',
  'md:rotate-[7deg] md:translate-x-[42%] md:translate-y-4',
] as const;

// Eingangsbewegung der Bildseite: einmal beim Öffnen der Folie, gestaffelt über `delay`.
// Motion setzt `transform`; das addiert sich zu Tailwinds `rotate`/`translate` des Fächers.
const EASE = [0.22, 1, 0.36, 1] as const;
function enter(delayMs: number, from: { x?: number; y?: number; scale?: number } = {}) {
  return {
    initial: { opacity: 0, ...from },
    animate: { opacity: 1, x: 0, y: 0, scale: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.42, ease: EASE, delay: delayMs / 1000 },
  };
}

const FAN_FROM = [{ x: 48 }, { scale: 0.95 }, { x: -48 }] as const;
const FAN_DELAY = [120, 0, 120] as const;

const TYPING_MS = 1100;

interface SlideActions {
  openStudio: () => void;
  /** Nur gesetzt, wenn der schwebende Feedback-Button aktiv ist. */
  giveFeedback: (() => void) | null;
}

interface Slide {
  eyebrow: string;
  title: string;
  visual: (country: Country) => ReactNode;
  body: (country: Country, actions: SlideActions) => ReactNode;
  /** Visual füllt die ganze Folie; Titel und Text bleiben nur für Screenreader. */
  wide?: true;
}

function Lead({ children }: { children: ReactNode }) {
  return <p className="text-[15px] leading-relaxed text-muted-foreground">{children}</p>;
}

function Features({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-sm">
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-200">
            <HiCheck className="size-3.5" />
          </span>
          <span className="leading-relaxed text-foreground">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Der Chat tippt kurz und antwortet dann mit dem Sharepic. */
function ChatMock({ country }: { country: Country }) {
  const reduceMotion = useReducedMotion();
  const [typing, setTyping] = useState(!reduceMotion);

  useEffect(() => {
    if (!typing) return;
    const timer = setTimeout(() => setTyping(false), TYPING_MS);
    return () => clearTimeout(timer);
  }, [typing]);

  return (
    <div className="flex h-full w-full flex-col justify-start gap-2 md:h-[340px] md:w-[88%] md:gap-2.5">
      <motion.span
        className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-white px-3 py-2 text-[12px] leading-snug md:text-[13px] text-grey-900 shadow-md"
        {...enter(0, { x: 12 })}
      >
        {EXAMPLE_PROMPT}
      </motion.span>
      <AnimatePresence mode="wait" initial={false}>
        {typing ? (
          <motion.span
            key="typing"
            className="flex gap-1 self-start rounded-2xl rounded-bl-sm bg-white px-3 py-2.5 shadow-md"
            {...enter(250)}
            transition={{ duration: 0.2, delay: 0.25 }}
          >
            {[0, 0.15, 0.3].map((delay) => (
              <motion.span
                key={delay}
                className="size-1.5 rounded-full bg-grey-400"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 0.9, repeat: Infinity, delay }}
              />
            ))}
          </motion.span>
        ) : (
          <motion.img
            key="answer"
            src={`${IMG}/${country}-emoji.webp`}
            alt=""
            className="min-h-0 flex-1 self-start rounded-md shadow-lg ring-1 ring-black/10 md:w-[58%] md:flex-none"
            {...enter(0, { scale: 0.95, y: 6 })}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Nachbildung der Editor-Leinwand: markierter Text mit Anfassern und Werkzeugleiste. */
function EditorMock({ country }: { country: Country }) {
  return (
    <motion.div
      className="flex w-[62%] max-w-[190px] overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-black/10 md:w-[92%] md:max-w-none"
      {...enter(0, { y: 8 })}
    >
      <div className="flex flex-col gap-3 border-r border-grey-200 bg-grey-50 px-2 py-3 text-grey-600">
        <span className="flex size-5 items-center justify-center text-sm font-bold">T</span>
        <HiOutlinePhoto className="size-5" />
        <HiOutlineSwatch className="size-5" />
        <HiOutlineArrowDownTray className="size-5" />
      </div>
      <div className="flex flex-1 justify-center bg-grey-100 px-3 pt-8 pb-3 md:px-4 md:pt-10 md:pb-4">
        <div className="relative w-[82%]">
          <img
            src={`${IMG}/${country}-markierungen.webp`}
            alt=""
            className="w-full rounded-sm shadow-md"
          />
          <motion.div
            className="absolute top-[28%] left-[3%] h-[22%] w-[94%] rounded-sm border-2 border-primary-400"
            {...enter(450, { scale: 0.9 })}
          >
            {[
              '-top-1.5 -left-1.5',
              '-top-1.5 -right-1.5',
              '-bottom-1.5 -left-1.5',
              '-bottom-1.5 -right-1.5',
            ].map((pos) => (
              <span
                key={pos}
                className={`absolute size-2.5 rounded-full border-2 border-primary-400 bg-white ${pos}`}
              />
            ))}
            <motion.span
              className="absolute -top-9 left-1/2 flex -translate-x-1/2 items-center gap-2.5 rounded-md bg-grey-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow-md"
              {...enter(650, { y: 4 })}
            >
              <span>•</span>
              <span>1.</span>
              <span className="underline">U</span>
            </motion.span>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Launch-Video: quer im Dialog, hochkant auf dem Handy, wo der Dialog den ganzen Schirm füllt.
 * Startet stumm, Ton über die Steuerleiste; bei reduzierter Bewegung erst auf Klick.
 */
function LaunchVideo() {
  const reduceMotion = useReducedMotion();
  const src = useMediaQuery('(max-width: 639px)') ? `${LAUNCH_VIDEO}-hochkant` : LAUNCH_VIDEO;
  return (
    // Keine Untertitel nötig: keine Sprache, nur Musik; jeder Text steht im Bild und im aria-label.
    <video
      key={src}
      src={`${src}.mp4`}
      poster={`${src}-poster.webp`}
      autoPlay={!reduceMotion}
      muted
      playsInline
      controls
      preload="metadata"
      aria-label="Video: Ein Satz im Chat wird zum Sharepic-Karussell. Neu im Grünerator: die besten Sharepics aller Zeiten."
      className="size-full object-contain sm:object-cover"
    />
  );
}

const SLIDES: readonly Slide[] = [
  {
    eyebrow: 'Neu im Grünerator',
    title: 'Die besten Sharepics aller Zeiten',
    wide: true,
    visual: () => <LaunchVideo />,
    body: () => (
      <Lead>
        Ein Satz im Chat, ein ganzes Karussell als Antwort. Auf den nächsten Folien zeigen wir dir,
        wie das geht.
      </Lead>
    ),
  },
  {
    eyebrow: 'Neu im Grünerator',
    title: 'Sharepics mit KI erstellen',
    visual: (country) =>
      ['emoji', 'markierungen', 'diagramm'].map((key, i) => (
        <motion.img
          key={key}
          src={`${IMG}/${country}-${key}.webp`}
          alt=""
          className={`w-[30%] rounded-md shadow-xl ring-1 ring-black/10 md:absolute md:w-[46%] ${FAN[i]}`}
          {...enter(FAN_DELAY[i], FAN_FROM[i])}
        />
      )),
    body: (country) => (
      <>
        <Lead>
          Der Antrag ist durch, am Samstag ist Infostand, und der Kanal {LOCAL_GROUP[country]}{' '}
          wartet? Beschreib in einem Satz, worum es geht. Der Grünerator macht daraus ein Sharepic
          oder Karussell im Grünen-Design. Ohne Designprogramm, ohne Schriften-Suche, ohne
          Logo-Gefummel.
        </Lead>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Drei Wege führen hin:</p>
          {[
            { icon: HiOutlineSquares2X2, name: 'Vorlagen', text: 'fertige Looks zum Loslegen' },
            { icon: HiOutlinePencilSquare, name: 'Studio', text: 'aus einem Satz zum Karussell' },
            {
              icon: HiOutlineChatBubbleLeftRight,
              name: 'Chat',
              text: 'das Bild zum Text, den du gerade schreibst',
            },
          ].map((way) => (
            <div key={way.name} className="flex items-start gap-3 text-sm">
              <way.icon className="mt-0.5 size-5 shrink-0 text-primary-600 dark:text-primary-300" />
              <span className="text-muted-foreground">
                <strong className="font-semibold text-foreground">{way.name}:</strong> {way.text}
              </span>
            </div>
          ))}
        </div>
      </>
    ),
  },
  {
    eyebrow: 'Vorlagen',
    title: 'Vorlage auswählen und anpassen',
    visual: (country) => (
      <div className="grid w-full grid-cols-4 gap-2 md:w-[82%] md:grid-cols-2 md:gap-3">
        {TEMPLATES[country].map((key, i) => (
          <motion.img
            key={key}
            src={`${IMG}/${key}.webp`}
            alt=""
            className="aspect-[4/5] w-full rounded-md object-cover shadow-lg ring-1 ring-black/10"
            {...enter(i * 60, { y: 12 })}
          />
        ))}
      </div>
    ),
    body: () => (
      <>
        <Lead>
          Keine Lust, bei null anzufangen? In der Vorlagen-Datenbank warten fertige Sharepics im
          Grünen-Design. Du tauschst nur noch den Inhalt.
        </Lead>
        <Features
          items={[
            'Vom Zitat über den Countdown zur Wahl bis zum Vergleich, durchsuchbar nach Thema und Form.',
            'Lieblinge merken und jede Vorlage als eigene Kopie weiterbearbeiten.',
          ]}
        />
      </>
    ),
  },
  {
    eyebrow: 'Studio und Chat',
    title: 'Sharepic aus einer Beschreibung erstellen',
    visual: (country) => <ChatMock country={country} />,
    body: () => (
      <>
        <Lead>
          Beschreib im Studio, was du sagen willst, oder bitte im Chat um ein Sharepic zu deinem
          Beitrag. Der Grünerator sucht die passende Form aus, verteilt den Text auf die Slides und
          setzt die Akzente.
        </Lead>
        <Features
          items={[
            '15 Formen: Zitat, Termine, Faktencheck, Große Zahl, Diagramm mit Quelle und mehr.',
            'Im Chat greift das Sharepic auf, was ihr gerade geschrieben habt. Passende Vorlagen schlägt er gleich mit vor.',
            'Eigene Fotos von der Aktion oder vom Infostand kommen direkt mit ins Bild.',
            'Änderungen schreibst du einfach dazu: „Mach Slide 2 kürzer“. Farben und Varianten wechselst du per Klick.',
          ]}
        />
      </>
    ),
  },
  {
    eyebrow: 'Editor',
    title: 'Texte und Elemente im Editor bearbeiten',
    visual: (country) => <EditorMock country={country} />,
    body: () => (
      <>
        <Lead>
          Die KI macht den ersten Wurf, das letzte Wort hast du: Mit „Im Editor öffnen“ wird dein
          Sharepic zur Leinwand, die du frei bearbeitest, so wie du es von Canva kennst.
        </Lead>
        <Features
          items={[
            'Texte per Doppelklick direkt auf der Leinwand umschreiben und formatieren.',
            'Größen, Positionen und Gestaltungselemente einzeln anpassen.',
            'Jede Slide eines Karussells wird eine eigene Seite.',
          ]}
        />
      </>
    ),
  },
  {
    eyebrow: 'Jetzt loslegen',
    title: 'Erstes Sharepic im Studio erstellen',
    visual: (country) => (
      <div className="flex w-[70%] items-start justify-center gap-3 md:w-[86%]">
        {[`${country}-emoji`, `${country}-diagramm`, `${country}-markierungen`].map((key, i) => (
          <motion.img
            key={key}
            src={`${IMG}/${key}.webp`}
            alt=""
            className={`w-[31%] rounded-md shadow-lg ring-1 ring-black/10 ${i === 1 ? 'mt-8' : ''}`}
            {...enter(i * 90, { y: 14 })}
          />
        ))}
      </div>
    ),
    body: (_country, { openStudio, giveFeedback }) => (
      <>
        <Lead>
          Die Sharepics sind neu und können viel. Gerade deshalb läuft noch nicht alles rund: Prüf
          Zahlen, Zitate und Quellen vor dem Veröffentlichen.
        </Lead>
        <Lead>
          Wenn etwas hakt oder dir etwas fehlt, sag es uns über den Feedback-Button. Jede Meldung
          hilft, die Sharepics besser zu machen.
        </Lead>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <Button size="brand-md" className="rounded-full" onClick={openStudio}>
            Zum Studio
            <HiArrowRight className="size-5" />
          </Button>
          {giveFeedback ? (
            <Button variant="ghost" size="lg" className="rounded-full" onClick={giveFeedback}>
              Feedback geben
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">
              Den Feedback-Button schaltest du unter Einstellungen → Allgemein ein.
            </span>
          )}
        </div>
        <div className="mt-auto flex flex-col gap-1.5 text-sm">
          <span className="font-semibold">Mehr in der Doku</span>
          {DOCS_LINKS.map((link) => (
            <a
              key={link.path}
              href={`${getDocsUrl()}${link.path}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 self-start text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {link.label}
              <HiOutlineArrowTopRightOnSquare className="size-4" />
            </a>
          ))}
        </div>
      </>
    ),
  },
];

interface SharepicAnnouncementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SharepicAnnouncementDialog({
  open,
  onOpenChange,
}: SharepicAnnouncementDialogProps) {
  const navigate = useNavigate();
  const country: Country = useAuthStore((s) => s.locale) === 'de-AT' ? 'at' : 'de';
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index]!;
  const isLast = index === SLIDES.length - 1;

  const actions: SlideActions = {
    openStudio: () => {
      onOpenChange(false);
      void navigate('/studio');
    },
    // Erst schließen, dann das Feedback-Formular öffnen: es fotografiert offene Dialoge mit.
    giveFeedback: canRequestFeedback()
      ? () => {
          onOpenChange(false);
          setTimeout(requestFeedback, 250);
        }
      : null,
  };
  const step = (delta: number) =>
    setIndex((i) => Math.min(SLIDES.length - 1, Math.max(0, i + delta)));
  // Pfeiltasten und Wischen auf der Video-Steuerleiste gehören dem Video (Spulen, Lautstärke),
  // nicht dem Folienwechsel. Die Steuerleiste lebt im Shadow DOM; ihre Events tragen das <video> als Ziel.
  const inVideo = (target: EventTarget | null) =>
    target instanceof Element && !!target.closest('video');
  const panStartedInVideo = useRef(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-none sm:max-w-[860px]"
        onOpenAutoFocus={() => setIndex(0)}
        onKeyDown={(e) => {
          if (inVideo(e.target)) return;
          if (e.key === 'ArrowRight') step(1);
          if (e.key === 'ArrowLeft') step(-1);
        }}
      >
        <MotionConfig reducedMotion="user">
          <motion.div
            className={`grid h-dvh sm:h-[min(680px,calc(100dvh-2rem))] md:h-[min(560px,calc(100dvh-2rem))] ${
              slide.wide
                ? 'grid-rows-[minmax(0,1fr)_auto]'
                : 'grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:grid-rows-1'
            }`}
            // Wischen nur per Touch: mit der Maus soll Text markieren keine Folie wechseln.
            // pan-y lässt das senkrechte Scrollen des Textes beim Browser.
            style={{ touchAction: 'pan-y' }}
            // Motion liest pointerup am window; nur beim pointerdown ist das Ziel noch verlässlich.
            onPointerDownCapture={(e) => {
              panStartedInVideo.current = inVideo(e.target);
            }}
            onPanEnd={(event, info) => {
              if (event.pointerType !== 'touch' || panStartedInVideo.current) return;
              if (Math.abs(info.offset.x) < 50 || Math.abs(info.offset.x) < Math.abs(info.offset.y))
                return;
              step(info.offset.x < 0 ? 1 : -1);
            }}
          >
            {slide.wide ? (
              <div
                key={`visual-${index}`}
                className="min-h-0 overflow-hidden bg-black max-sm:pt-[env(safe-area-inset-top)]"
              >
                {slide.visual(country)}
              </div>
            ) : (
              <div
                aria-hidden
                key={`visual-${index}`}
                className="flex h-[clamp(150px,30dvh,250px)] items-center justify-center gap-2 overflow-hidden bg-primary-100 px-12 py-5 max-sm:pt-[max(1.25rem,env(safe-area-inset-top))] md:relative md:h-auto md:gap-0 md:px-6 md:py-0 dark:bg-primary-900/40"
              >
                {slide.visual(country)}
              </div>
            )}

            <div className="flex min-h-0 flex-col">
              <div
                key={`body-${index}`}
                role="group"
                aria-roledescription="Folie"
                aria-label={`${index + 1} von ${SLIDES.length}`}
                className={`flex flex-1 flex-col gap-4 overflow-y-auto p-5 sm:p-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-2 md:p-8 ${
                  slide.wide ? 'sr-only' : ''
                }`}
              >
                <div className="flex flex-col gap-2 pr-6">
                  <span className="text-xs font-bold tracking-wider text-primary-600 uppercase dark:text-primary-300">
                    {slide.eyebrow}
                  </span>
                  <DialogTitle className="m-0 text-xl leading-tight font-bold sm:text-2xl">
                    {slide.title}
                  </DialogTitle>
                  <DialogDescription className="sr-only">
                    Folie {index + 1} von {SLIDES.length} der Einführung in die neuen Sharepics
                  </DialogDescription>
                </div>
                {slide.body(country, actions)}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-grey-200 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4 md:px-8 dark:border-grey-700">
                <Button
                  variant="ghost"
                  onClick={() => step(-1)}
                  className={index === 0 ? 'invisible' : ''}
                  aria-hidden={index === 0}
                  tabIndex={index === 0 ? -1 : 0}
                >
                  <HiArrowLeft className="size-4" />
                  Zurück
                </Button>

                <div className="flex items-center gap-1.5">
                  {SLIDES.map((s, i) => (
                    <button
                      key={s.title}
                      type="button"
                      onClick={() => setIndex(i)}
                      aria-label={`Folie ${i + 1}: ${s.title}`}
                      aria-current={i === index ? 'step' : false}
                      className="flex size-6 items-center justify-center"
                    >
                      <span
                        className={`block h-2 rounded-full transition-all ${
                          i === index ? 'w-5 bg-primary-600' : 'w-2 bg-grey-300 dark:bg-grey-600'
                        }`}
                      />
                    </button>
                  ))}
                </div>

                <Button
                  size="lg"
                  className={`rounded-full ${isLast ? 'invisible' : ''}`}
                  onClick={() => step(1)}
                  aria-hidden={isLast}
                  tabIndex={isLast ? -1 : 0}
                >
                  Weiter
                  <HiArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        </MotionConfig>
      </DialogContent>
    </Dialog>
  );
}
