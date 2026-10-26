import { type InstanceAdminAppBundle } from '@gruenerator/contracts';
import {
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@gruenerator/ui';

import { useInstanceAdminAppBundles } from '../hooks/useInstanceOverview';

const PLATFORM_LABEL: Record<InstanceAdminAppBundle['platform'], string> = {
  ios: 'iOS',
  android: 'Android',
};

function formatDay(day: string): string {
  const [year, month, date] = day.split('-');
  return `${date}.${month}.${year}`;
}

function describeBundle(bundle: InstanceAdminAppBundle): string {
  if (bundle.updateId === null) return 'Store-Build';
  const stand = bundle.updateDate ? `Stand ${formatDay(bundle.updateDate)}` : 'Update';
  return `${stand} · ${bundle.updateId.slice(0, 8)}`;
}

export default function AppUpdatesTab() {
  const { data: bundles, isLoading } = useInstanceAdminAppBundles();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-sm">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (!bundles || bundles.length === 0) {
    return (
      <p className="text-sm text-grey-500 dark:text-grey-400 py-lg text-center">
        In den letzten 30 Tagen hat keine App-Version angefragt.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-grey-200 dark:border-grey-700 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Plattform</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Stand</TableHead>
            <TableHead className="text-right">Heute</TableHead>
            <TableHead className="text-right">7 Tage</TableHead>
            <TableHead>Gesehen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bundles.map((bundle) => (
            <TableRow key={`${bundle.platform}|${bundle.appVersion}|${bundle.updateId ?? ''}`}>
              <TableCell className="font-medium">{PLATFORM_LABEL[bundle.platform]}</TableCell>
              <TableCell className="text-sm">{bundle.appVersion}</TableCell>
              <TableCell className="text-sm text-grey-500" title={bundle.updateId ?? undefined}>
                {describeBundle(bundle)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{bundle.usersToday}</TableCell>
              <TableCell className="text-right tabular-nums">{bundle.usersLast7Days}</TableCell>
              <TableCell className="text-sm text-grey-500">
                {bundle.firstSeen === bundle.lastSeen
                  ? formatDay(bundle.lastSeen)
                  : `${formatDay(bundle.firstSeen)} – ${formatDay(bundle.lastSeen)}`}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
