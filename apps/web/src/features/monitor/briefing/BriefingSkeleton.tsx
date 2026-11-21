import { cn } from '@gruenerator/ui';

import { Bone } from '@/components/dashboard/Bone';
import { DashboardPage, DASH_PAGE_TITLE } from '@/components/dashboard/DashboardPage';
import { DASH_CARD } from '@/components/dashboard/dashboardStyles';

// Routen-Fallback von /briefing. Importarm mit Absicht: `routes.ts` zieht dieses Modul in
// den Entry, die Ansicht mit ihren Karten (`BriefingView`) gehört in den Routen-Chunk.
// Form und Kartenmaße spiegeln `BriefingCard`/`BriefingRow`; bei Änderungen dort nachziehen.

function SkeletonCard() {
  return (
    <section
      aria-busy
      className={cn(
        'flex min-h-48 min-w-0 flex-[1_1_340px] flex-col gap-[clamp(18px,2.5vw,24px)] rounded-[20px] px-[clamp(20px,3vw,32px)] py-[clamp(22px,3vw,30px)]',
        DASH_CARD
      )}
    >
      <Bone className="h-6 w-40" />
      <div className="flex flex-col gap-2.5">
        <Bone className="h-4 w-full" />
        <Bone className="h-4 w-4/5" />
        <Bone className="h-4 w-3/5" />
      </div>
    </section>
  );
}

/** Die ganze Seite im Ladezustand — Routen-Fallback von /briefing. */
export function BriefingSkeleton() {
  return (
    <DashboardPage aria-busy>
      <h1 className={DASH_PAGE_TITLE}>Briefing</h1>
      <Bone className="h-6 w-3/5 max-w-xl" />
      <div className="flex flex-wrap items-stretch gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div className="flex flex-wrap items-stretch gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </DashboardPage>
  );
}
