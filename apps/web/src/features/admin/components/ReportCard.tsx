import {
  type AdminReportAction,
  type AdminReportGroup,
  type ContentReportKind,
  type StudioAssetModeration,
} from '@gruenerator/contracts';
import { CONTENT_REPORT_REASON_LABELS } from '@gruenerator/shared/utils';
import { Badge } from '@gruenerator/ui';

const KIND_LABELS: Record<ContentReportKind, string> = {
  group_post: 'Projekt-Beitrag',
  group_comment: 'Kommentar',
  chat_message: 'Chat-Antwort',
  group_share: 'Geteilter Inhalt',
  studio_asset: 'Studio-Element',
};

const MODERATION_LABELS: Record<Exclude<StudioAssetModeration, 'ok'>, string> = {
  hidden: 'Ausgeblendet',
  removed: 'Entfernt',
};

const BUTTON =
  'px-md py-xs rounded-md text-sm font-medium cursor-pointer transition-colors disabled:opacity-50';
const NEUTRAL = `${BUTTON} bg-transparent border border-grey-200 dark:border-grey-700 text-foreground hover:bg-grey-100 dark:hover:bg-grey-800`;
const DESTRUCTIVE = `${BUTTON} bg-red-600 text-white hover:bg-red-700 border-none`;

interface ReportCardProps {
  report: AdminReportGroup;
  pending: boolean;
  onAction: (report: AdminReportGroup, action: AdminReportAction) => void;
}

export default function ReportCard({ report, pending, onAction }: ReportCardProps) {
  const { target } = report;
  const isAsset = report.kind === 'studio_asset';
  const moderation = target && target.moderation !== 'ok' ? target.moderation : null;
  const isOpen = report.status === 'open';
  const heading = target ? target.title : KIND_LABELS[report.kind];

  return (
    <li className="flex gap-md p-md rounded-md border border-grey-200 dark:border-grey-700 bg-background list-none">
      {target ? (
        <img
          src={target.thumbUrl ?? target.src}
          alt=""
          className="w-24 h-24 object-contain rounded-md bg-grey-100 dark:bg-grey-800 shrink-0"
        />
      ) : null}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-xs">
          <h3 className="text-base font-semibold text-foreground-heading m-0">{heading}</h3>
          {moderation ? <Badge variant="destructive">{MODERATION_LABELS[moderation]}</Badge> : null}
          {isAsset && !target ? <Badge variant="secondary">Nicht mehr verfügbar</Badge> : null}
        </div>
        <p className="text-sm text-grey-500 dark:text-grey-400 m-0 mt-xs">
          {KIND_LABELS[report.kind]}
          {target ? ` · von ${target.ownerName ?? 'Unbekannt'}` : ''}
          {` · ${report.reportCount} ${report.reportCount === 1 ? 'Meldung' : 'Meldungen'}`}
        </p>
        {!target && report.excerpt ? (
          <p className="text-sm text-foreground m-0 mt-xs line-clamp-3">{report.excerpt}</p>
        ) : null}
        <ul className="flex flex-wrap gap-xs p-0 m-0 mt-sm" aria-label="Meldegründe">
          {report.reasons.map(({ reason, count }) => (
            <li key={reason} className="list-none">
              <Badge variant="outline">
                {CONTENT_REPORT_REASON_LABELS[reason]} ({count})
              </Badge>
            </li>
          ))}
        </ul>
        {report.notes.length > 0 ? (
          <ul className="p-0 m-0 mt-sm flex flex-col gap-xs" aria-label="Anmerkungen">
            {report.notes.map((n) => (
              <li
                key={`${n.createdAt}-${n.note}`}
                className="list-none text-sm text-grey-600 dark:text-grey-300"
              >
                „{n.note}“
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap gap-xs mt-md">
          {isOpen && isAsset && target?.moderation !== 'removed' ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => onAction(report, 'remove')}
              className={DESTRUCTIVE}
            >
              Entfernen
            </button>
          ) : null}
          {isAsset && moderation ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => onAction(report, 'restore')}
              className={NEUTRAL}
            >
              Wiederherstellen
            </button>
          ) : null}
          {isOpen ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => onAction(report, 'dismiss')}
              className={NEUTRAL}
            >
              Verwerfen
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
