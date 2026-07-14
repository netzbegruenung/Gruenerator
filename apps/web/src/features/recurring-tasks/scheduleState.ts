/**
 * EXPERIMENTAL — shared schedule state for the recurring-agent surfaces.
 *
 * `ScheduleState` is the editable form shape used by `RecurrenceFields` (in the
 * agent builder's Zeitplan tab); `scheduleToRecurrence`/`recurrenceToSchedule`
 * bridge it to the wire `ScheduleRecurrence` on a recurring task. Deliberately
 * separate from the agent `FormState` — these fields belong to the recurring-task
 * create/update call, not the user-agent payload.
 */
import {
  type RecurringTask,
  type RecurringTaskDelivery,
  type ScheduleFrequency,
  type ScheduleRecurrence,
} from '@gruenerator/contracts';

/** Weekday labels indexed 0 = Monday … 6 = Sunday (matches the schema numbering). */
export const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;

export const DELIVERY_LABEL: Record<RecurringTaskDelivery, string> = {
  document: 'Dokument',
  summary: 'Zusammenfassung',
  thread: 'Chat',
};

/** AT + DE are the first-class audiences. */
export const TIMEZONES = [
  { value: 'Europe/Berlin', label: 'Deutschland (Europe/Berlin)' },
  { value: 'Europe/Vienna', label: 'Österreich (Europe/Vienna)' },
] as const;

export interface ScheduleState {
  frequency: ScheduleFrequency;
  hour: number;
  minute: number;
  /** Used when `frequency === 'weekly'`. */
  byweekday: number[];
  /** Used when `frequency === 'monthly'` (1–31). */
  bymonthday: number;
  delivery: RecurringTaskDelivery;
  timezone: string;
  /** Additionally notify by email when a run completes (in-app is always on). */
  emailNotify: boolean;
}

export const DEFAULT_SCHEDULE: ScheduleState = {
  frequency: 'weekly',
  hour: 9,
  minute: 0,
  byweekday: [0],
  bymonthday: 1,
  delivery: 'document',
  timezone: 'Europe/Berlin',
  emailNotify: true,
};

/** ScheduleState → the wire recurrence (omitting the fields the frequency ignores). */
export function scheduleToRecurrence(s: ScheduleState): ScheduleRecurrence {
  return {
    frequency: s.frequency,
    hour: s.hour,
    minute: s.minute,
    ...(s.frequency === 'weekly' && s.byweekday.length
      ? { byweekday: [...s.byweekday].sort((a, b) => a - b) }
      : {}),
    ...(s.frequency === 'monthly' ? { bymonthday: s.bymonthday } : {}),
  };
}

/** A saved task → editable ScheduleState (for the builder's edit mode). */
export function recurrenceToSchedule(
  task: Pick<RecurringTask, 'recurrence' | 'delivery' | 'timezone' | 'emailNotify'>
): ScheduleState {
  const r = task.recurrence;
  return {
    frequency: r.frequency,
    hour: r.hour,
    minute: r.minute,
    byweekday: r.byweekday ?? [0],
    bymonthday: r.bymonthday ?? 1,
    delivery: task.delivery,
    timezone: task.timezone,
    emailNotify: task.emailNotify,
  };
}

/** Human-readable one-liner for a recurrence, used in the task list. */
export function describeRecurrence(rec: ScheduleRecurrence): string {
  const time = `${String(rec.hour).padStart(2, '0')}:${String(rec.minute).padStart(2, '0')}`;
  if (rec.frequency === 'daily') return `Täglich, ${time}`;
  if (rec.frequency === 'weekly') {
    const days = (rec.byweekday ?? []).map((d) => WEEKDAYS[d]).join(', ');
    return days ? `Wöchentlich (${days}), ${time}` : `Wöchentlich, ${time}`;
  }
  return rec.bymonthday ? `Monatlich am ${rec.bymonthday}., ${time}` : `Monatlich, ${time}`;
}
