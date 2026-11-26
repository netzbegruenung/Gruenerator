import {
  type AdminReportAction,
  type AdminReportGroup,
  type ContentReportStatus,
} from '@gruenerator/contracts';
import { ConfirmDialogProvider, Skeleton, toast, useConfirm } from '@gruenerator/ui';
import { useState } from 'react';

import SegmentedControl from '../../settings/components/SegmentedControl';
import { AdminEmptyState } from '../components/adminUi';
import ReportCard from '../components/ReportCard';
import { useAdminReports, useAdminReportStats, useResolveReport } from '../hooks/useAdminReports';

const STATUS_TABS: { key: ContentReportStatus; label: string }[] = [
  { key: 'open', label: 'Offen' },
  { key: 'resolved', label: 'Erledigt' },
  { key: 'dismissed', label: 'Verworfen' },
];

const EMPTY_MESSAGE: Record<ContentReportStatus, string> = {
  open: 'Keine offenen Meldungen.',
  resolved: 'Noch keine erledigten Meldungen.',
  dismissed: 'Keine verworfenen Meldungen.',
};

const SUCCESS_MESSAGE: Record<AdminReportAction, string> = {
  remove: 'Inhalt entfernt.',
  restore: 'Inhalt wiederhergestellt.',
  dismiss: 'Meldungen verworfen.',
};

function ReportsList() {
  const [status, setStatus] = useState<ContentReportStatus>('open');
  const { data: reports, isLoading, isError } = useAdminReports(status);
  const { data: stats } = useAdminReportStats();
  const resolve = useResolveReport();
  const confirm = useConfirm();

  const handleAction = async (report: AdminReportGroup, action: AdminReportAction) => {
    if (action === 'remove') {
      const ok = await confirm({
        title: 'Inhalt entfernen?',
        description:
          'Der Inhalt wird für alle ausgeblendet. Du kannst ihn später wiederherstellen.',
        confirmLabel: 'Entfernen',
      });
      if (!ok) return;
    }
    resolve.mutate(
      { kind: report.kind, targetId: report.targetId, action },
      {
        onSuccess: () => toast.success(SUCCESS_MESSAGE[action]),
        onError: () => toast.error('Die Aktion ist fehlgeschlagen. Bitte versuche es erneut.'),
      }
    );
  };

  const openCount = stats ?? null;
  const options = STATUS_TABS.map(({ key, label }) => ({
    value: key,
    label: key === 'open' && openCount !== null ? `${label} · ${openCount}` : label,
  }));

  return (
    <div className="flex flex-col gap-md">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <SegmentedControl
          value={status}
          onChange={setStatus}
          options={options}
          aria-label="Status der Meldungen"
        />
        {reports && !isLoading && !isError ? (
          <span className="text-sm text-grey-600 dark:text-grey-400" aria-live="polite">
            {reports.length} {reports.length === 1 ? 'Meldung' : 'Meldungen'}
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-md">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <p
          role="alert"
          className="m-0 rounded-xl border border-red-200 px-md py-lg text-center text-sm text-red-700 dark:border-red-900 dark:text-red-400"
        >
          Die Meldungen konnten nicht geladen werden.
        </p>
      ) : !reports || reports.length === 0 ? (
        <AdminEmptyState>{EMPTY_MESSAGE[status]}</AdminEmptyState>
      ) : (
        <ul className="m-0 flex flex-col gap-md p-0">
          {reports.map((report) => (
            <ReportCard
              key={`${report.kind}:${report.targetId}`}
              report={report}
              pending={
                resolve.isPending &&
                resolve.variables?.kind === report.kind &&
                resolve.variables.targetId === report.targetId
              }
              onAction={(r, a) => void handleAction(r, a)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Die Prüfschlange für gemeldete Inhalte, je Ziel gruppiert. */
export default function ReportsTab() {
  return (
    <ConfirmDialogProvider>
      <ReportsList />
    </ConfirmDialogProvider>
  );
}
