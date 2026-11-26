import {
  type AdminReportAction,
  type AdminReportGroup,
  type ContentReportKind,
  moderatableReportKindSchema,
  type ModerationState,
} from '@gruenerator/contracts';
import { CONTENT_REPORT_REASON_LABELS } from '@gruenerator/shared/utils';
import { Badge, Button } from '@gruenerator/ui';

const KIND_LABELS: Record<ContentReportKind, string> = {
  group_post: 'Projekt-Beitrag',
  group_comment: 'Kommentar',
  chat_message: 'Chat-Antwort',
  group_share: 'Geteilter Inhalt',
  studio_asset: 'Studio-Element',
  user_agent: 'Agent',
  user_text_form: 'Rezept',
  user_template: 'Vorlage',
  user_site: 'Website',
  entity_comment: 'Kommentar im Marktplatz',
  notebook: 'Notebook',
};

const MODERATION_LABELS: Record<Exclude<ModerationState, 'ok'>, string> = {
  hidden: 'Ausgeblendet',
  removed: 'Entfernt',
};

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
  const showRemove = isOpen && moderatable && preview?.moderation !== 'removed';
  const showRestore = moderatable && moderation !== null;
  const heading = preview ? preview.title : KIND_LABELS[report.kind];

  return (
    <li className="flex list-none flex-col rounded-xl border border-grey-200 bg-background dark:border-grey-800">
      <div className="flex gap-md p-md">
        {preview?.thumbUrl ? (
          <img
            src={preview.thumbUrl}
            alt=""
            className="size-24 shrink-0 rounded-lg bg-grey-100 object-contain dark:bg-grey-800"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-xs">
            <h3 className="m-0 font-[Raleway] text-base font-bold text-foreground-heading">
              {preview?.href ? (
                <a href={preview.href} target="_blank" rel="noreferrer">
                  {heading}
                </a>
              ) : (
                heading
              )}
            </h3>
            {moderation ? (
              <Badge variant="destructive">{MODERATION_LABELS[moderation]}</Badge>
            ) : null}
            {preview?.trashed ? <Badge variant="secondary">Im Papierkorb</Badge> : null}
            {moderatable && !preview ? (
              <Badge variant="secondary">Nicht mehr verfügbar</Badge>
            ) : null}
          </div>
          <p className="m-0 mt-xs text-sm text-grey-600 dark:text-grey-400">
            {KIND_LABELS[report.kind]}
            {preview ? ` · von ${preview.ownerName ?? 'Unbekannt'}` : ''}
            {` · ${report.reportCount} ${report.reportCount === 1 ? 'Meldung' : 'Meldungen'}`}
          </p>
          {!preview && report.excerpt ? (
            <p className="m-0 mt-xs line-clamp-3 text-sm text-foreground">{report.excerpt}</p>
          ) : null}
          <ul className="m-0 mt-sm flex flex-wrap gap-xs p-0" aria-label="Meldegründe">
            {report.reasons.map(({ reason, count }) => (
              <li key={reason} className="list-none">
                <Badge variant="outline">
                  {CONTENT_REPORT_REASON_LABELS[reason]} ({count})
                </Badge>
              </li>
            ))}
          </ul>
          {report.notes.length > 0 ? (
            <ul className="m-0 mt-sm flex flex-col gap-xs p-0" aria-label="Anmerkungen">
              {report.notes.map((n) => (
                <li
                  key={`${n.createdAt}-${n.note}`}
                  className="list-none border-l-2 border-grey-300 pl-sm text-sm text-grey-600 dark:border-grey-700 dark:text-grey-400"
                >
                  „{n.note}“
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      {showRemove || showRestore || isOpen ? (
        <div className="flex flex-wrap justify-end gap-xs border-t border-grey-200 px-md py-sm dark:border-grey-800">
          {isOpen ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => onAction(report, 'dismiss')}
            >
              Verwerfen
            </Button>
          ) : null}
          {showRestore ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => onAction(report, 'restore')}
            >
              Wiederherstellen
            </Button>
          ) : null}
          {showRemove ? (
            <Button
              type="button"
              variant="brand-danger"
              size="brand-sm"
              disabled={pending}
              onClick={() => onAction(report, 'remove')}
            >
              Entfernen
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
