import { Button, Skeleton } from '@gruenerator/ui';
import { useState } from 'react';
import { FiChevronDown, FiChevronRight } from 'react-icons/fi';

import apiClient from '../../../components/utils/apiClient';
import { AdminPanel } from '../components/adminUi';

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
      ? 'border-green-700 text-green-800 dark:border-green-400 dark:text-green-300'
      : status === 401 || status === 403
        ? 'border-red-700 text-red-800 dark:border-red-400 dark:text-red-300'
        : 'border-yellow-700 text-yellow-800 dark:border-yellow-400 dark:text-yellow-300';

  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 font-mono text-xs tabular-nums ${color}`}
    >
      {status}
    </span>
  );
}

export default function GrueneApiTestView() {
  const [results, setResults] = useState<TestResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const runTest = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<TestResults>('/internal/gruene-api/test');
      setResults(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to call test endpoint');
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
    <>
      <div className="flex flex-wrap items-center gap-sm">
        <Button variant="brand" onClick={runTest} disabled={loading}>
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
        <div
          role="alert"
          className="rounded-xl border border-grey-200 bg-background px-md py-sm text-sm text-red-700 dark:border-grey-800 dark:text-red-300"
        >
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
        <>
          <div className="text-sm text-grey-600 dark:text-grey-400">
            Base: <code className="text-foreground">{results.apiBase}</code> · API-Key:{' '}
            <code className="text-foreground">{results.apiKeyConfigured ? 'ja' : 'nein'}</code> ·{' '}
            {results.timestamp}
          </div>
          <AdminPanel flush>
            <ul className="m-0 list-none p-0">
              {Object.entries(results.results).map(([key, result]) => {
                const expanded = expandedKeys.has(key);
                const itemCount =
                  result.data && typeof result.data === 'object'
                    ? (((result.data as Record<string, unknown>).data as unknown[] | undefined)
                        ?.length ??
                      ((result.data as Record<string, unknown>).items as unknown[] | undefined)
                        ?.length ??
                      ((result.data as Record<string, unknown>).count as number | null) ??
                      null)
                    : null;

                return (
                  <li
                    key={key}
                    className="border-t border-grey-200 first:border-t-0 dark:border-grey-800"
                  >
                    <button
                      type="button"
                      onClick={() => toggleExpand(key)}
                      aria-expanded={expanded}
                      className="flex w-full items-center justify-between px-md py-sm text-left transition-colors hover:bg-grey-100 focus-visible:outline-2 focus-visible:-outline-offset-2 dark:hover:bg-grey-800"
                    >
                      <div className="flex flex-wrap items-center gap-sm">
                        <StatusBadge status={result.status} />
                        <span className="font-mono text-sm text-foreground">{key}</span>
                        {itemCount !== null && (
                          <span className="text-xs text-grey-600 dark:text-grey-400">
                            ({itemCount} Einträge)
                          </span>
                        )}
                      </div>
                      {expanded ? (
                        <FiChevronDown aria-hidden className="text-grey-600 dark:text-grey-400" />
                      ) : (
                        <FiChevronRight aria-hidden className="text-grey-600 dark:text-grey-400" />
                      )}
                    </button>

                    {expanded && (
                      <div className="overflow-x-auto border-t border-grey-200 bg-grey-100 px-md py-sm dark:border-grey-800 dark:bg-grey-900">
                        <pre className="m-0 max-h-[500px] overflow-y-auto whitespace-pre-wrap break-words text-xs text-foreground">
                          {JSON.stringify(result.data, null, 2)}
                        </pre>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </AdminPanel>
        </>
      )}
    </>
  );
}
