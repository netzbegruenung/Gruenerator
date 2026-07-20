/**
 * EXPERIMENTAL — ts-rest contract router for recurring agent task CRUD.
 *
 * requireAuth is applied at the /api/recurring-tasks prefix in routes.ts. Owner-scoped
 * throughout (getAuthedUser); mirrors userAgentsContractRouter.
 */
import { recurringTasksContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { runRecurringTask } from '../../services/recurringTasks/recurringTaskRunner.js';
import {
  createRecurringTask,
  deleteRecurringTask,
  getRecurringTask,
  getRecurringTaskRow,
  listRecurringTaskRuns,
  listRecurringTasks,
  toApiTask,
  updateRecurringTask,
} from '../../services/recurringTasks/recurringTasksRepository.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('recurringTasksContractRouter');

const notFound = {
  status: 404 as const,
  body: { success: false, message: 'Aufgabe nicht gefunden.' },
};

const s = initServer();

export const recurringTasksContractRouter = s.router(recurringTasksContract, {
  list: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const tasks = await listRecurringTasks(userId);
      return { status: 200 as const, body: { success: true, tasks } };
    } catch (error) {
      const err = error as Error;
      log.error('[recurringTasks.list] Error:', err);
      return { status: 500 as const, body: { success: false, message: err.message } };
    }
  },

  create: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const task = await createRecurringTask(userId, args.body);
      return { status: 201 as const, body: { success: true, task } };
    } catch (error) {
      const err = error as Error;
      log.error('[recurringTasks.create] Error:', err);
      return { status: 500 as const, body: { success: false, message: err.message } };
    }
  },

  get: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const task = await getRecurringTask(userId, args.params.id);
      if (!task) return notFound;
      return { status: 200 as const, body: { success: true, task } };
    } catch (error) {
      const err = error as Error;
      log.error('[recurringTasks.get] Error:', err);
      return { status: 500 as const, body: { success: false, message: err.message } };
    }
  },

  update: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const task = await updateRecurringTask(userId, args.params.id, args.body);
      if (!task) return notFound;
      return { status: 200 as const, body: { success: true, task } };
    } catch (error) {
      const err = error as Error;
      log.error('[recurringTasks.update] Error:', err);
      return { status: 500 as const, body: { success: false, message: err.message } };
    }
  },

  remove: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const ok = await deleteRecurringTask(userId, args.params.id);
      if (!ok) return notFound;
      return { status: 200 as const, body: { success: true } };
    } catch (error) {
      const err = error as Error;
      log.error('[recurringTasks.remove] Error:', err);
      return { status: 500 as const, body: { success: false, message: err.message } };
    }
  },

  runNow: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const row = await getRecurringTaskRow(userId, args.params.id);
      if (!row) return notFound;
      // Run once immediately, regardless of paused state, WITHOUT touching the
      // schedule (next_run_at) or enabled flag. The runner records the run and
      // notifies; fire-and-forget so the request returns fast.
      void runRecurringTask(row);
      return { status: 202 as const, body: { success: true, task: toApiTask(row) } };
    } catch (error) {
      const err = error as Error;
      log.error('[recurringTasks.runNow] Error:', err);
      return { status: 500 as const, body: { success: false, message: err.message } };
    }
  },

  listRuns: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const runs = await listRecurringTaskRuns(userId, args.params.id);
      return { status: 200 as const, body: { success: true, runs } };
    } catch (error) {
      const err = error as Error;
      log.error('[recurringTasks.listRuns] Error:', err);
      return { status: 500 as const, body: { success: false, message: err.message } };
    }
  },
});

/**
 * Mount the ts-rest recurring-tasks contract router. requireAuth is applied at the prefix.
 */
export function mountRecurringTasksContractRouter(app: Application): void {
  createExpressEndpoints(recurringTasksContract, recurringTasksContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'recurringTasksContract'),
  });
}
