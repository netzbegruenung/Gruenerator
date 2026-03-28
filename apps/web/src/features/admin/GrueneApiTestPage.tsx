import { Button, Skeleton } from '@gruenerator/ui';
import { useState } from 'react';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';
import apiClient from '../../components/utils/apiClient';

interface EndpointResult {
  status: number;
  data: unknown;
}

interface TestResults {
  apiBase: string;
  apiKeyConfigured: boolean;
  timestamp: string;
  results: Record<string, EndpointResult>;
}

function StatusBadge({ status }: { status: number }) {
  const color =
    status >= 200 && status < 300
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      : status === 401 || status === 403
        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
        : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';

  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono ${color}`}>{status}</span>
  );
}

function GrueneApiTestPage() {
  const [results, setResults] = useState<TestResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const runTest = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/internal/gruene-api/test');
      setResults(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to call test endpoint');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAll = () => {
    if (results) setExpandedKeys(new Set(Object.keys(results.results)));
  };

  const collapseAll = () => setExpandedKeys(new Set());

  return (
    <ErrorBoundary>
      <PageContainer
        maxWidth="lg"
        title="Grüne API Test"
        subtitle="Teste verfügbare Endpoints der Grüne-Plattform API"
      >
        <div className="flex flex-col gap-lg">
          <div className="flex items-center gap-md">
            <Button onClick={runTest} disabled={loading}>
              {loading ? 'Wird geladen…' : 'API testen'}
            </Button>
            {results && (
              <>
                <Button variant="outline" size="sm" onClick={expandAll}>
                  Alle aufklappen
                </Button>
                <Button variant="outline" size="sm" onClick={collapseAll}>
                  Alle zuklappen
                </Button>
              </>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-lg py-md text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          {loading && (
            <div className="flex flex-col gap-sm">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-12 rounded-md" />
              ))}
            </div>
          )}

          {results && (
            <div className="flex flex-col gap-sm">
              <div className="text-sm text-grey-500">
                Base: <code className="text-foreground">{results.apiBase}</code> · API Key:{' '}
                <code className="text-foreground">{results.apiKeyConfigured ? 'yes' : 'no'}</code> ·
                {results.timestamp}
              </div>

              {Object.entries(results.results).map(([key, result]) => {
                const expanded = expandedKeys.has(key);
                const itemCount =
                  result.data && typeof result.data === 'object'
                    ? ((result.data as any).data?.length ??
                      (result.data as any).items?.length ??
                      (result.data as any).count ??
                      null)
                    : null;

                return (
                  <div
                    key={key}
                    className="border border-grey-200 dark:border-grey-700 rounded-md overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggleExpand(key)}
                      className="w-full flex items-center justify-between px-md py-sm hover:bg-background-alt transition-colors text-left"
                    >
                      <div className="flex items-center gap-sm">
                        <StatusBadge status={result.status} />
                        <span className="font-mono text-sm text-foreground">{key}</span>
                        {itemCount !== null && (
                          <span className="text-xs text-grey-400">({itemCount} items)</span>
                        )}
                      </div>
                      <span className="text-grey-400 text-sm">{expanded ? '▲' : '▼'}</span>
                    </button>

                    {expanded && (
                      <div className="border-t border-grey-200 dark:border-grey-700 bg-grey-50 dark:bg-grey-900 px-md py-sm overflow-x-auto">
                        <pre className="text-xs text-foreground whitespace-pre-wrap break-words max-h-[500px] overflow-y-auto">
                          {JSON.stringify(result.data, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PageContainer>
    </ErrorBoundary>
  );
}

export default withAuthRequired(GrueneApiTestPage, {
  title: 'Grüne API Test',
});
