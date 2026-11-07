import { cn } from '@gruenerator/ui';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  type TouchEvent,
} from 'react';

import { DASH_FOCUS } from './dashboardStyles';

// Folien der Dashboard-Karten auf /wissen: Schlagzeilen (wechseln durch), Trends
// und Umfragen (nur von Hand).

const reducedMotionQuery = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Ab so viel waagerechter Bewegung gilt eine Berührung als Wischen. */
const SWIPE_MIN_PX = 40;

/**
 * Folienstand mit Wischen und — wenn `intervalMs` gesetzt ist — Durchwechseln:
 * alle `intervalMs` zur nächsten Folie, außer der Mauszeiger oder der Fokus
 * steht darin, jemand hat gewählt oder gewischt (dann bleibt die Folie), oder
 * das System wünscht weniger Bewegung. `null` = nur von Hand.
 */
export function useAutoAdvance(count: number, intervalMs: number | null) {
  const [index, setIndex] = useState(0);
  const [stopped, setStopped] = useState(reducedMotionQuery);
  const touch = useRef<{ x: number; y: number } | null>(null);
  // Mauszeiger/Fokus halten das Durchwechseln an. Bewusst Refs statt State: sonst
  // rendert jedes Hineinfahren die ganze Karte samt Folien neu — auch dort, wo gar
  // nichts durchwechselt (Trends, Umfragen).
  const held = useRef({ hover: false, focus: false });
  const restart = useRef<() => void>(() => {});
  // Nur von Hand gewechselte Folien werden angesagt — Durchwechseln bliebe sonst ein Dauerrauschen.
  const [manual, setManual] = useState(false);

  useEffect(() => {
    if (intervalMs === null || stopped || count < 2) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        if (!held.current.hover && !held.current.focus) setIndex((i) => (i + 1) % count);
        schedule();
      }, intervalMs);
    };
    schedule();
    // Nach dem Loslassen bekommt die Folie wieder die volle Zeit.
    restart.current = () => {
      clearTimeout(timer);
      schedule();
    };
    return () => {
      clearTimeout(timer);
      restart.current = () => {};
    };
  }, [stopped, count, intervalMs]);

  const release = (key: 'hover' | 'focus') => {
    held.current[key] = false;
    restart.current();
  };

  // Kommen weniger Folien als vorher, bleibt der Index gültig.
  const active = count > 0 ? index % count : 0;
  // Stabil (useCallback), damit memoisierte Punkte und Pause-Knopf beim Folienwechsel nicht mitrendern.
  const select = useCallback(
    (i: number) => {
      setStopped(true);
      setManual(true);
      setIndex(((i % count) + count) % count);
    },
    [count]
  );
  const togglePlaying = useCallback(() => setStopped((v) => !v), []);

  return {
    active,
    select,
    /** Index der zuletzt von Hand gewählten Folie, sonst `null` — Inhalt für `SlideStatus`. */
    announced: manual ? active : null,
    /** Läuft das Durchwechseln gerade (nicht angehalten, nicht von Hand gestellt)? */
    playing: intervalMs !== null && !stopped && count > 1,
    /** Pause/Weiter — WCAG 2.2.2 verlangt einen sichtbaren Weg, das Durchwechseln anzuhalten. */
    togglePlaying,
    containerProps: {
      onTouchStart: (e: TouchEvent) => {
        const t = e.touches[0];
        touch.current = t ? { x: t.clientX, y: t.clientY } : null;
      },
      onTouchEnd: (e: TouchEvent) => {
        const start = touch.current;
        const t = e.changedTouches[0];
        touch.current = null;
        if (!start || !t || count < 2) return;
        const dx = t.clientX - start.x;
        // Senkrechtes Wischen bleibt Scrollen.
        if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(t.clientY - start.y)) return;
        select(active + (dx < 0 ? 1 : -1));
      },
      onMouseEnter: () => {
        held.current.hover = true;
      },
      onMouseLeave: () => release('hover'),
      onFocus: () => {
        held.current.focus = true;
      },
      onBlur: (e: FocusEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget)) release('focus');
      },
    },
  };
}

/**
 * Punkte unter den Folien; der aktive ist lang. Jeder Punkt springt zu seiner
 * Folie — die Alternative zum Wischen (WCAG 2.5.1). Mit Pfeiltasten, Pos1 und
 * Ende wandert der Fokus von Punkt zu Punkt und nimmt die Folie mit.
 */
export function SlideDots({
  labels,
  active,
  onSelect,
}: {
  /** Zugänglicher Name je Punkt, z. B. „Meldung 2 von 4". */
  labels: string[];
  active: number;
  onSelect: (i: number) => void;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const last = labels.length - 1;
    const target =
      e.key === 'ArrowRight'
        ? (i + 1) % labels.length
        : e.key === 'ArrowLeft'
          ? (i - 1 + labels.length) % labels.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (target === null) return;
    e.preventDefault();
    onSelect(target);
    buttons.current[target]?.focus();
  };
  return (
    <div className="flex">
      {labels.map((label, i) => (
        <button
          key={label}
          ref={(el) => {
            buttons.current[i] = el;
          }}
          type="button"
          onClick={() => onSelect(i)}
          onKeyDown={(e) => onKeyDown(e, i)}
          aria-label={label}
          aria-current={i === active}
          // 24 × 24 px Zielfläche (WCAG 2.5.8), der sichtbare Punkt bleibt klein.
          className={cn(
            'flex h-6 min-w-6 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0',
            DASH_FOCUS
          )}
        >
          <span
            className={cn(
              'block h-2 rounded-full transition-[width,background-color] duration-300 motion-reduce:transition-none',
              i === active ? 'w-[22px] bg-(--dash-mg)' : 'w-2 bg-(--dash-mg-dot)'
            )}
          />
        </button>
      ))}
    </div>
  );
}

/** Sagt eine von Hand gewählte Folie an (unsichtbar, `aria-live`). Leer, solange niemand gewechselt hat. */
export function SlideStatus({ text }: { text: string | null }) {
  return (
    <span className="sr-only" aria-live="polite" aria-atomic="true">
      {text ?? ''}
    </span>
  );
}

export interface Slide {
  key: string;
  /** Name der Folie für Vorlesesoftware und ihren Punkt. */
  label: string;
  content: ReactNode;
}

/** Folien liegen übereinander und blenden über — die Karte behält die Höhe der größten. */
const slideClass = (active: boolean) =>
  cn(
    'min-h-0 [grid-area:1/1] transition-opacity duration-500 motion-reduce:transition-none',
    active ? 'opacity-100' : 'opacity-0'
  );

/**
 * Folien in einer Kennzahl-Karte (/wissen: Trends, Umfragen): wischen oder
 * Punkte wählen, ohne Durchwechseln — anders als der Schlagzeilen-Slider. Eine
 * einzelne Folie steht ohne Punkte da. `slideClassName` legt das Innenleben
 * jeder Folie aus (sie füllen die Karte, `flex-1`).
 */
export function SlideStack({
  slides,
  slideClassName,
}: {
  slides: Slide[];
  slideClassName?: (key: string) => string;
}) {
  const { active, select, announced, containerProps } = useAutoAdvance(slides.length, null);
  const carousel = slides.length > 1;
  return (
    <div
      {...(carousel ? { 'aria-roledescription': 'Karussell', ...containerProps } : {})}
      className="flex min-h-0 flex-1 touch-pan-y flex-col gap-2.5"
    >
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)]">
        {slides.map((slide, i) => (
          <div
            key={slide.key}
            {...(carousel ? { 'aria-roledescription': 'Folie' } : {})}
            aria-label={slide.label}
            inert={i !== active}
            className={cn(slideClass(i === active), slideClassName?.(slide.key))}
          >
            {slide.content}
          </div>
        ))}
      </div>
      {carousel && (
        <>
          <SlideDots labels={slides.map((s) => s.label)} active={active} onSelect={select} />
          <SlideStatus
            text={
              announced === null
                ? null
                : `${slides[announced].label}, ${announced + 1} von ${slides.length}`
            }
          />
        </>
      )}
    </div>
  );
}
