import { Skeleton, cn } from '@gruenerator/ui';

import {
  AsideCard,
  SHELF_GRID,
  SHELF_TILE,
  ShelfSection,
  SliderCard,
  WissenDashboardFrame,
  WissenMainGrid,
} from './WissenLayout';
import { WD_CARD, WD_TINT } from './wissenStyles';

// Ladezustände des Wissens-Dashboards. Jeder Abschnitt hat seinen Platzhalter
// in der Form des späteren Inhalts, damit beim Eintreffen nichts springt; der
// Routen-Fallback setzt dieselben Teile zur ganzen Seite zusammen. Dieses Modul
// zieht keinen Chat-Code nach, damit der Fallback sofort steht.

/** Ein grauer Balken in der Tönung der Seite. */
export function Bone({ className }: { className?: string }) {
  return <Skeleton className={cn('rounded bg-(--wd-skeleton)', className)} />;
}

export function SliderSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-[18px] pb-3 pt-4 md:px-[26px] md:pb-5 md:pt-6 lg:px-8 lg:pb-[22px] lg:pt-7">
      <Bone className="h-3.5 w-48" />
      <Bone className="h-6 w-11/12 md:h-7" />
      <Bone className="h-6 w-3/5 md:h-7" />
      <Bone className="mt-1 hidden h-4 w-full md:block lg:hidden" />
      <div className="mt-3 flex gap-1.5">
        <Bone className="h-2 w-[22px] rounded-full" />
        {[0, 1, 2].map((i) => (
          <Bone key={i} className="size-2 rounded-full" />
        ))}
      </div>
    </div>
  );
}

export function PollSkeleton() {
  return (
    <>
      <Bone className="h-10 w-28 md:h-12 md:w-36 xl:h-14 xl:w-40" />
      <Bone className="h-9 w-full md:col-span-2 xl:order-2 xl:h-14" />
      <span className="flex flex-col gap-1.5 max-md:hidden xl:order-3">
        {[0, 1, 2].map((i) => (
          <Bone key={i} className="h-4 w-full" />
        ))}
      </span>
    </>
  );
}

export function TrendsSkeleton() {
  return (
    <ul className="m-0 flex list-none flex-col gap-[9px] p-0 md:gap-3">
      {['w-1/2', 'w-2/5', 'w-3/5', 'w-1/3'].map((w, i) => (
        <li key={w} className={cn('flex flex-col gap-1', i === 3 && 'max-md:hidden')}>
          <Bone className={cn('h-4', w)} />
          <Bone className="h-1 w-full rounded-full md:h-1.5" />
        </li>
      ))}
    </ul>
  );
}

/** Platzhalter für die Notebook-Kacheln (vor dem Laden des Chunks). */
export function ShelfSkeleton() {
  return (
    <div className={SHELF_GRID}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={cn(SHELF_TILE, 'justify-end gap-1.5', WD_TINT)}>
          <Bone className="h-5 w-3/4 bg-(--wd-mg-tint-2)" />
          <Bone className="h-3.5 w-1/2 bg-(--wd-mg-tint-2)" />
        </div>
      ))}
    </div>
  );
}

/** Der Composer, solange er noch nicht geladen ist: dieselbe Pille, leer. */
function ComposerSkeleton() {
  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-[760px] items-center gap-2 rounded-full border border-border py-1.5 pl-6 pr-1.5 shadow-md max-md:shadow-sm max-md:pl-[18px]',
        WD_CARD
      )}
    >
      <Bone className="h-4 w-48 flex-1" />
      <span className={cn('size-11 shrink-0 rounded-full', WD_TINT)} />
    </div>
  );
}

/** Die ganze Seite als Skeleton — Fallback der Route, solange der Seiten-Chunk lädt. */
export function WissenDashboardSkeleton() {
  return (
    <WissenDashboardFrame
      // Der Titel steht in der Seiten-Config, die erst mit dem Chunk kommt — bis
      // dahin ein Platzhalter. Als <span>, weil er in der <h1> steht.
      title={
        <span
          aria-hidden
          className="inline-block h-[1em] w-[12em] max-w-full animate-pulse rounded bg-(--wd-skeleton) align-middle"
        />
      }
      composer={<ComposerSkeleton />}
      aria-busy
    >
      <WissenMainGrid
        slider={
          <SliderCard>
            <SliderSkeleton />
          </SliderCard>
        }
        poll={
          <AsideCard>
            <Bone className="h-4 w-24" />
            <PollSkeleton />
          </AsideCard>
        }
        trends={
          <AsideCard>
            <Bone className="h-4 w-24" />
            <TrendsSkeleton />
          </AsideCard>
        }
      />
      <ShelfSection header={<Bone className="h-6 w-48" />}>
        <ShelfSkeleton />
      </ShelfSection>
    </WissenDashboardFrame>
  );
}
