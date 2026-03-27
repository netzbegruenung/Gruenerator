export interface SourceGroupResult {
  id: string;
  name: string;
  stored: number;
  updated: number;
  skipped: number;
  fetchErrors: number;
  errors: number;
  duration: number;
  status: 'success' | 'failed';
  error?: string;
}

export interface SyncSummary {
  timestamp: string;
  dryRun: boolean;
  force: boolean;
  sources: SourceGroupResult[];
  totals: {
    sources: number;
    succeeded: number;
    failed: number;
    stored: number;
    updated: number;
    skipped: number;
    fetchErrors: number;
    errors: number;
  };
  totalDuration: number;
}
