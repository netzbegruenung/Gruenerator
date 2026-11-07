import { cn } from '@gruenerator/ui';
import { ChevronDown } from 'lucide-react';
import { useRef, type ReactNode } from 'react';

import {
  DASH_ACCENT_TEXT,
  DASH_CARD,
  DASH_DISPLAY,
  DASH_FOCUS,
  DASH_HEADING,
} from '@/components/dashboard/dashboardStyles';

/** Die sechs Karten von /briefing; die Id steht als `?karte=` in der URL. */
export const BRIEFING_CARDS = [
  'themen',
  'keywords',
  'trends',
  'wichtig',
  'gruene',
  'landesverbaende',
] as const;
export type BriefingCardId = (typeof BRIEFING_CARDS)[number];

/** Was jede Karte von der Seite bekommt: ob sie offen ist und wie sie umschaltet. */
export interface BriefingCardState {
  id: BriefingCardId;
  open: boolean;
  onToggle: () => void;
}

/**
 * Eine Reihe Karten. Sie brechen um, sobald eine schmaler als 340 px würde.
 * Eingeklappt sind alle Karten einer Reihe gleich hoch; liegt die offene Karte
 * in der Reihe, behalten die Nachbarn ihre Höhe, statt mit leerer Fläche
 * mitzuwachsen (Abweichung vom Entwurf, 07.11.2026).
 */
export function BriefingRow({ hasOpen, children }: { hasOpen: boolean; children: ReactNode }) {
  return (
    <div className={cn('flex flex-wrap gap-4', hasOpen ? 'items-start' : 'items-stretch')}>
      {children}
    </div>
  );
}

/**
 * Hülle einer Briefing-Karte: Kopf als Aufklapp-Knopf (Akkordeon-Muster,
 * `h2 > button[aria-expanded]`), darunter der Inhalt der Karte. Die Karte
 * entscheidet selbst, was sie ein- und ausgeklappt zeigt. `more` setzt unten
 * zusätzlich „Mehr/Weniger" — nur, wenn es auch mehr gibt.
 */
export function BriefingCard({
  state,
  title,
  more = false,
  busy = false,
  children,
}: {
  state: BriefingCardState;
  title: string;
  more?: boolean;
  busy?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const bodyId = `briefing-${state.id}`;

  const toggle = () => {
    // Eine lange offene Karte, deren Kopf schon oben aus dem Bild ist: nach dem
    // Zuklappen stünde man sonst irgendwo weiter unten auf der Seite.
    if (state.open && (ref.current?.getBoundingClientRect().top ?? 0) < 0) {
      ref.current?.scrollIntoView({ block: 'start' });
    }
    state.onToggle();
  };

  return (
    <section
      ref={ref}
      aria-busy={busy}
      className={cn(
        'flex min-w-0 flex-[1_1_340px] flex-col gap-[clamp(18px,2.5vw,24px)] rounded-[20px] px-[clamp(20px,3vw,32px)] py-[clamp(22px,3vw,30px)]',
        DASH_CARD,
        state.open && 'shadow-[inset_0_0_0_2px_var(--dash-mg)]'
      )}
    >
      <h2 className="m-0">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={state.open}
          aria-controls={bodyId}
          className={cn(
            'flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-md border-0 bg-transparent p-0 text-left',
            DASH_FOCUS
          )}
        >
          <span
            className={cn('text-[clamp(19px,2.2vw,22px)] font-bold', DASH_DISPLAY, DASH_HEADING)}
          >
            {title}
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              'size-[18px] shrink-0 text-muted-foreground transition-transform',
              state.open && 'rotate-180'
            )}
          />
        </button>
      </h2>
      <div id={bodyId}>{children}</div>
      {more && (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={state.open}
          aria-controls={bodyId}
          className={cn(
            'mt-auto min-h-11 cursor-pointer self-start rounded-md border-0 bg-transparent px-0 py-3 text-[15px] font-bold',
            DASH_ACCENT_TEXT,
            DASH_FOCUS
          )}
        >
          {state.open ? 'Weniger' : 'Mehr'}
        </button>
      )}
    </section>
  );
}
