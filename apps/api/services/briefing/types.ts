export interface ScrapeConfig {
  articleSelector?: string;
  linkSelector?: string;
  titleSelector?: string;
  dateSelector?: string;
  dateAttribute?: string;
  excerptSelector?: string;
  baseUrl?: string;
  jsonPattern?: string;
  maxPages?: number;
  paginationParam?: string;
}

export interface SourceConfig {
  type: 'web' | 'twitter' | 'instagram' | 'facebook' | 'rss' | 'documents' | 'scrape';
  query?: string;
  domains?: string[];
  username?: string;
  url?: string;
  collection?: string;
  keywords?: string[];
  scrapeConfig?: ScrapeConfig;
}

export interface BriefingConfig {
  sources: SourceConfig[];
  language: string;
  timeRange: 'day' | 'week';
  maxResultsPerSource: number;
  outputFormat: 'summary' | 'list' | 'digest';
  customPrompt?: string;
  positionCollections?: string[];
  positionComparisonPrompt?: string;
}

export interface BriefingAgent {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  config: BriefingConfig;
  schedule_type: 'hourly' | 'daily' | 'weekly';
  schedule_hour: number;
  schedule_timezone: string;
  delivery_email: string | null;
  created_at: string;
  updated_at: string;
  last_executed_at: string | null;
  execution_count: number;
  consecutive_empty_count: number;
}

export interface BriefingExecution {
  id: string;
  agent_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'empty';
  results_count: number;
  results_summary: string | null;
  results_raw: CollectedItem[] | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
}

export interface CollectedItem {
  url: string;
  title: string;
  excerpt: string;
  source: string;
  sourceType: SourceConfig['type'];
  publishedAt: string | null;
  fullContent?: string;
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  config: BriefingConfig;
  schedule_type?: 'hourly' | 'daily' | 'weekly';
  schedule_hour?: number;
  schedule_timezone?: string;
  delivery_email?: string;
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  config?: BriefingConfig;
  schedule_type?: 'hourly' | 'daily' | 'weekly';
  schedule_hour?: number;
  schedule_timezone?: string;
  delivery_email?: string;
}
