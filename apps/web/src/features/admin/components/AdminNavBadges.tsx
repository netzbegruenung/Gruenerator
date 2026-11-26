import { useAdminReportStats } from '../hooks/useAdminReports';
import { useVorlagenStats } from '../hooks/useAdminVorlagen';

function CountBadge({ count, label }: { count: number; label: string }) {
  return (
    <span className="ml-auto min-w-5 rounded-full bg-grey-200 px-1.5 text-center text-xs font-semibold tabular-nums text-foreground-heading dark:bg-grey-700">
      {count}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

export function ReportsNavBadge() {
  const { data: open } = useAdminReportStats();
  return open ? <CountBadge count={open} label="offen" /> : null;
}

export function VorlagenNavBadge() {
  const { data } = useVorlagenStats();
  return data?.pending ? <CountBadge count={data.pending} label="ausstehend" /> : null;
}
