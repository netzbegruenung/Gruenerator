import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  boardAgentRunListSchema,
  boardScheduleErrorResponseSchema,
  boardScheduleInputSchema,
  boardScheduleListSchema,
  boardScheduleSchema,
  boardScheduleUpdateSchema,
} from '../schemas/boardSchedules.js';

const c = initContract();

const errorResponses = {
  400: boardScheduleErrorResponseSchema,
  401: boardScheduleErrorResponseSchema,
  403: boardScheduleErrorResponseSchema,
  404: boardScheduleErrorResponseSchema,
  500: boardScheduleErrorResponseSchema,
};

export const boardSchedulesContract = c.router(
  {
    // ── Schedules (Phase 1) ──────────────────────────────────────────────────
    listSchedules: {
      method: 'GET',
      path: '/api/board-schedules/:boardId/schedules',
      pathParams: z.object({ boardId: z.string() }),
      responses: { 200: boardScheduleListSchema, ...errorResponses },
      summary: "List a board's scheduled agent runs",
    },
    createSchedule: {
      method: 'POST',
      path: '/api/board-schedules/:boardId/cards/:cardId/schedules',
      pathParams: z.object({ boardId: z.string(), cardId: z.string() }),
      body: boardScheduleInputSchema,
      responses: { 201: boardScheduleSchema, ...errorResponses },
      summary: 'Create a recurring schedule for a card KI-Spalte',
    },
    updateSchedule: {
      method: 'PATCH',
      path: '/api/board-schedules/:boardId/schedules/:scheduleId',
      pathParams: z.object({ boardId: z.string(), scheduleId: z.string() }),
      body: boardScheduleUpdateSchema,
      responses: { 200: boardScheduleSchema, ...errorResponses },
      summary: 'Edit a schedule or toggle it enabled/disabled',
    },
    deleteSchedule: {
      method: 'DELETE',
      path: '/api/board-schedules/:boardId/schedules/:scheduleId',
      pathParams: z.object({ boardId: z.string(), scheduleId: z.string() }),
      body: z.object({}),
      responses: { 200: z.object({ success: z.literal(true) }), ...errorResponses },
      summary: 'Delete a schedule',
    },
    runScheduleNow: {
      method: 'POST',
      path: '/api/board-schedules/:boardId/schedules/:scheduleId/run',
      pathParams: z.object({ boardId: z.string(), scheduleId: z.string() }),
      body: z.object({}),
      responses: { 202: z.object({ taskId: z.string() }), ...errorResponses },
      summary: 'Trigger a schedule immediately (does not affect its timer)',
    },

    // ── Review loop (Phase 2) ─────────────────────────────────────────────────
    acceptRun: {
      method: 'POST',
      path: '/api/board-schedules/:boardId/runs/:taskId/accept',
      pathParams: z.object({ boardId: z.string(), taskId: z.string() }),
      body: z.object({}),
      responses: { 200: z.object({ success: z.literal(true) }), ...errorResponses },
      summary: 'Accept a run awaiting review (→ completed)',
    },
    redoRun: {
      method: 'POST',
      path: '/api/board-schedules/:boardId/runs/:taskId/redo',
      pathParams: z.object({ boardId: z.string(), taskId: z.string() }),
      body: z.object({ instruction: z.string().max(2000).optional() }),
      responses: { 202: z.object({ taskId: z.string() }), ...errorResponses },
      summary: 'Re-run a review run, optionally with a refinement note',
    },

    // ── Run history (Phase 3) ─────────────────────────────────────────────────
    listRuns: {
      method: 'GET',
      path: '/api/board-schedules/:boardId/runs',
      pathParams: z.object({ boardId: z.string() }),
      query: z.object({ cardId: z.string().optional(), scheduleId: z.string().optional() }),
      responses: { 200: boardAgentRunListSchema, ...errorResponses },
      summary: 'List past + in-flight agent runs for a board (optionally per card/schedule)',
    },
  },
  { pathPrefix: '' }
);
