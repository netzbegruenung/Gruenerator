/**
 * Zod schemas for scheduled / recurring KI-Spalte runs.
 *
 * A schedule puts a board AI column (KI-Spalte) on a recurring timer so it fires
 * without a human click. The run itself reuses the exact flow config a manual run
 * uses (`boardAiTaskSchema` + `boardFlowCardContextSchema` from boardFlow.ts), so
 * there is no second flow shape to keep in sync.
 *
 * Recurrence is expressed as a STRUCTURED value (a closed set of frequencies +
 * time), not a raw RRULE string — the backend converts it to an iCalendar RRULE
 * for storage/next-run computation and converts it back when returning a schedule.
 * This keeps the boundary fully typed (per CLAUDE.md: a fixed set is `z.enum`, not
 * a free `z.string()`) and the shared contracts package free of the rrule dep.
 */
import { z } from 'zod';

import { boardAiTaskSchema, boardFlowCardContextSchema } from './boardFlow.js';

// ── Recurrence (structured; ↔ RRULE on the backend) ──────────────────────────

export const scheduleFrequencySchema = z.enum(['daily', 'weekly', 'monthly']);
export type ScheduleFrequency = z.infer<typeof scheduleFrequencySchema>;

/** Weekday index, 0 = Monday … 6 = Sunday (matches rrule's weekday numbering). */
export const scheduleWeekdaySchema = z.number().int().min(0).max(6);

export const scheduleRecurrenceSchema = z
  .object({
    frequency: scheduleFrequencySchema,
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
    /** Weekly only: which weekdays to fire on. Defaults to the created weekday. */
    byweekday: z.array(scheduleWeekdaySchema).min(1).optional(),
    /** Monthly only: day-of-month (1–31). Defaults to the created day. */
    bymonthday: z.number().int().min(1).max(31).optional(),
  })
  .strict();
export type ScheduleRecurrence = z.infer<typeof scheduleRecurrenceSchema>;

// ── Create / update request ──────────────────────────────────────────────────

export const boardScheduleInputSchema = z.object({
  flow: boardAiTaskSchema,
  cardContext: boardFlowCardContextSchema,
  recurrence: scheduleRecurrenceSchema,
  /** IANA timezone the recurrence is interpreted in, e.g. "Europe/Vienna". */
  timezone: z.string().min(1).default('Europe/Berlin'),
  /** Park each run in review (Accept/Redo) instead of completing silently. */
  requireReview: z.boolean().default(false),
  enabled: z.boolean().default(true),
});
export type BoardScheduleInput = z.infer<typeof boardScheduleInputSchema>;

/** PATCH: enable/disable or edit an existing schedule. All fields optional. */
export const boardScheduleUpdateSchema = boardScheduleInputSchema.partial();
export type BoardScheduleUpdate = z.infer<typeof boardScheduleUpdateSchema>;

// ── Response ─────────────────────────────────────────────────────────────────

export const boardScheduleSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  cardId: z.string(),
  recurrence: scheduleRecurrenceSchema,
  timezone: z.string(),
  requireReview: z.boolean(),
  enabled: z.boolean(),
  nextRunAt: z.string(),
  lastRunAt: z.string().nullable(),
  createdAt: z.string(),
});
export type BoardSchedule = z.infer<typeof boardScheduleSchema>;

export const boardScheduleListSchema = z.array(boardScheduleSchema);

export const boardScheduleErrorResponseSchema = z.object({ error: z.string() });

// ── Run history (Phase 3) ─────────────────────────────────────────────────────

export const boardRunStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'awaiting_review',
]);
export type BoardRunStatus = z.infer<typeof boardRunStatusSchema>;

export const boardAgentRunRecordSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  cardId: z.string(),
  scheduleId: z.string().nullable(),
  status: boardRunStatusSchema,
  resultDocumentId: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});
export type BoardAgentRunRecord = z.infer<typeof boardAgentRunRecordSchema>;

export const boardAgentRunListSchema = z.array(boardAgentRunRecordSchema);
