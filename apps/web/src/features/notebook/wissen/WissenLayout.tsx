import { cn } from '@gruenerator/ui';
import { type ComponentProps, type ReactNode } from 'react';

import { WorkplaceHero } from '../../workplace/components/WorkplaceHero';

import { WD_CARD } from './wissenStyles';

// Das Gerüst des Wissens-Dashboards — Seite, Raster, Kartenhüllen. Die echte
// Seite und ihr Skeleton bauen beide daraus, damit Abstände und Breakpoints an
// genau einer Stelle stehen. Breakpoints wie im Entwurf: Smartphone < md,
// Tablet md–lg, Desktop ab lg.

/** Abstand zwischen den Blöcken der Seite (Entwurf: 12 / 18 / 24 px). */
const PAGE_GAP = 'gap-3 md:gap-[18px] lg:gap-6';

/**
 * Seite des Dashboards: Überschrift und Composer im selben `WorkplaceHero` wie
 * auf der Arbeiten-Seite (bleibt pixelgleich), darunter die Abschnitte.
 */
export function WissenDashboardFrame({
  title,
  composer,
  children,
  'aria-busy': busy,
}: {
  title: ReactNode;
  composer: ReactNode;
  children: ReactNode;
  'aria-busy'?: boolean;
}) {
  return (
    // shrink-0: der Rahmen sitzt als Flex-Kind im scrollenden Chat-Container; ohne
    // es staucht `min-h-dvh` ihn auf Fensterhöhe und die Seitenfläche endet mitten im Inhalt.
    <div
      className="wissen-dashboard min-h-dvh shrink-0 bg-(--wd-page) text-foreground"
      aria-busy={busy}
    >
      <div
        className={cn(
          'mx-auto flex w-full max-w-[1280px] flex-col px-4 pb-7 md:px-8 md:pb-9 lg:px-14 lg:pb-12',
          PAGE_GAP
        )}
      >
        {/* Block-Hülle: in der Flex-Spalte schrumpfte der per mx-auto zentrierte Hero auf Inhaltsbreite. */}
        <div>
          <WorkplaceHero title={title}>{composer}</WorkplaceHero>
        </div>
        {children}
      </div>
    </div>
  );
}

// Breiter Desktop (ab xl, 1280 px): eine Zeile — Slider, Umfragen, Im
// Gespräch. Die Kennzahl-Karten nehmen die Zeilenhöhe an, tragen sie aber nicht
// (h-0 + min-h-full): die Höhe bestimmt der Slider. Darunter — Smartphone,
// Tablet und schmaler Desktop — Slider oben, die beiden Karten nebeneinander;
// zwischen 1024 und 1280 px blieben dem Slider sonst kaum 340 px.
// Keine feste Zeile (`row-start`) setzen: Grid platziert Elemente mit fester
// Zeile vor den übrigen, der Slider landete dann rechts statt links.
const ASIDE_SLOT = 'flex min-w-0 flex-col xl:h-0 xl:min-h-full';

/** Kopf-Slider und die beiden Kennzahl-Karten in ihrem Raster. */
export function WissenMainGrid({
  slider,
  poll,
  trends,
}: {
  slider: ReactNode;
  poll: ReactNode;
  trends: ReactNode;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-2.5 gap-y-3 md:gap-x-3 md:gap-y-[18px] lg:gap-x-5 lg:gap-y-5 xl:grid-cols-[minmax(0,1fr)_240px_240px]">
      <div className="col-span-2 min-w-0 xl:col-span-1">{slider}</div>
      <div className={ASIDE_SLOT}>{poll}</div>
      <div className={ASIDE_SLOT}>{trends}</div>
    </div>
  );
}

type SectionProps = Omit<ComponentProps<'section'>, 'className' | 'children'>;

/** Weiße Karte des Kopf-Sliders. */
export function SliderCard({ children, ...rest }: { children: ReactNode } & SectionProps) {
  return (
    // @container: ob Überschrift und Teaser nebeneinander stehen, entscheidet die
    // Kartenbreite (ab 768 px, `@3xl:` im Slider), nicht das Fenster — die Karte
    // ist je nach Raster unterschiedlich breit.
    <section
      {...rest}
      className={cn('@container flex flex-col overflow-hidden rounded-[20px]', WD_CARD)}
    >
      {children}
    </section>
  );
}

/** Kennzahl-Karte rechts (Umfrage, Im Gespräch). */
export function AsideCard({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & SectionProps) {
  return (
    <section
      {...rest}
      className={cn(
        'flex min-w-0 flex-1 flex-col gap-2.5 rounded-2xl p-[18px] md:rounded-[20px] md:px-6 md:py-[22px] xl:min-h-0 xl:justify-between xl:overflow-hidden xl:px-[26px] xl:py-6',
        WD_CARD,
        className
      )}
    >
      {children}
    </section>
  );
}

/** Überschrift einer Kennzahl-Karte. */
export const ASIDE_TITLE = 'm-0 text-sm font-bold text-foreground md:text-[15px] xl:text-base';

/** „Deine Notebooks"-Block: Kopfzeile, Kacheln, aufgeklappte Liste. */
export function ShelfSection({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 md:gap-[18px] lg:gap-6">
      <div className="flex items-center justify-between pt-2.5 lg:items-baseline lg:pt-3">
        {header}
      </div>
      {children}
    </section>
  );
}

/** Raster der Notebook-Kacheln: 2 Spalten auf dem Smartphone, sonst 4. */
export const SHELF_GRID = 'grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3 lg:gap-3.5';

/** Eine Notebook-Kachel: Chevron oben rechts (ab Tablet), Name und Zeile unten. */
export const SHELF_TILE =
  'flex min-h-[84px] flex-col justify-end rounded-2xl md:justify-between px-4 py-3.5 text-left no-underline md:min-h-[120px] md:px-[18px] md:py-4 lg:min-h-[150px] lg:p-5';
