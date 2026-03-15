import {
  useShareLinks,
  useSyncStatuses,
  useSyncFolder,
  useSetAutoSync,
  type SyncStatus,
} from '@gruenerator/wolke';
import { motion } from 'motion/react';
import React from 'react';

import Spinner from '../../../components/common/Spinner';
import { formatRelativeDate } from '../../../utils/dateFormatter';

const ITEM_MOTION = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2 },
} as const;

interface FolderSelection {
  shareId: string;
  folderPath: string;
}

interface WolkeFolderBrowserProps {
  onFolderSelect?: (selection: FolderSelection) => void;
  selectedFolderId?: string | null;
}

export const WolkeFolderBrowser = ({
  onFolderSelect,
  selectedFolderId,
}: WolkeFolderBrowserProps): React.ReactElement => {
  const {
    data: allShareLinks = [],
    isLoading: loading,
    error: queryError,
    refetch,
  } = useShareLinks();
  const { data: syncStatuses = [] } = useSyncStatuses();
  const syncFolderMutation = useSyncFolder();
  const setAutoSyncMutation = useSetAutoSync();

  const shareLinks = allShareLinks.filter((link) => link.is_active);
  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : String(queryError)
    : null;

  const [expandedShares, setExpandedShares] = React.useState<Set<string>>(new Set());

  const toggleShareExpansion = (shareId: string) => {
    setExpandedShares((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(shareId)) {
        newSet.delete(shareId);
      } else {
        newSet.add(shareId);
      }
      return newSet;
    });
  };

  const handleFolderSelect = (shareId: string, folderPath = '') => {
    onFolderSelect?.({ shareId, folderPath });
  };

  const handleSyncFolder = async (shareId: string, folderPath = '') => {
    try {
      await syncFolderMutation.mutateAsync({ shareLinkId: shareId, folderPath });
    } catch (err) {
      console.error('[WolkeFolderBrowser] Sync failed:', err);
    }
  };

  const handleToggleAutoSync = async (shareId: string, folderPath = '', enabled: boolean) => {
    try {
      await setAutoSyncMutation.mutateAsync({
        shareLinkId: shareId,
        folderPath,
        enabled,
      });

      if (enabled) {
        try {
          await syncFolderMutation.mutateAsync({ shareLinkId: shareId, folderPath });
        } catch (syncError) {
          console.error('[WolkeFolderBrowser] Auto-sync initial sync failed:', syncError);
        }
      }
    } catch (err) {
      console.error('[WolkeFolderBrowser] Auto-sync toggle failed:', err);
    }
  };

  const getSyncStatus = (shareLinkId: string, folderPath = ''): SyncStatus | undefined => {
    return syncStatuses.find(
      (s) => s.share_link_id === shareLinkId && s.folder_path === folderPath
    );
  };

  const isSyncing = (shareLinkId: string): boolean => {
    const status = getSyncStatus(shareLinkId);
    return syncFolderMutation.isPending || status?.sync_status === 'syncing';
  };

  const formatLastSync = (lastSyncAt: string | null | undefined) => {
    if (!lastSyncAt) return 'Nie synchronisiert';
    return formatRelativeDate(lastSyncAt);
  };

  if (loading) {
    return (
      <div className="py-md">
        <div className="flex flex-col items-center gap-sm text-grey-400">
          <Spinner size="small" />
          <p className="text-sm">Lade Wolke-Links...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-md">
        <div className="flex flex-col items-center gap-sm">
          <p className="text-sm text-red-500">{error}</p>
          <button
            onClick={() => void refetch()}
            className="text-sm text-primary-600 hover:underline"
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  if (shareLinks.length === 0) {
    return (
      <div className="py-md">
        <div className="flex flex-col gap-xs text-grey-400">
          <p className="text-sm">Keine aktiven Wolke-Links gefunden.</p>
          <p className="text-xs">Erstelle zuerst einen Wolke-Link in deinem Nextcloud-Account.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-xs">
      {shareLinks.map((shareLink) => {
        const isExpanded = expandedShares.has(shareLink.id);
        const syncStatus = getSyncStatus(shareLink.id);
        const isCurrentlySyncing = isSyncing(shareLink.id);
        const isSelected = selectedFolderId === shareLink.id;

        return (
          <motion.div
            key={shareLink.id}
            className={`rounded-lg border ${
              isSelected
                ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/10'
                : 'border-grey-200 dark:border-grey-700'
            }`}
            initial={ITEM_MOTION.initial}
            animate={ITEM_MOTION.animate}
            transition={ITEM_MOTION.transition}
          >
            <div className="flex items-center gap-sm p-sm">
              <button
                className="shrink-0 p-xxs rounded hover:bg-grey-100 dark:hover:bg-grey-800"
                onClick={() => toggleShareExpansion(shareLink.id)}
                aria-label={`${isExpanded ? 'Zuklappen' : 'Aufklappen'} ${shareLink.label || 'Unbenannte Verbindung'}`}
              >
                <svg
                  className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="9,6 15,12 9,18" />
                </svg>
              </button>

              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium m-0 truncate">
                  {shareLink.label || 'Unbenannte Verbindung'}
                </h4>
                <div className="flex items-center gap-xs text-xs text-grey-400 flex-wrap">
                  <span className="truncate">{shareLink.base_url || shareLink.share_link}</span>
                  {syncStatus && (
                    <span
                      className={`inline-flex items-center px-1.5 py-0 rounded-full text-[0.65rem] ${
                        syncStatus.sync_status === 'syncing'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : syncStatus.sync_status === 'completed'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : syncStatus.sync_status === 'failed'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                              : 'bg-grey-100 text-grey-600 dark:bg-grey-800 dark:text-grey-400'
                      }`}
                    >
                      {syncStatus.sync_status === 'syncing' && 'Synchronisiert...'}
                      {syncStatus.sync_status === 'completed' && 'Synchronisiert'}
                      {syncStatus.sync_status === 'failed' && 'Fehler'}
                      {syncStatus.sync_status === 'idle' && 'Bereit'}
                    </span>
                  )}
                </div>
              </div>

              <button
                className={`shrink-0 text-xs px-sm py-xxs rounded-md border transition-colors ${
                  isSelected
                    ? 'bg-primary-500 text-white border-primary-500'
                    : 'border-grey-200 dark:border-grey-700 hover:border-primary-500 hover:text-primary-600'
                }`}
                onClick={() => handleFolderSelect(shareLink.id)}
                disabled={isCurrentlySyncing}
              >
                {isSelected ? 'Ausgewählt' : 'Auswählen'}
              </button>
            </div>

            {isExpanded && (
              <motion.div
                className="border-t border-grey-200 dark:border-grey-700 px-sm py-sm"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="flex flex-wrap items-center gap-sm">
                  <button
                    className="text-xs px-sm py-xxs rounded-md bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50"
                    onClick={() => handleSyncFolder(shareLink.id)}
                    disabled={isCurrentlySyncing}
                  >
                    {isCurrentlySyncing ? (
                      <span className="flex items-center gap-xxs">
                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Synchronisiert...
                      </span>
                    ) : (
                      'Jetzt synchronisieren'
                    )}
                  </button>

                  {syncStatus && (
                    <label className="flex items-center gap-xxs text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={syncStatus.auto_sync_enabled || false}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          handleToggleAutoSync(shareLink.id, '', e.target.checked)
                        }
                        disabled={isCurrentlySyncing}
                      />
                      <span>Auto-Sync</span>
                    </label>
                  )}
                </div>

                {syncStatus && (
                  <div className="mt-sm flex flex-wrap gap-md text-xs text-grey-400">
                    <div>
                      <span className="font-medium">Letzte Sync:</span>{' '}
                      {formatLastSync(syncStatus.last_sync_at)}
                    </div>
                    {syncStatus.files_processed > 0 && (
                      <div>
                        <span className="font-medium">Dateien:</span> {syncStatus.files_processed}{' '}
                        verarbeitet
                        {syncStatus.files_failed > 0 &&
                          `, ${syncStatus.files_failed} fehlgeschlagen`}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
};

export default WolkeFolderBrowser;
