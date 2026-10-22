import {
  type AdminReportAction,
  type AdminReportGroup,
  type ContentReportKind,
  moderatableReportKindSchema,
  type ModerationState,
} from '@gruenerator/contracts';
import { CONTENT_REPORT_REASON_LABELS } from '@gruenerator/shared/utils';
import { Badge } from '@gruenerator/ui';

const KIND_LABELS: Record<ContentReportKind, string> = {
  group_post: 'Projekt-Beitrag',
  group_comment: 'Kommentar',
  chat_message: 'Chat-Antwort',
  group_share: 'Geteilter Inhalt',
  studio_asset: 'Studio-Element',
  user_agent: 'Agent',
  user_text_form: 'Rezept',
  user_template: 'Vorlage',
  entity_comment: 'Kommentar im Marktplatz',
  notebook: 'Notebook',
};

const MODERATION_LABELS: Record<Exclude<ModerationState, 'ok'>, string> = {
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
  const { preview } = report;
  const moderatable = moderatableReportKindSchema.safeParse(report.kind).success;
  const moderation = preview && preview.moderation !== 'ok' ? preview.moderation : null;
  const isOpen = report.status === 'open';
  const heading = preview ? preview.title : KIND_LABELS[report.kind];

  return (
    <li className="flex gap-md p-md rounded-md border border-grey-200 dark:border-grey-700 bg-background list-none">
      {preview?.thumbUrl ? (
        <img
          src={preview.thumbUrl}
          alt=""
          className="w-24 h-24 object-contain rounded-md bg-grey-100 dark:bg-grey-800 shrink-0"
        />
      ) : null}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-xs">
          <h3 className="text-base font-semibold text-foreground-heading m-0">
            {preview?.href ? (
              <a href={preview.href} target="_blank" rel="noreferrer">
                {heading}
              </a>
            ) : (
              heading
            )}
          </h3>
          {moderation ? <Badge variant="destructive">{MODERATION_LABELS[moderation]}</Badge> : null}
          {preview?.trashed ? <Badge variant="secondary">Im Papierkorb</Badge> : null}
          {moderatable && !preview ? <Badge variant="secondary">Nicht mehr verfügbar</Badge> : null}
        </div>
        <p className="text-sm text-grey-500 dark:text-grey-400 m-0 mt-xs">
          {KIND_LABELS[report.kind]}
          {preview ? ` · von ${preview.ownerName ?? 'Unbekannt'}` : ''}
          {` · ${report.reportCount} ${report.reportCount === 1 ? 'Meldung' : 'Meldungen'}`}
        </p>
        {!preview && report.excerpt ? (
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
          {isOpen && moderatable && preview?.moderation !== 'removed' ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => onAction(report, 'remove')}
              className={DESTRUCTIVE}
            >
              Entfernen
            </button>
          ) : null}
          {moderatable && moderation ? (
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
