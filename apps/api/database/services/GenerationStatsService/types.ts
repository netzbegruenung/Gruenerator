export interface LogGenerationParams {
  userId: string | null;
  generationType: string;
  platform: string | null;
  tokensUsed: number | null;
  success?: boolean;
}

export interface GenerationStatsRow {
  generation_type: string;
  platform: string | null;
  count: string;
  unique_users: string;
  successful: string;
  failed: string;
}

export interface GenerationStatsByTypeRow {
  generation_type: string;
  count: string;
  unique_users: string;
}

export interface TimelineRow {
  date: string;
  generation_type: string;
  count: string;
}

export interface TotalStatsRow {
  total_generations: string;
  total_users: string;
  last_7_days: string;
  last_30_days: string;
}

export interface StatsQueryOptions {
  days?: number;
  limit?: number;
}

export interface TimelineQueryOptions {
  days?: number;
  generationType?: string | null;
}
