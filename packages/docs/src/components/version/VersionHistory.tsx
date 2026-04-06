import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  cn,
} from '@gruenerator/ui';
import { formatRelativeTime } from '@gruenerator/shared/utils';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FiArrowLeft, FiClock, FiRotateCcw, FiSave } from 'react-icons/fi';
import { toast } from 'sonner';

import type { DocsApiClient } from '../../context/DocsContext';

interface Snapshot {
  id: string;
  version: number;
  created_at: string;
  is_auto_save: boolean;
  label: string | null;
  created_by_name: string | null;
  snapshot_count?: number;
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
  onRestore?: (html: string) => void;
}

export function VersionHistory({ documentId, apiClient, canEdit, onRestore }: VersionHistoryProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showLabelInput, setShowLabelInput] = useState(false);
  const labelInputRef = useRef<HTMLInputElement>(null);

  const fetchSnapshots = useCallback(() => {
    setLoading(true);
    setError(null);
    apiClient
      .get<SnapshotsResponse>(`/docs/${documentId}/snapshots`)
      .then((data) => setSnapshots(data.snapshots))
      .catch(() => setError('Versionen konnten nicht geladen werden'))
      .finally(() => setLoading(false));
  }, [documentId, apiClient]);

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);

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

  const handleSaveVersion = useCallback(async () => {
    setSaving(true);
    const label = labelInputRef.current?.value.trim() || null;
    try {
      await apiClient.post(`/docs/${documentId}/snapshots`, { label });
      setShowLabelInput(false);
      if (labelInputRef.current) labelInputRef.current.value = '';
      fetchSnapshots();
      toast.success('Version gespeichert');
    } catch {
      setError('Version konnte nicht gespeichert werden');
    } finally {
      setSaving(false);
    }
  }, [documentId, apiClient, fetchSnapshots]);

  const handleRestore = useCallback(async () => {
    if (selectedVersion === null || !preview) return;
    const previousLatest = snapshots[0]?.version;
    setRestoring(true);
    try {
      await apiClient.post(`/docs/${documentId}/snapshots/${selectedVersion}/restore`);
      if (onRestore) {
        onRestore(preview.html);
      }
      setSelectedVersion(null);
      setPreview(null);
      setRestoring(false);
      fetchSnapshots();
      toast.success('Version wiederhergestellt', {
        action: previousLatest
          ? {
              label: 'Rückgängig',
              onClick: async () => {
                try {
                  const prev = await apiClient.get<PreviewResponse>(
                    `/docs/${documentId}/snapshots/${previousLatest}/preview`
                  );
                  await apiClient.post(`/docs/${documentId}/snapshots/${previousLatest}/restore`);
                  if (onRestore) onRestore(prev.html);
                  fetchSnapshots();
                  toast.success('Wiederherstellung rückgängig gemacht');
                } catch {
                  toast.error('Rückgängig fehlgeschlagen');
                }
              },
            }
          : undefined,
        duration: 10000,
      });
    } catch {
      setError('Wiederherstellung fehlgeschlagen');
      setRestoring(false);
    }
  }, [documentId, selectedVersion, apiClient, preview, onRestore, snapshots, fetchSnapshots]);

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
                <Button
                  onClick={() => setConfirmOpen(true)}
                  disabled={restoring}
                  className="w-full"
                  size="sm"
                >
                  <FiRotateCcw size={14} />
                  {restoring ? 'Wird wiederhergestellt...' : 'Diese Version wiederherstellen'}
                </Button>
                <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                  <AlertDialogContent size="sm">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Version wiederherstellen?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Der aktuelle Inhalt wird durch Version {selectedVersion} ersetzt. Eine
                        Sicherungskopie wird automatisch als neue Version gespeichert.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          setConfirmOpen(false);
                          handleRestore();
                        }}
                      >
                        Wiederherstellen
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {canEdit && (
        <div className="border-b border-grey-200 px-md py-sm dark:border-grey-700">
          {showLabelInput ? (
            <div className="flex gap-xs">
              <input
                ref={labelInputRef}
                type="text"
                placeholder="Bezeichnung (optional)"
                className="flex-1 rounded-md border border-grey-200 bg-background px-2 py-1 text-sm text-foreground placeholder:text-grey-400 dark:border-grey-600"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveVersion();
                  if (e.key === 'Escape') setShowLabelInput(false);
                }}
                autoFocus
              />
              <Button size="sm" onClick={handleSaveVersion} disabled={saving}>
                {saving ? '...' : 'Speichern'}
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setShowLabelInput(true)}
            >
              <FiSave size={14} />
              Version speichern
            </Button>
          )}
        </div>
      )}
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
                    {s.snapshot_count &&
                      s.snapshot_count > 1 &&
                      ` · ${s.snapshot_count} Änderungen`}
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
