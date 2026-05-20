import { type WolkeFolderRef } from '@gruenerator/contracts';
import { Badge, Button, SectionHeader, Switch } from '@gruenerator/ui';
import { useState } from 'react';
import { HiCheck, HiCloud, HiX } from 'react-icons/hi';

import {
  usePendingWolkeFiles,
  useAddPendingFile,
  useDismissPendingFile,
  useSetNotebookAutoSync,
} from '../hooks/usePendingWolkeFiles';

interface Props {
  collectionId: string;
  wolkeFolders: WolkeFolderRef[];
  autoSync: boolean;
}

const ExperimentalBadge = (
  <Badge
    variant="outline"
    className="border-amber-300 bg-amber-50 text-[10px] uppercase text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
  >
    Experimentell
  </Badge>
);

/**
 * Shows files the hourly watcher detected in this notebook's Wolke folders but
 * that haven't been imported yet, with a one-click "Hinzufügen", plus the
 * toggle that turns hourly watching on/off. Only renders for notebooks that
 * actually have Wolke folders attached.
 */
const NotebookPendingFilesPanel = ({ collectionId, wolkeFolders, autoSync }: Props) => {
  const [watching, setWatching] = useState(autoSync);
  const [addingId, setAddingId] = useState<string | null>(null);

  const pendingQuery = usePendingWolkeFiles(collectionId, wolkeFolders.length > 0 && watching);
  const addMutation = useAddPendingFile(collectionId);
  const dismissMutation = useDismissPendingFile(collectionId);
  const autoSyncMutation = useSetNotebookAutoSync(collectionId);

  if (wolkeFolders.length === 0) return null;

  const pending = pendingQuery.data ?? [];

  const handleToggle = (next: boolean) => {
    setWatching(next);
    autoSyncMutation.mutate(next, {
      onError: () => setWatching(!next), // revert on failure
    });
  };

  const handleAdd = (pendingId: string) => {
    setAddingId(pendingId);
    addMutation.mutate(pendingId, { onSettled: () => setAddingId(null) });
  };

  return (
    <section>
      <SectionHeader
        title="Neue Dateien aus der Wolke"
        actions={
          <div className="flex items-center gap-sm">
            {ExperimentalBadge}
            {watching && pending.length > 0 && (
              <span className="text-sm text-grey-500">{pending.length}</span>
            )}
          </div>
        }
      />

      <div className="mb-md flex items-center justify-between gap-md rounded-xl border border-grey-200 bg-background px-md py-sm dark:border-grey-800">
        <div className="min-w-0">
          <p className="m-0 text-sm font-medium text-foreground">
            Stündlich auf neue Dateien prüfen
          </p>
          <p className="m-0 text-xs text-grey-500">
            Wir benachrichtigen dich, wenn in deinen Wolke-Ordnern neue Dateien auftauchen.
          </p>
        </div>
        <Switch
          checked={watching}
          onCheckedChange={handleToggle}
          disabled={autoSyncMutation.isPending}
          aria-label="Stündliche Überwachung umschalten"
        />
      </div>

      {watching && pending.length > 0 && (
        <div className="grid grid-cols-1 gap-md sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {pending.map((file) => {
            const isAdding = addingId === file.id;
            const isDismissing = dismissMutation.isPending && dismissMutation.variables === file.id;
            return (
              <div
                key={file.id}
                className="group relative flex min-h-[112px] min-w-0 flex-col gap-xs overflow-hidden rounded-xl border border-grey-200 bg-background p-md dark:border-grey-800"
                aria-label={`Neue Datei: ${file.file_name}`}
              >
                <div className="flex items-start gap-xs pr-6">
                  <HiCloud
                    size={14}
                    className="mt-[2px] shrink-0 text-secondary-600 dark:text-secondary-400"
                    aria-hidden
                  />
                  <div
                    className="line-clamp-2 break-words text-sm font-medium leading-snug text-foreground"
                    title={file.file_name}
                  >
                    {file.file_name}
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-end gap-xs">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isAdding || isDismissing}
                    onClick={() => dismissMutation.mutate(file.id)}
                    aria-label={`${file.file_name} verwerfen`}
                  >
                    <HiX size={12} />
                    Verwerfen
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isAdding || isDismissing}
                    onClick={() => handleAdd(file.id)}
                    aria-label={`${file.file_name} hinzufügen`}
                  >
                    {isAdding ? (
                      <span className="size-3 animate-spin rounded-full border-2 border-grey-200 border-t-primary-500" />
                    ) : (
                      <HiCheck size={12} />
                    )}
                    Hinzufügen
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {watching && pending.length === 0 && !pendingQuery.isLoading && (
        <p className="m-0 rounded-xl border border-dashed border-grey-300 bg-background p-md text-sm text-grey-500 dark:border-grey-700">
          Keine neuen Dateien. Du wirst benachrichtigt, sobald welche auftauchen.
        </p>
      )}
    </section>
  );
};

export default NotebookPendingFilesPanel;
