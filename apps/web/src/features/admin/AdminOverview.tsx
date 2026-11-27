import { type AdminStatsKind, type GetAdminStatsResponseDto } from '@gruenerator/contracts';
import { Badge, Button, Skeleton } from '@gruenerator/ui';
import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { formatCount, formatDate } from '../../utils/usageFormat';

import { type AdminSectionId } from './adminSections';
import { AdminPageHeader, AdminPanel, AdminStat, AdminStatGrid } from './components/adminUi';
import { useAdminReportStats } from './hooks/useAdminReports';
import { useAdminStats } from './hooks/useAdminStats';
import { useVorlagenStats } from './hooks/useAdminVorlagen';
import { useInstanceAdminUsers } from './hooks/useInstanceOverview';
import { useLandesverbaende } from './landesverband-assignment/hooks/useLvAdminAssignment';

const WINDOW_DAYS = 30;

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function last30Days() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - (WINDOW_DAYS - 1));
  return { from: isoDay(from), to: isoDay(to) };
}

/** Summe einer Reihe; `null`, wenn eine Zelle unterdrückt ist (zu kleine Gruppe). */
function sumOf(data: GetAdminStatsResponseDto | undefined, kind: AdminStatsKind): number | null {
  const series = data?.live.find((s) => s.kind === kind);
  if (!series) return null;
  let total = 0;
  for (const point of series.points) {
    if (point.total === null) return null;
    total += point.total;
  }
  return total;
}

const STAT_KINDS: { kind: AdminStatsKind; label: string }[] = [
  { kind: 'signups', label: 'Neue Konten' },
  { kind: 'chats', label: 'Chats' },
  { kind: 'documents', label: 'Dokumente' },
  { kind: 'designs', label: 'Sharepics & Designs' },
];

interface AdminOverviewProps {
  available: ReadonlySet<AdminSectionId>;
}

/** `/admin`: was ansteht, wie es läuft, wer neu ist. Nur vorhandene Abfragen. */
export default function AdminOverview({ available }: AdminOverviewProps) {
  return (
    <>
      <AdminPageHeader title="Überblick" description="Was auf dieser Instanz gerade ansteht." />
      <TodoRow available={available} />
      <RecentStats />
      <div className="flex flex-wrap gap-lg">
        <RecentUsers />
        <ToolLinks />
      </div>
    </>
  );
}

function TodoRow({ available }: AdminOverviewProps) {
  return (
    <section aria-labelledby="admin-todo" className="flex flex-col gap-sm">
      <h2 id="admin-todo" className="m-0 font-[Raleway] text-lg font-bold text-foreground-heading">
        Zu erledigen
      </h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-md">
        <ReportsTodo />
        {available.has('vorlagen') && <VorlagenTodo />}
        {available.has('landesverbaende') && <LandesverbandTodo />}
      </div>
    </section>
  );
}

function TodoCard({
  title,
  count,
  countLabel,
  isLoading,
  children,
  to,
  action,
}: {
  title: string;
  count: number | undefined;
  countLabel: string;
  isLoading: boolean;
  children: ReactNode;
  to: string;
  action: string;
}) {
  const open = (count ?? 0) > 0;
  return (
    <AdminPanel
      title={title}
      aside={
        isLoading ? (
          <Skeleton className="h-5 w-16" />
        ) : open ? (
          <Badge variant="destructive">
            {count} {countLabel}
          </Badge>
        ) : (
          <Badge variant="outline">nichts offen</Badge>
        )
      }
    >
      <div className="flex flex-col gap-sm">
        <div className="m-0 text-sm text-grey-600 dark:text-grey-400">{children}</div>
        <div>
          <Button asChild variant={open ? 'brand' : 'outline'} size={open ? 'brand-sm' : 'sm'}>
            <Link to={to}>{action}</Link>
          </Button>
        </div>
      </div>
    </AdminPanel>
  );
}

function ReportsTodo() {
  const { data: open, isLoading } = useAdminReportStats();
  return (
    <TodoCard
      title="Meldungen"
      count={open}
      countLabel="offen"
      isLoading={isLoading}
      to="/admin/meldungen"
      action={open ? 'Jetzt prüfen' : 'Meldungen ansehen'}
    >
      Gemeldete Inhalte. Ab drei Meldenden ist ein Inhalt automatisch ausgeblendet.
    </TodoCard>
  );
}

function VorlagenTodo() {
  const { data, isLoading } = useVorlagenStats();
  return (
    <TodoCard
      title="Vorlagen"
      count={data?.pending}
      countLabel="ausstehend"
      isLoading={isLoading}
      to="/admin/vorlagen"
      action={data?.pending ? 'Durchsehen' : 'Vorlagen ansehen'}
    >
      Für den Marktplatz eingereicht und noch nicht freigegeben.
    </TodoCard>
  );
}

function LandesverbandTodo() {
  const { data, isLoading } = useLandesverbaende();
  const orphaned = (data ?? []).filter((lv) => lv.adminCount === 0);
  const names = orphaned.slice(0, 3).map((lv) => lv.name);
  const rest = orphaned.length - names.length;
  return (
    <TodoCard
      title="Landesverbände"
      count={orphaned.length}
      countLabel="ohne Admin"
      isLoading={isLoading}
      to="/admin/landesverbaende"
      action={orphaned.length ? 'Zuweisen' : 'Landesverbände ansehen'}
    >
      {orphaned.length
        ? `${names.join(', ')}${rest > 0 ? ` und ${rest} weitere` : ''} haben niemanden, der ihre Inhalte pflegt.`
        : 'Jeder Landesverband hat mindestens eine Person, die ihn administriert.'}
    </TodoCard>
  );
}

function RecentStats() {
  const { data, isLoading, isError } = useAdminStats({ ...last30Days(), bucket: 'day' });
  return (
    <section aria-labelledby="admin-recent-stats" className="flex flex-col gap-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <h2
          id="admin-recent-stats"
          className="m-0 font-[Raleway] text-lg font-bold text-foreground-heading"
        >
          Letzte {WINDOW_DAYS} Tage
        </h2>
        <Link to="/admin/statistik" className="text-sm">
          Ganze Statistik
        </Link>
      </div>
      {isError ? (
        <p className="m-0 text-sm text-grey-600 dark:text-grey-400">
          Die Statistik ist gerade nicht erreichbar.
        </p>
      ) : (
        <AdminStatGrid>
          {STAT_KINDS.map(({ kind, label }) => {
            const value = sumOf(data, kind);
            return (
              <AdminStat
                key={kind}
                label={label}
                value={
                  isLoading ? (
                    <Skeleton className="my-1 h-7 w-20" />
                  ) : value === null ? (
                    '–'
                  ) : (
                    formatCount(value)
                  )
                }
                hint={!isLoading && value === null ? 'zu wenige, um sie zu zeigen' : null}
              />
            );
          })}
        </AdminStatGrid>
      )}
    </section>
  );
}

function RecentUsers() {
  const { data: users, isLoading } = useInstanceAdminUsers('');
  const recent = (users ?? []).slice(0, 5);
  return (
    <AdminPanel
      title="Zuletzt beigetreten"
      aside={<Link to="/admin/nutzer">Alle Nutzer:innen</Link>}
      flush
      className="flex-[2_1_420px]"
    >
      {isLoading ? (
        <div className="flex flex-col gap-xs px-md pb-md">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : recent.length === 0 ? (
        <p className="m-0 px-md pb-md text-sm text-grey-600 dark:text-grey-400">
          Noch niemand hat ein Konto.
        </p>
      ) : (
        <ul className="m-0 list-none divide-y divide-grey-200 p-0 dark:divide-grey-800">
          {recent.map((user) => (
            <li
              key={user.id}
              className="flex flex-wrap items-center gap-x-md gap-y-0.5 px-md py-2.5"
            >
              <span className="min-w-0 flex-1 basis-48">
                <span className="block truncate text-sm font-semibold text-foreground-heading">
                  {user.displayName ?? user.email ?? user.id}
                </span>
                {user.displayName && user.email && (
                  <span className="block truncate text-xs text-grey-600 dark:text-grey-400">
                    {user.email}
                  </span>
                )}
              </span>
              {user.isAdmin && <Badge variant="outline">Admin</Badge>}
              <span className="text-xs text-grey-600 tabular-nums dark:text-grey-400">
                {user.createdAt ? formatDate(user.createdAt) : '–'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </AdminPanel>
  );
}

const TOOL_LINKS: { to: string; label: string; hint: string }[] = [
  { to: '/admin/chunks', label: 'Chunk-Inspektor', hint: 'Gespeicherte Chunks eines Dokuments' },
  { to: '/admin/konnektoren', label: 'Konnektor-Test', hint: 'Google und Microsoft über Nango' },
  { to: '/admin/gruene-api', label: 'Grüne-API-Test', hint: 'Endpunkte der Grüne-Plattform' },
];

function ToolLinks() {
  return (
    <AdminPanel title="Werkzeuge" flush className="flex-[1_1_280px]">
      <ul className="m-0 list-none divide-y divide-grey-200 p-0 dark:divide-grey-800">
        {TOOL_LINKS.map((tool) => (
          <li key={tool.to}>
            <Link
              to={tool.to}
              className="flex flex-col px-md py-2.5 no-underline hover:bg-hover-alt"
            >
              <span className="text-sm font-semibold">{tool.label}</span>
              <span className="text-xs text-grey-600 dark:text-grey-400">{tool.hint}</span>
            </Link>
          </li>
        ))}
      </ul>
    </AdminPanel>
  );
}
