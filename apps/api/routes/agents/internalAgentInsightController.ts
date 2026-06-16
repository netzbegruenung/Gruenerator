import { Router, type Request, type Response } from 'express';

import { requireAdminToken } from '../../middleware/adminTokenMiddleware.js';
import {
  exportPrAgentInsightsForMonth,
  refreshAllPrAgentInsights,
  refreshPrAgentInsight,
} from '../../services/agents/prAgentInsightService.js';
import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('agents-internal');
const router: Router = Router();

/**
 * Refresh the monthly corpus-insight snapshots for the Öffentlichkeitsarbeit
 * (PR) agents. Called monthly by GitHub Actions cron (apps/api isn't running an
 * in-process scheduler).
 *
 * POST /api/internal/agents/refresh-pr-insights
 *   body: { identifier?: string, month?: 'YYYY-MM', sendDigest?: boolean }
 *   - no body → refresh all PR agents for current month (bulk → digest email)
 *   - { identifier } → refresh just that one (no digest)
 *   - { month } → store under that month label (defaults to current)
 *   - { sendDigest:false } → suppress the admin digest on a bulk run (test runs)
 */
router.post(
  '/refresh-pr-insights',
  requireAdminToken,
  async (req: Request, res: Response): Promise<void> => {
    const body = (req.body ?? {}) as {
      identifier?: string;
      month?: string;
      sendDigest?: boolean;
    };
    const month = typeof body.month === 'string' && body.month ? body.month : undefined;

    try {
      if (typeof body.identifier === 'string' && body.identifier) {
        log.info(`Single PR-agent refresh: ${body.identifier} (month=${month ?? 'current'})`);
        const result = await refreshPrAgentInsight(body.identifier, month);
        res.json({ success: true, results: result ? [result] : [] });
        return;
      }

      const sendDigest = body.sendDigest !== false; // default on for bulk runs
      log.info(`Bulk PR-agent refresh (month=${month ?? 'current'}, sendDigest=${sendDigest})`);
      const results = await refreshAllPrAgentInsights(month, { sendDigest });
      res.json({ success: true, count: results.length, results });
    } catch (error) {
      log.error(`PR-agent insight refresh failed: ${toError(error).message}`);
      res.status(500).json({ error: toError(error).message });
    }
  }
);

/**
 * Export the month's PR-agent snapshots as committable markdown audit files.
 * The monthly workflow writes these into the repo and opens an `automated` PR —
 * a version-controlled trail alongside the live (DB-driven) overlay.
 *
 * GET /api/internal/agents/pr-insights-export?month=YYYY-MM
 *   → { success: true, month, files: [{ path, content }] }
 */
router.get(
  '/pr-insights-export',
  requireAdminToken,
  async (req: Request, res: Response): Promise<void> => {
    const monthParam = req.query.month;
    const month = typeof monthParam === 'string' && monthParam ? monthParam : undefined;
    try {
      const files = await exportPrAgentInsightsForMonth(month);
      res.json({ success: true, month: month ?? null, count: files.length, files });
    } catch (error) {
      log.error(`PR-agent insight export failed: ${toError(error).message}`);
      res.status(500).json({ error: toError(error).message });
    }
  }
);

export const internalAgentInsightRouter = router;
