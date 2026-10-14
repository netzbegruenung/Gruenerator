import { type ContentReportCreate, type ContentReportReason } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { CONTENT_REPORT_REASON_LABELS, CONTENT_REPORT_REASONS } from '@gruenerator/shared/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
  toast,
} from '@gruenerator/ui';
import { useId, useRef, useState } from 'react';

export type ReportDialogTarget = Pick<
  ContentReportCreate,
  'kind' | 'targetId' | 'groupId' | 'threadId' | 'excerpt'
>;

interface ReportDialogProps extends ReportDialogTarget {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  /** After the report went through — e.g. to drop an item auto-hidden by it. */
  onReported?: () => void;
}

const NOTE_MAX = 2000;
const FALLBACK_ERROR = 'Die Meldung konnte nicht gesendet werden. Bitte versuche es erneut.';
const STATUS_ERRORS: Record<number, string> = {
  400: 'Eigene Inhalte kannst du nicht melden.',
  404: 'Dieser Inhalt ist nicht mehr verfügbar oder kann nicht gemeldet werden.',
  429: 'Zu viele Meldungen, bitte versuche es später erneut.',
};

export function ReportDialog({
  open,
  onOpenChange,
  title,
  onReported,
  ...target
}: ReportDialogProps) {
  const firstRadio = useRef<HTMLInputElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-background-pure"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          firstRadio.current?.focus();
        }}
      >
        <ReportForm
          target={target}
          title={title ?? null}
          firstRadio={firstRadio}
          onClose={() => onOpenChange(false)}
          onReported={onReported ?? null}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Mounted only while the dialog is open, so every report starts with a clean form. */
function ReportForm({
  target,
  title,
  firstRadio,
  onClose,
  onReported,
}: {
  target: ReportDialogTarget;
  title: string | null;
  firstRadio: React.RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onReported: (() => void) | null;
}) {
  const groupName = useId();
  const [reason, setReason] = useState<ContentReportReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!reason || busy) return;
    setBusy(true);
    setError(null);
    try {
      const trimmed = note.trim();
      const result = await getContractsClient().contentReports.create({
        body: { ...target, reason, ...(trimmed ? { note: trimmed } : {}) },
      });
      if (result.status === 200) {
        toast.success('Danke, wir schauen uns das an.');
        onReported?.();
        onClose();
        return;
      }
      setError(STATUS_ERRORS[result.status] ?? FALLBACK_ERROR);
    } catch {
      setError(FALLBACK_ERROR);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Inhalt melden</DialogTitle>
        <DialogDescription>
          {title ? `Was stimmt mit „${title}“ nicht?` : 'Was stimmt mit diesem Inhalt nicht?'}
        </DialogDescription>
      </DialogHeader>
      <fieldset className="border-0 p-0 m-0 flex flex-col gap-xs">
        <legend className="text-sm font-medium text-foreground mb-xs">Grund der Meldung</legend>
        {CONTENT_REPORT_REASONS.map((r, i) => (
          <label
            key={r}
            className="flex items-center gap-sm px-md py-sm rounded-md border border-grey-200 dark:border-grey-700 text-sm text-foreground cursor-pointer has-[:checked]:border-primary-600"
          >
            <input
              ref={i === 0 ? firstRadio : undefined}
              type="radio"
              name={groupName}
              value={r}
              checked={reason === r}
              onChange={() => setReason(r)}
              disabled={busy}
              className="accent-primary-600"
            />
            {CONTENT_REPORT_REASON_LABELS[r]}
          </label>
        ))}
      </fieldset>
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={NOTE_MAX}
        rows={3}
        disabled={busy}
        placeholder="Anmerkung (optional)"
        aria-label="Anmerkung (optional)"
      />
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400 m-0">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <button
          type="button"
          onClick={onClose}
          className="px-md py-xs rounded-md text-sm font-medium bg-transparent border border-grey-200 dark:border-grey-700 text-foreground hover:bg-grey-100 dark:hover:bg-grey-800 cursor-pointer transition-colors"
        >
          Abbrechen
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!reason || busy}
          className="px-md py-xs rounded-md text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 cursor-pointer border-none transition-colors"
        >
          {busy ? 'Wird gesendet...' : 'Melden'}
        </button>
      </DialogFooter>
    </>
  );
}
