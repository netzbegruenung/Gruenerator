/**
 * EXPERIMENTAL — Zod schemas for standalone recurring agent tasks
 * ("Wiederkehrende Aufgabe"). Source of truth for the /api/recurring-tasks
 * request/response shapes; mirrors recurringTasksContractRouter.ts.
 *
 * A recurring task runs an agent (referenced by identifier) on a schedule and
 * delivers the result to the user. Unlike board schedules it is NOT board/card
 * scoped. Recurrence reuses `scheduleRecurrenceSchema` (structured ↔ RRULE on the
 * backend) so the boundary stays fully typed.
 */
import { z } from 'zod';

import { scheduleRecurrenceSchema } from './boardSchedules.js';

// ── Closed sets ──────────────────────────────────────────────────────────────

/** Where a run's result is delivered. Mirrors RecurringTaskDelivery in the schema. */
export const recurringTaskDeliverySchema = z.enum(['document', 'summary', 'thread']);
export type RecurringTaskDelivery = z.infer<typeof recurringTaskDeliverySchema>;

export const recurringTaskRunStatusSchema = z.enum(['completed', 'empty', 'failed']);
export type RecurringTaskRunStatus = z.infer<typeof recurringTaskRunStatusSchema>;

// ── Response item ──────────────────────────────────────────────────────────────

export const recurringTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  instruction: z.string(),
  /** Agent to run (own / group / system). Null → the default universal agent. */
  agentIdentifier: z.string().nullable(),
  delivery: recurringTaskDeliverySchema,
  /** Whether a completed run additionally notifies the user by email. */
  emailNotify: z.boolean(),
  recurrence: scheduleRecurrenceSchema,
  timezone: z.string(),
  enabled: z.boolean(),
  locale: z.string(),
  nextRunAt: z.string(),
  lastRunAt: z.string().nullable(),
  createdAt: z.string(),
});
export type RecurringTask = z.infer<typeof recurringTaskSchema>;

// ── Request bodies ───────────────────────────────────────────────────────────

export const createRecurringTaskBodySchema = z.object({
  title: z.string().min(1).max(120),
  instruction: z.string().min(1).max(4000),
  agentIdentifier: z.string().max(64).nullish(),
  delivery: recurringTaskDeliverySchema.default('document'),
  emailNotify: z.boolean().default(true),
  recurrence: scheduleRecurrenceSchema,
  timezone: z.string().min(1).default('Europe/Berlin'),
  locale: z.string().default('de-DE'),
  enabled: z.boolean().default(true),
});
export type CreateRecurringTaskBody = z.infer<typeof createRecurringTaskBodySchema>;

/** PATCH: every field optional (enable/disable or edit an existing task). */
export const updateRecurringTaskBodySchema = createRecurringTaskBodySchema.partial();
export type UpdateRecurringTaskBody = z.infer<typeof updateRecurringTaskBodySchema>;

// ── Run history ────────────────────────────────────────────────────────────────

export const recurringTaskRunSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  status: recurringTaskRunStatusSchema,
  resultsSummary: z.string().nullable(),
  resultUrl: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
});
export type RecurringTaskRun = z.infer<typeof recurringTaskRunSchema>;

// ── Response wrappers ──────────────────────────────────────────────────────────

export const recurringTasksListResponseSchema = z.object({
  success: z.boolean(),
  tasks: z.array(recurringTaskSchema),
});

export const recurringTaskItemResponseSchema = z.object({
  success: z.boolean(),
  task: recurringTaskSchema,
});

export const recurringTaskRunsResponseSchema = z.object({
  success: z.boolean(),
  runs: z.array(recurringTaskRunSchema),
});

export const recurringTaskDeleteResponseSchema = z.object({
  success: z.boolean(),
});

export const recurringTaskErrorResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
