/**
 * Automation panel shown under the Grünerator-Agent block on a card: existing
 * schedules (with enable toggle / run-now / delete), runs awaiting review
 * (Accept / Redo), and recent run history. Sits beside the manual run button and
 * reuses the same flow + card context to create schedules.
 */
import {
  type BoardAgentRunRecord,
  type BoardAiTask,
  type BoardFlowCardContext,
  type BoardSchedule,
  type ScheduleRecurrence,
} from '@gruenerator/contracts';
import { Badge, Button, Switch } from '@gruenerator/ui';
import { useState } from 'react';
import { FiCalendar, FiCheck, FiPlay, FiRefreshCw, FiTrash2 } from 'react-icons/fi';

import { useScheduledAgentRuns } from '../hooks/useScheduledAgentRuns';

import { ScheduleDialog } from './ScheduleDialog';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;
const FREQ_LABEL = { daily: 'Täglich', weekly: 'Wöchentlich', monthly: 'Monatlich' } as const;

function describeRecurrence(rec: ScheduleRecurrence): string {
  const time = `${String(rec.hour).padStart(2, '0')}:${String(rec.minute).padStart(2, '0')}`;
  if (rec.frequency === 'weekly' && rec.byweekday?.length) {
    return `${FREQ_LABEL.weekly} ${rec.byweekday.map((d) => WEEKDAYS[d]).join(', ')}, ${time}`;
  }
  if (rec.frequency === 'monthly' && rec.bymonthday != null) {
    return `${FREQ_LABEL.monthly} am ${rec.bymonthday}., ${time}`;
  }
  return `${FREQ_LABEL[rec.frequency]}, ${time}`;
}

const STATUS_META: Record<BoardAgentRunRecord['status'], { label: string; className: string }> = {
  pending: { label: 'Wartet', className: 'text-grey-500' },
  running: { label: 'Läuft', className: 'text-primary-600 dark:text-primary-400' },
  completed: { label: 'Fertig', className: 'text-green-600 dark:text-green-400' },
  failed: { label: 'Fehlgeschlagen', className: 'text-red-600 dark:text-red-400' },
  awaiting_review: { label: 'Zur Prüfung', className: 'text-amber-600 dark:text-amber-400' },
};

interface CardAutomationSectionProps {
  boardId: string;
  cardId: string;
  flow: BoardAiTask;
  cardContext: BoardFlowCardContext;
}

export function CardAutomationSection({
  boardId,
  cardId,
  flow,
  cardContext,
}: CardAutomationSectionProps) {
  const { schedulesQuery, runsQuery, updateSchedule, deleteSchedule, runNow, acceptRun, redoRun } =
    useScheduledAgentRuns(boardId, cardId);
  const [dialogOpen, setDialogOpen] = useState(false);

  const schedules = (schedulesQuery.data ?? []).filter((s: BoardSchedule) => s.cardId === cardId);
  const runs = runsQuery.data ?? [];
  const reviewRuns = runs.filter((r) => r.status === 'awaiting_review');
  const recentRuns = runs.slice(0, 5);

  return (
    <div className="mt-2 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-grey-500 dark:text-grey-300">
          <FiCalendar size={12} />
          Zeitpläne
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={() => setDialogOpen(true)}>
          + Zeitplan
        </Button>
      </div>

      {schedules.length > 0 && (
        <ul className="space-y-1.5">
          {schedules.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-2 rounded-md border border-grey-200 dark:border-grey-700 px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-foreground">
                  {describeRecurrence(s.recurrence)}
                  {s.requireReview && (
                    <Badge variant="secondary" className="ml-1.5">
                      Prüfung
                    </Badge>
                  )}
                </div>
                <div className="text-[11px] text-grey-500">
                  Nächster Lauf: {new Date(s.nextRunAt).toLocaleString('de-DE')}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Switch
                  checked={s.enabled}
                  onCheckedChange={(enabled) =>
                    updateSchedule.mutate({ scheduleId: s.id, patch: { enabled } })
                  }
                />
                <button
                  type="button"
                  title="Jetzt starten"
                  className="p-1 text-grey-500 hover:text-primary-600"
                  onClick={() => runNow.mutate(s.id)}
                >
                  <FiPlay size={13} />
                </button>
                <button
                  type="button"
                  title="Löschen"
                  className="p-1 text-grey-500 hover:text-red-600"
                  onClick={() => deleteSchedule.mutate(s.id)}
                >
                  <FiTrash2 size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {reviewRuns.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">
            Wartet auf Freigabe
          </div>
          {reviewRuns.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-2 rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 px-2.5 py-1.5"
            >
              <span className="text-xs text-foreground">
                Lauf vom {new Date(r.createdAt).toLocaleString('de-DE')}
              </span>
              <div className="flex items-center gap-1.5">
                <Button type="button" size="sm" onClick={() => acceptRun.mutate(r.id)}>
                  <FiCheck size={12} className="mr-1" />
                  Freigeben
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => redoRun.mutate({ taskId: r.id })}
                >
                  <FiRefreshCw size={12} className="mr-1" />
                  Wiederholen
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {recentRuns.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-grey-500 dark:text-grey-300">Letzte Läufe</div>
          <ul className="space-y-0.5">
            {recentRuns.map((r) => (
              <li key={r.id} className="flex items-center justify-between text-[11px]">
                <span className="text-grey-500">
                  {new Date(r.createdAt).toLocaleString('de-DE')}
                </span>
                <span className={STATUS_META[r.status].className}>
                  {STATUS_META[r.status].label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ScheduleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        boardId={boardId}
        cardId={cardId}
        flow={flow}
        cardContext={cardContext}
      />
    </div>
  );
}
