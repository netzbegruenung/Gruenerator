/**
 * "Zeitplan" editor for a card's Grünerator-Spalte: create a recurring run
 * (daily / weekly / monthly at a wall-clock time) from the card's current flow +
 * context. Recurrence is the structured, typed shape the backend turns into an
 * RRULE; the UI never touches raw RRULE strings.
 */
import {
  type BoardAiTask,
  type BoardFlowCardContext,
  type ScheduleFrequency,
  type ScheduleRecurrence,
} from '@gruenerator/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Switch,
} from '@gruenerator/ui';
import { useState } from 'react';

import { useScheduledAgentRuns } from '../hooks/useScheduledAgentRuns';

// Weekday labels indexed 0 = Monday … 6 = Sunday (matches the schema numbering).
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;

// A short, curated timezone list — AT + DE are the first-class audiences.
const TIMEZONES = [
  { value: 'Europe/Berlin', label: 'Deutschland (Europe/Berlin)' },
  { value: 'Europe/Vienna', label: 'Österreich (Europe/Vienna)' },
] as const;

interface ScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: string;
  cardId: string;
  flow: BoardAiTask;
  cardContext: BoardFlowCardContext;
}

export function ScheduleDialog({
  open,
  onOpenChange,
  boardId,
  cardId,
  flow,
  cardContext,
}: ScheduleDialogProps) {
  const { createSchedule } = useScheduledAgentRuns(boardId, cardId);

  const [frequency, setFrequency] = useState<ScheduleFrequency>('weekly');
  const [time, setTime] = useState('09:00');
  const [weekdays, setWeekdays] = useState<number[]>([0]); // Monday by default
  const [timezone, setTimezone] = useState<string>('Europe/Berlin');
  const [requireReview, setRequireReview] = useState(false);

  const toggleWeekday = (day: number) =>
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );

  const handleCreate = () => {
    const [hourStr, minuteStr] = time.split(':');
    const recurrence: ScheduleRecurrence = {
      frequency,
      hour: Number(hourStr) || 0,
      minute: Number(minuteStr) || 0,
      ...(frequency === 'weekly' && weekdays.length ? { byweekday: weekdays } : {}),
    };
    createSchedule.mutate(
      {
        cardId,
        schedule: { flow, cardContext, recurrence, timezone, requireReview, enabled: true },
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  const canSubmit = frequency !== 'weekly' || weekdays.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Zeitplan für den Grünerator-Agent</DialogTitle>
          <DialogDescription>
            Der Agent läuft automatisch nach diesem Zeitplan – auch wenn du nicht da bist.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="freq">Häufigkeit</Label>
              <select
                id="freq"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as ScheduleFrequency)}
                className="w-full rounded-md border border-grey-200 dark:border-grey-700 bg-background px-2 py-1.5 text-sm"
              >
                <option value="daily">Täglich</option>
                <option value="weekly">Wöchentlich</option>
                <option value="monthly">Monatlich</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="time">Uhrzeit</Label>
              <input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-md border border-grey-200 dark:border-grey-700 bg-background px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          {frequency === 'weekly' && (
            <div className="space-y-1.5">
              <Label>Wochentage</Label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((label, day) => {
                  const active = weekdays.includes(day);
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => toggleWeekday(day)}
                      className={`h-8 w-9 rounded-md border text-xs font-medium transition-colors ${
                        active
                          ? 'border-primary-500 bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
                          : 'border-grey-200 dark:border-grey-700 text-grey-500'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="tz">Zeitzone</Label>
            <select
              id="tz"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full rounded-md border border-grey-200 dark:border-grey-700 bg-background px-2 py-1.5 text-sm"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between rounded-md border border-grey-200 dark:border-grey-700 px-3 py-2">
            <div>
              <div className="text-sm font-medium text-foreground">Zur Prüfung vorlegen</div>
              <div className="text-xs text-grey-500">
                Ergebnisse warten auf deine Freigabe, statt sofort abgeschlossen zu werden.
              </div>
            </div>
            <Switch checked={requireReview} onCheckedChange={setRequireReview} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button
            type="button"
            disabled={!canSubmit || createSchedule.isPending}
            onClick={handleCreate}
          >
            {createSchedule.isPending ? 'Wird gespeichert…' : 'Zeitplan speichern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
