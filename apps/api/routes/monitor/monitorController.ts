import { Router, type Response } from 'express';

import { generateKeywordInsights } from '../../services/monitor/KeywordInsightsGraph.js';
import { generateMonitorBriefing } from '../../services/monitor/MonitorBriefingGraph.js';
import {
  getLatestSnapshot,
  getHistory,
  getTopicArticles,
  searchArticles,
  searchArticlesByKeywords,
  getStimmung,
  refreshMonitor,
} from '../../services/monitor/MonitorService.js';
import { getEntitySummary } from '../../services/monitor/MonitorSummaryService.js';
import { getPolls } from '../../services/monitor/PollScraper.js';
import { getStimmungSummary } from '../../services/monitor/StimmungSummaryService.js';
import { TOPIC_CATEGORIES } from '../../services/monitor/types.js';
import {
  WATCHER_ENTITIES,
  getEntity,
  getEntityForLocale,
} from '../../services/monitor/watcherEntities.js';
import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';
import redisClient from '../../utils/redis/client.js';

import type { TopicCategory, MonitorLocale } from '../../services/monitor/types.js';
import type { AuthRequest } from '../auth/types.js';

const log = createLogger('monitor');
const router: Router = Router();

function parseLocale(raw: unknown): MonitorLocale | undefined {
  if (raw === 'de' || raw === 'at') return raw;
  return undefined;
}

router.get('/latest', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const locale = parseLocale(req.query.locale);
    const snapshot = await getLatestSnapshot(locale);
    if (!snapshot) {
      res.status(404).json({ error: 'No monitor data available yet' });
      return;
    }
    res.set('Cache-Control', 'private, max-age=120, stale-while-revalidate=300');
    res.json(snapshot);
  } catch (error) {
    log.error(`GET /latest failed: ${toError(error).message}`);
    res.status(500).json({ error: 'Failed to fetch monitor data' });
  }
});

router.get('/history', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const days = Math.min(Math.max(parseInt(String(req.query.days)) || 7, 1), 30);
    const history = await getHistory(days);
    res.set('Cache-Control', 'private, max-age=600, stale-while-revalidate=1800');
    res.json(history);
  } catch (error) {
    log.error(`GET /history failed: ${toError(error).message}`);
    res.status(500).json({ error: 'Failed to fetch monitor history' });
  }
});

router.get(
  '/topic/:topic',
  async (req: AuthRequest<{ topic: string }>, res: Response): Promise<void> => {
    try {
      const { topic } = req.params;
      if (!TOPIC_CATEGORIES.includes(topic as TopicCategory)) {
        res.status(400).json({ error: `Invalid topic: ${topic}` });
        return;
      }
      const locale = parseLocale(req.query.locale);
      const limit = Math.min(Math.max(parseInt(String(req.query.limit)) || 20, 1), 50);
      const articles = await getTopicArticles(topic as TopicCategory, limit, locale);
      res.set('Cache-Control', 'private, max-age=120, stale-while-revalidate=300');
      res.json({ topic, articles });
    } catch (error) {
      log.error(`GET /topic failed: ${toError(error).message}`);
      res.status(500).json({ error: 'Failed to fetch topic articles' });
    }
  }
);

router.get('/search', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const query = String(req.query.q || '').trim();
    if (query.length < 2) {
      res.status(400).json({ error: 'Query must be at least 2 characters' });
      return;
    }
    const locale = parseLocale(req.query.locale);
    const articles = await searchArticles(query, locale);
    const sources = [...new Set(articles.map((a) => a.source))];
    res.json({ query, count: articles.length, sources, articles });
  } catch (error) {
    log.error(`GET /search failed: ${toError(error).message}`);
    res.status(500).json({ error: 'Failed to search articles' });
  }
});

// ─── Entity watcher endpoints ────────────────────────────────────────

router.get('/keyword-insights', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const locale = parseLocale(req.query.locale) || 'de';
    const snapshot = await getLatestSnapshot();
    if (!snapshot?.keywords?.length) {
      res.status(404).json({ error: 'No keywords available' });
      return;
    }
    const insights = await generateKeywordInsights(snapshot.keywords, locale);
    res.set('Cache-Control', 'private, max-age=1800, stale-while-revalidate=3600');
    res.json(insights);
  } catch (error) {
    log.error(`GET /keyword-insights failed: ${toError(error).message}`);
    res.status(500).json({ error: 'Failed to generate keyword insights' });
  }
});

router.get('/briefing', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const locale = parseLocale(req.query.locale) || 'de';
    const [snapshot, stimmung, pollData] = await Promise.all([
      getLatestSnapshot(),
      getStimmung(locale),
      getPolls(),
    ]);
    if (!snapshot) {
      res.status(404).json({ error: 'No monitor data available' });
      return;
    }
    const result = await generateMonitorBriefing(
      locale,
      snapshot,
      stimmung,
      pollData?.average ?? {}
    );
    res.set('Cache-Control', 'private, max-age=1800, stale-while-revalidate=3600');
    res.json(result);
  } catch (error) {
    log.error(`GET /briefing failed: ${toError(error).message}`);
    res.status(500).json({ error: 'Failed to generate briefing' });
  }
});

router.post('/briefing/refresh', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const locale = parseLocale(req.query.locale) || 'de';
    await redisClient.del(`monitor:briefing:${locale}`);
    const [snapshot, stimmung, pollData] = await Promise.all([
      getLatestSnapshot(),
      getStimmung(locale),
      getPolls(),
    ]);
    if (!snapshot) {
      res.status(404).json({ error: 'No monitor data available' });
      return;
    }
    const result = await generateMonitorBriefing(
      locale,
      snapshot,
      stimmung,
      pollData?.average ?? {}
    );
    res.json(result);
  } catch (error) {
    log.error(`POST /briefing/refresh failed: ${toError(error).message}`);
    res.status(500).json({ error: 'Failed to regenerate briefing' });
  }
});

router.get('/polls', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await getPolls();
    res.set('Cache-Control', 'private, max-age=1800, stale-while-revalidate=3600');
    res.json(data);
  } catch (error) {
    log.error(`GET /polls failed: ${toError(error).message}`);
    res.status(500).json({ error: 'Failed to fetch polls' });
  }
});

router.get('/stimmung', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const locale = parseLocale(req.query.locale);
    const stimmung = await getStimmung(locale);
    const summary = await getStimmungSummary(locale, stimmung).catch(() => null);
    if (summary) {
      stimmung.moodSummary = summary.moodSummary;
      stimmung.moodReason = summary.dominantReason;
    }
    res.set('Cache-Control', 'private, max-age=300, stale-while-revalidate=600');
    res.json(stimmung);
  } catch (error) {
    log.error(`GET /stimmung failed: ${toError(error).message}`);
    res.status(500).json({ error: 'Failed to fetch stimmung' });
  }
});

router.get('/entities', (_req: AuthRequest, res: Response): void => {
  res.set('Cache-Control', 'private, max-age=86400');
  res.json(WATCHER_ENTITIES.map(({ id, label, keywords }) => ({ id, label, keywords })));
});

router.get(
  '/entities/:id',
  async (req: AuthRequest<{ id: string }>, res: Response): Promise<void> => {
    try {
      const entity = getEntity(req.params.id);
      if (!entity) {
        res.status(404).json({ error: 'Entity not found' });
        return;
      }
      const locale = parseLocale(req.query.locale);
      const articles = await searchArticlesByKeywords(
        entity.keywords,
        locale,
        50,
        entity.excludePatterns
      );
      const sources = [...new Set(articles.map((a) => a.source))];
      res.set('Cache-Control', 'private, max-age=300, stale-while-revalidate=600');
      res.json({
        entity: { id: entity.id, label: entity.label },
        count: articles.length,
        sources,
        articles,
      });
    } catch (error) {
      log.error(`GET /entities/:id failed: ${toError(error).message}`);
      res.status(500).json({ error: 'Failed to fetch entity results' });
    }
  }
);

router.get(
  '/entities/:id/summary',
  async (req: AuthRequest<{ id: string }>, res: Response): Promise<void> => {
    try {
      const entity = getEntity(req.params.id);
      if (!entity) {
        res.status(404).json({ error: 'Entity not found' });
        return;
      }
      const locale = parseLocale(req.query.locale) || 'de';
      const articles = await searchArticlesByKeywords(
        entity.keywords,
        locale,
        50,
        entity.excludePatterns
      );
      const result = await getEntitySummary(entity, articles, locale);
      res.set('Cache-Control', 'private, max-age=600, stale-while-revalidate=1800');
      res.json({
        entity: { id: entity.id, label: entity.label },
        count: result.articleCount,
        summary: result.summary,
        attackAnalysis: result.attackAnalysis,
        generatedAt: result.generatedAt,
      });
    } catch (error) {
      log.error(`GET /entities/:id/summary failed: ${toError(error).message}`);
      res.status(500).json({ error: 'Failed to generate summary' });
    }
  }
);

router.post('/refresh', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    log.info('Monitor refresh triggered by user');
    const snapshot = await refreshMonitor();
    res.json({
      success: true,
      totalArticles: snapshot.totalArticles,
      activeTopics: snapshot.topics.filter((t) => t.articleCount > 0).length,
    });
  } catch (error) {
    log.error(`POST /refresh failed: ${toError(error).message}`);
    res.status(500).json({ error: 'Refresh failed' });
  }
});

export default router;
