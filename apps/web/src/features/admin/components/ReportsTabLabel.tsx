import { useAdminReportStats } from '../hooks/useAdminReports';

export default function ReportsTabLabel() {
  const { data: open } = useAdminReportStats();
  return (
    <>
      Meldungen
      {open ? (
        <span className="ml-xs text-xs font-semibold">
          ({open}
          <span className="sr-only"> offen</span>)
        </span>
      ) : null}
    </>
  );
}
