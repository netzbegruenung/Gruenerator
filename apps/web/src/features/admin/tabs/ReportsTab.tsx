import {
  type AdminReportAction,
  type AdminReportGroup,
  type ContentReportStatus,
} from '@gruenerator/contracts';
import { ConfirmDialogProvider, Skeleton, toast, useConfirm } from '@gruenerator/ui';
import { useState } from 'react';

import { cn } from '../../../utils/cn';
import ReportCard from '../components/ReportCard';
import { useAdminReports, useResolveReport } from '../hooks/useAdminReports';

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

  return (
    <>
      <div className="flex gap-1 mb-lg">
        {STATUS_TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatus(key)}
            aria-pressed={status === key}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-md border-none cursor-pointer transition-colors',
              status === key
                ? 'bg-grey-200 dark:bg-grey-700 text-foreground'
                : 'bg-transparent text-grey-500 hover:text-foreground hover:bg-grey-100 dark:hover:bg-grey-800'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-md">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400 py-lg text-center">
          Die Meldungen konnten nicht geladen werden.
        </p>
      ) : !reports || reports.length === 0 ? (
        <p className="text-sm text-grey-500 dark:text-grey-400 py-lg text-center">
          {EMPTY_MESSAGE[status]}
        </p>
      ) : (
        <ul className="flex flex-col gap-md p-0 m-0">
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
    </>
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
