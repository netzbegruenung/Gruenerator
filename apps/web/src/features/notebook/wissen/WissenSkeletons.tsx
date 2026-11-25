import { cn } from '@gruenerator/ui';

import { Bone } from '@/components/dashboard/Bone';

// Ladezustände der Dashboard-Karten (Schlagzeilen, Umfrage, Trends) im
// Arbeiten-Tab. Jede Karte hat ihren Platzhalter in der Form des späteren
// Inhalts, damit beim Eintreffen nichts springt.

export function SliderSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-[18px] pb-3 pt-2.5 md:px-[26px] md:pb-5 md:pt-3 lg:px-8 lg:pb-[22px] lg:pt-3.5">
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
