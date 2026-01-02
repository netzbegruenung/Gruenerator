import { getPostgresInstance, PostgresService } from '../PostgresService.js';
import type {
  LogGenerationParams,
  GenerationStatsRow,
  GenerationStatsByTypeRow,
  TimelineRow,
  TotalStatsRow,
  StatsQueryOptions,
  TimelineQueryOptions
} from './types.js';

export class GenerationStatsService {
  private postgresService: PostgresService | null = null;

  private getPostgres(): PostgresService {
    if (!this.postgresService) {
      this.postgresService = getPostgresInstance();
    }
    return this.postgresService;
  }

  async logGeneration({
    userId,
    generationType,
    platform,
    tokensUsed,
    success = true
  }: LogGenerationParams): Promise<void> {
    try {
      const postgres = this.getPostgres();
      await postgres.ensureInitialized();

      const sql = `
        INSERT INTO generation_logs (user_id, generation_type, platform, tokens_used, success)
        VALUES ($1, $2, $3, $4, $5)
      `;

      await postgres.pool.query(sql, [
        userId || null,
        generationType,
        platform || null,
        tokensUsed || null,
        success
      ]);
    } catch (error) {
      console.error('[GenerationStats] Failed to log generation:', (error as Error).message);
    }
  }

  async getGenerationStats({
    days = 30,
    limit = 50
  }: StatsQueryOptions = {}): Promise<GenerationStatsRow[]> {
    try {
      const postgres = this.getPostgres();
      await postgres.ensureInitialized();

      const sql = `
        SELECT
          generation_type,
          platform,
          COUNT(*) as count,
          COUNT(DISTINCT user_id) as unique_users,
          COUNT(*) FILTER (WHERE success = true) as successful,
          COUNT(*) FILTER (WHERE success = false) as failed
        FROM generation_logs
        WHERE created_at > NOW() - INTERVAL '1 day' * $1
        GROUP BY generation_type, platform
        ORDER BY count DESC
        LIMIT $2
      `;

      const result = await postgres.pool.query(sql, [days, limit]);
      return result.rows as GenerationStatsRow[];
    } catch (error) {
      console.error('[GenerationStats] Failed to get stats:', (error as Error).message);
      return [];
    }
  }

  async getGenerationStatsByType({
    days = 30
  }: StatsQueryOptions = {}): Promise<GenerationStatsByTypeRow[]> {
    try {
      const postgres = this.getPostgres();
      await postgres.ensureInitialized();

      const sql = `
        SELECT
          generation_type,
          COUNT(*) as count,
          COUNT(DISTINCT user_id) as unique_users
        FROM generation_logs
        WHERE created_at > NOW() - INTERVAL '1 day' * $1
        GROUP BY generation_type
        ORDER BY count DESC
      `;

      const result = await postgres.pool.query(sql, [days]);
      return result.rows as GenerationStatsByTypeRow[];
    } catch (error) {
      console.error('[GenerationStats] Failed to get stats by type:', (error as Error).message);
      return [];
    }
  }

  async getGenerationTimeline({
    days = 30,
    generationType = null
  }: TimelineQueryOptions = {}): Promise<TimelineRow[]> {
    try {
      const postgres = this.getPostgres();
      await postgres.ensureInitialized();

      let sql = `
        SELECT
          DATE_TRUNC('day', created_at)::date as date,
          generation_type,
          COUNT(*) as count
        FROM generation_logs
        WHERE created_at > NOW() - INTERVAL '1 day' * $1
      `;

      const params: (number | string)[] = [days];

      if (generationType) {
        sql += ` AND generation_type = $2`;
        params.push(generationType);
      }

      sql += `
        GROUP BY date, generation_type
        ORDER BY date DESC
      `;

      const result = await postgres.pool.query(sql, params);
      return result.rows as TimelineRow[];
    } catch (error) {
      console.error('[GenerationStats] Failed to get timeline:', (error as Error).message);
      return [];
    }
  }

  async getTotalStats(): Promise<TotalStatsRow | null> {
    try {
      const postgres = this.getPostgres();
      await postgres.ensureInitialized();

      const sql = `
        SELECT
          COUNT(*) as total_generations,
          COUNT(DISTINCT user_id) as total_users,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as last_7_days,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as last_30_days
        FROM generation_logs
      `;

      const result = await postgres.pool.query(sql);
      return result.rows[0] as TotalStatsRow;
    } catch (error) {
      console.error('[GenerationStats] Failed to get total stats:', (error as Error).message);
      return null;
    }
  }
}

let instance: GenerationStatsService | null = null;

export function getGenerationStatsService(): GenerationStatsService {
  if (!instance) {
    instance = new GenerationStatsService();
  }
  return instance;
}

export default GenerationStatsService;
export * from './types.js';
