import { cn } from '@gruenerator/ui';
import { type ComponentProps, type ReactNode } from 'react';

import { DASH_CARD } from '@/components/dashboard/dashboardStyles';

// Kartenhüllen der Dashboard-Karten (Schlagzeilen, Umfrage, Trends) im
// Arbeiten-Tab, damit Abstände und Breakpoints an genau einer Stelle stehen.
// Breakpoints wie im Entwurf: Smartphone < md, Tablet md–lg, Desktop ab lg.

// Breiter Desktop (ab xl, 1280 px): eine Zeile — Slider, Trends,
// Umfragen. Die Kennzahl-Karten nehmen die Zeilenhöhe an, tragen sie aber nicht
// (h-0 + min-h-full): die Höhe bestimmt der Slider. Darunter — Smartphone,
// Tablet und schmaler Desktop — Slider oben, die beiden Karten nebeneinander;
// zwischen 1024 und 1280 px blieben dem Slider sonst kaum 340 px.
// Keine feste Zeile (`row-start`) setzen: Grid platziert Elemente mit fester
// Zeile vor den übrigen, der Slider landete dann rechts statt links.
export const ASIDE_SLOT = 'flex min-w-0 flex-col xl:h-0 xl:min-h-full';

type SectionProps = Omit<ComponentProps<'section'>, 'className' | 'children'>;

/** Weiße Karte des Kopf-Sliders. */
export function SliderCard({ children, ...rest }: { children: ReactNode } & SectionProps) {
  return (
    // @container: ob Überschrift und Teaser nebeneinander stehen, entscheidet die
    // Kartenbreite (ab 768 px, `@3xl:` im Slider), nicht das Fenster — die Karte
    // ist je nach Raster unterschiedlich breit.
    <section
      {...rest}
      className={cn('@container flex flex-col overflow-hidden rounded-[20px]', DASH_CARD)}
    >
      {children}
    </section>
  );
}

/** Kennzahl-Karte rechts (Umfrage, Trends). */
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
        DASH_CARD,
        className
      )}
    >
      {children}
    </section>
  );
}

/** Überschrift einer Kennzahl-Karte — und des Sliders, damit alle drei Köpfe gleich aussehen. */
export const ASIDE_TITLE = 'm-0 text-sm font-bold text-foreground md:text-[15px] xl:text-base';

/**
 * Link in einer Kartenüberschrift: Zielfläche 24 px hoch (WCAG 2.5.8) über
 * Innenabstand, den ein gleich großer negativer Außenabstand wieder aufhebt —
 * die Zeile bleibt so hoch wie die Schrift.
 */
export const ASIDE_TITLE_LINK =
  'inline-block rounded py-1 -my-1 text-inherit no-underline hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--dash-mg) focus-visible:ring-offset-2 focus-visible:ring-offset-(--dash-card)';

/** Abstand der Slider-Überschrift zum Kartenrand, wie das Innenmaß der Kennzahl-Karten. */
export const SLIDER_HEAD = 'px-[18px] pt-[18px] md:px-[26px] md:pt-[22px] lg:px-8 xl:pt-6';
