import { Badge, Button, cn } from '@gruenerator/ui';
import { formatRelativeTime } from '@gruenerator/shared/utils';
import { useCallback, useEffect, useState } from 'react';
import { FiArrowLeft, FiClock, FiRotateCcw } from 'react-icons/fi';

import type { DocsApiClient } from '../../context/DocsContext';

interface Snapshot {
  id: string;
  version: number;
  created_at: string;
  is_auto_save: boolean;
  label: string | null;
  created_by_name: string | null;
}

interface SnapshotsResponse {
  snapshots: Snapshot[];
}

interface PreviewResponse {
  version: number;
  html: string;
  created_at: string;
}

interface VersionHistoryProps {
  documentId: string;
  apiClient: DocsApiClient;
  canEdit: boolean;
}

export function VersionHistory({ documentId, apiClient, canEdit }: VersionHistoryProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiClient
      .get<SnapshotsResponse>(`/docs/${documentId}/snapshots`)
      .then((data) => setSnapshots(data.snapshots))
      .catch(() => setError('Versionen konnten nicht geladen werden'))
      .finally(() => setLoading(false));
  }, [documentId, apiClient]);

  const handleSelectVersion = useCallback(
    (version: number) => {
      setSelectedVersion(version);
      setPreviewLoading(true);
      setPreview(null);
      apiClient
        .get<PreviewResponse>(`/docs/${documentId}/snapshots/${version}/preview`)
        .then(setPreview)
        .catch(() => setError('Vorschau konnte nicht geladen werden'))
        .finally(() => setPreviewLoading(false));
    },
    [documentId, apiClient]
  );

  const handleRestore = useCallback(async () => {
    if (selectedVersion === null) return;
    setRestoring(true);
    try {
      await apiClient.post(`/docs/${documentId}/snapshots/${selectedVersion}/restore`);
      window.location.reload();
    } catch {
      setError('Wiederherstellung fehlgeschlagen');
      setRestoring(false);
    }
  }, [documentId, selectedVersion, apiClient]);

  if (selectedVersion !== null) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-xs border-b border-grey-200 px-md py-sm dark:border-grey-700">
          <button
            onClick={() => {
              setSelectedVersion(null);
              setPreview(null);
            }}
            className="flex items-center gap-1 text-sm text-grey-500 hover:text-foreground dark:text-grey-400"
          >
            <FiArrowLeft size={14} />
            Zurück
          </button>
          <span className="ml-auto text-xs font-medium text-foreground">
            Version {selectedVersion}
          </span>
        </div>

        {previewLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-grey-300 border-t-primary-600" />
          </div>
        ) : preview ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-md">
              <div className="mb-sm text-xs text-grey-500 dark:text-grey-400">
                {formatRelativeTime(preview.created_at)}
              </div>
              <div
                className={cn(
                  'rounded-lg border border-grey-200 bg-background-alt p-md dark:border-grey-700',
                  'text-sm leading-relaxed text-foreground',
                  '[&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-2',
                  '[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-1.5',
                  '[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-1',
                  '[&_p]:mb-2 [&_ul]:mb-2 [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:pl-5',
                  '[&_li]:mb-0.5'
                )}
                dangerouslySetInnerHTML={{ __html: preview.html }}
              />
            </div>
            {canEdit && (
              <div className="border-t border-grey-200 p-md dark:border-grey-700">
                <Button onClick={handleRestore} disabled={restoring} className="w-full" size="sm">
                  <FiRotateCcw size={14} />
                  {restoring ? 'Wird wiederhergestellt...' : 'Diese Version wiederherstellen'}
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-grey-300 border-t-primary-600" />
          </div>
        ) : error ? (
          <div className="px-md py-8 text-center text-sm text-red-500">{error}</div>
        ) : snapshots.length === 0 ? (
          <div className="px-md py-8 text-center text-sm text-grey-500 dark:text-grey-400">
            Noch keine Versionen vorhanden.
          </div>
        ) : (
          <div className="divide-y divide-grey-100 dark:divide-grey-700">
            {snapshots.map((s) => (
              <button
                key={s.id}
                onClick={() => handleSelectVersion(s.version)}
                className="flex w-full items-start gap-sm px-md py-sm text-left transition-colors hover:bg-grey-50 dark:hover:bg-grey-800"
              >
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-grey-100 dark:bg-grey-700">
                  <FiClock size={13} className="text-grey-500 dark:text-grey-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-xs">
                    <span className="text-sm font-medium text-foreground">v{s.version}</span>
                    {s.label ? (
                      <Badge variant="outline" className="text-[0.625rem]">
                        {s.label}
                      </Badge>
                    ) : s.is_auto_save ? (
                      <Badge variant="outline" className="text-[0.625rem]">
                        Auto
                      </Badge>
                    ) : null}
                  </div>
                  <div className="text-xs text-grey-500 dark:text-grey-400">
                    {formatRelativeTime(s.created_at)}
                    {s.created_by_name && ` · ${s.created_by_name}`}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
