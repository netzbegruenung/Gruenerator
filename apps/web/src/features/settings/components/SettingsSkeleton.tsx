import { Skeleton } from '@gruenerator/ui';

import { type SettingsTab } from '../settingsDialogStore';

/**
 * Loading placeholders for the settings dialog, shaped like the tab that is
 * about to appear.
 *
 * A centred spinner told the user "something is happening somewhere"; these
 * reserve the actual layout, so the content lands in place instead of pushing
 * a spinner out of the way. `data-reduce-motion` on <html> already kills the
 * pulse for anyone who asked for reduced motion — no extra guard needed here.
 */

function LoadingRegion({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" aria-label="Wird geladen" aria-busy="true">
      {children}
    </div>
  );
}

/** Mirrors <SettingsRow>: title + description left, control right. */
export function SettingsRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <LoadingRegion>
      <div className="-my-4 divide-y divide-grey-200 dark:divide-grey-800">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-md py-4">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-40 max-w-full" />
              <Skeleton className="mt-1.5 h-3 w-64 max-w-full" />
            </div>
            <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

/** Mirrors the bordered cards the list-style tabs render per entry. */
export function SettingsCardsSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <LoadingRegion>
      <div className="flex flex-col gap-sm">
        {Array.from({ length: cards }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-md rounded-xl border border-grey-200 bg-background p-md dark:border-grey-800"
          >
            <Skeleton className="size-5 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-48 max-w-full" />
              <Skeleton className="mt-1.5 h-3 w-full max-w-[22rem]" />
            </div>
            <Skeleton className="h-8 w-20 shrink-0" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

/**
 * The real group sizes, so the placeholder is as tall as what replaces it — a
 * short grid that grows on load pushes the second heading down while you are
 * reading it. Hardcoded rather than derived: pulling the preset table into the
 * always-loaded dialog shell to size a placeholder is the wrong trade.
 */
const BACKGROUND_GROUPS = [
  { id: 'bunt', tiles: 4 },
  { id: 'einfarbig', tiles: 6 },
];

/** Intro line plus the grouped preview tiles of the background picker. */
export function SettingsTilesSkeleton({
  groups = BACKGROUND_GROUPS,
}: {
  groups?: typeof BACKGROUND_GROUPS;
}) {
  return (
    <LoadingRegion>
      <div className="flex flex-col gap-lg">
        <Skeleton className="h-3 w-full max-w-prose" />
        {groups.map(({ id, tiles }) => (
          <div key={id} className="flex flex-col gap-sm">
            <div>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-1.5 h-3 w-56 max-w-full" />
            </div>
            <div className="grid grid-cols-2 gap-md sm:grid-cols-3">
              {Array.from({ length: tiles }, (_, i) => (
                <div key={i} className="flex flex-col gap-xs">
                  <Skeleton className="aspect-[16/10] w-full rounded-xl" />
                  <Skeleton className="h-4 w-24 max-w-full" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

/** Intro paragraph plus a textarea-sized block. */
export function SettingsFormSkeleton() {
  return (
    <LoadingRegion>
      <div className="flex flex-col gap-sm">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-full max-w-md" />
        <Skeleton className="h-24 w-full rounded-md" />
      </div>
    </LoadingRegion>
  );
}

/** Tile grid plus the daily bar chart of the "Nutzung" tab. */
export function SettingsStatsSkeleton() {
  return (
    <LoadingRegion>
      <div className="flex flex-col gap-lg">
        <div className="flex flex-wrap items-center justify-between gap-sm">
          <Skeleton className="h-4 w-72 max-w-full" />
          <Skeleton className="h-9 w-48 shrink-0 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 gap-sm sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="flex flex-col gap-1 rounded-xl border border-grey-200 p-md dark:border-grey-700"
            >
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-20" />
            </div>
          ))}
        </div>
        <div className="flex h-32 items-end gap-1">
          {/* Deterministic ramp, not random: a re-render must not reshuffle the bars. */}
          {Array.from({ length: 20 }, (_, i) => (
            <Skeleton
              key={i}
              className="min-w-0 flex-1 rounded-sm"
              style={{ height: `${30 + ((i * 37) % 65)}%` }}
            />
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}

const TAB_SKELETONS: Record<SettingsTab, () => React.ReactElement> = {
  // Schritt 1 der Einrichtung ist die Rollen-Karte.
  onboarding: () => <SettingsCardsSkeleton cards={1} />,
  allgemein: () => <SettingsRowsSkeleton rows={6} />,
  hintergrund: () => <SettingsTilesSkeleton />,
  // Zwei Schalter plus den Support-Block darunter.
  barrierefreiheit: () => <SettingsRowsSkeleton rows={3} />,
  datenschutz: () => <SettingsRowsSkeleton rows={2} />,
  friends: () => <SettingsCardsSkeleton cards={4} />,
  personalisierung: () => <SettingsFormSkeleton />,
  briefe: () => <SettingsCardsSkeleton cards={2} />,
  'texte-anlernen': () => <SettingsCardsSkeleton cards={4} />,
  erinnerungen: () => <SettingsCardsSkeleton cards={4} />,
  benachrichtigungen: () => <SettingsRowsSkeleton rows={2} />,
  wolke: () => <SettingsCardsSkeleton cards={2} />,
  websites: () => <SettingsCardsSkeleton cards={2} />,
  konnektoren: () => <SettingsCardsSkeleton cards={3} />,
  nutzung: () => <SettingsStatsSkeleton />,
};

/** Suspense fallback for a tab body whose chunk is still in flight. */
export function SettingsTabSkeleton({ tab }: { tab: SettingsTab }) {
  return TAB_SKELETONS[tab]();
}
