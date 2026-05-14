import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FeatureToggle,
} from '@gruenerator/ui';
import { useCallback, useState } from 'react';
import { FiAlertCircle, FiCheck, FiFolder, FiRefreshCw } from 'react-icons/fi';

import { uploadToWolke } from '../api/wolkeApiClient';
import { useShareLinks } from '../hooks/useWolke';

import WolkeFolderBrowser from './WolkeFolderBrowser';

interface WolkeSaveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (shareLinkId: string, folderPath: string | undefined, liveSync: boolean) => Promise<void>;
  initialLiveSync?: boolean;
}

export const WolkeSaveModal = ({
  open,
  onOpenChange,
  onSave,
  initialLiveSync = false,
}: WolkeSaveModalProps) => {
  const { data: shareLinks = [], isLoading: isLoadingLinks } = useShareLinks(undefined, undefined, {
    enabled: open,
  });
  const [selectedShareLinkId, setSelectedShareLinkId] = useState<string | null>(null);
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | undefined>(undefined);
  const [isUploading, setIsUploading] = useState(false);
  const [liveSync, setLiveSync] = useState(initialLiveSync);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const activeShareLinks = shareLinks.filter((l) => l.is_active);
  const effectiveShareLinkId =
    selectedShareLinkId ?? (activeShareLinks.length === 1 ? (activeShareLinks[0]?.id ?? null) : null);
  const selectedShareLink = activeShareLinks.find((l) => l.id === effectiveShareLinkId);
  const canSwitchShareLink = activeShareLinks.length > 1;

  const handleSave = useCallback(async () => {
    if (!effectiveShareLinkId) return;
    setIsUploading(true);
    setFeedback(null);
    try {
      await onSave(effectiveShareLinkId, selectedFolderPath, liveSync);
      setFeedback({
        type: 'success',
        message: liveSync
          ? 'Dokument gespeichert. Live-Synchronisierung aktiv.'
          : 'Dokument wurde in der Wolke gespeichert.',
      });
      setTimeout(() => {
        onOpenChange(false);
        setSelectedShareLinkId(null);
        setSelectedFolderPath(undefined);
        setFeedback(null);
        setLiveSync(initialLiveSync);
      }, 1200);
    } catch {
      setFeedback({ type: 'error', message: 'Speichern fehlgeschlagen. Bitte erneut versuchen.' });
    } finally {
      setIsUploading(false);
    }
  }, [effectiveShareLinkId, selectedFolderPath, liveSync, onSave, onOpenChange, initialLiveSync]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setSelectedShareLinkId(null);
        setSelectedFolderPath(undefined);
        setLiveSync(initialLiveSync);
        setFeedback(null);
      }
      onOpenChange(next);
    },
    [onOpenChange, initialLiveSync]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[32rem] bg-background-pure">
        <DialogHeader>
          <DialogTitle>In Wolke speichern</DialogTitle>
        </DialogHeader>

        {feedback && (
          <div
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
              feedback.type === 'success'
                ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
            }`}
          >
            {feedback.type === 'success' ? (
              <FiCheck className="shrink-0" />
            ) : (
              <FiAlertCircle className="shrink-0" />
            )}
            {feedback.message}
          </div>
        )}

        <div className="flex flex-col gap-4">
          {isLoadingLinks ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-grey-300 border-t-primary-600" />
              <span className="ml-2 text-sm text-grey-500">
                Wolke-Verbindungen werden geladen...
              </span>
            </div>
          ) : activeShareLinks.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <span className="text-sm text-grey-500">Keine Wolke-Verbindungen vorhanden.</span>
              <span className="text-xs text-grey-400">
                Richte eine Verbindung in den Einstellungen ein.
              </span>
            </div>
          ) : !effectiveShareLinkId ? (
            <div className="flex flex-col gap-1">
              <span className="text-sm text-grey-500">Wolke-Verbindung auswählen:</span>
              {activeShareLinks.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => setSelectedShareLinkId(link.id)}
                  className="flex items-center gap-2 rounded-lg border border-grey-200 px-3 py-2.5 text-left transition-colors hover:bg-grey-50 dark:border-grey-700 dark:hover:bg-grey-800"
                >
                  <FiFolder className="shrink-0 text-primary-600" />
                  <div>
                    <span className="text-sm font-medium text-foreground">
                      {link.label || 'Wolke-Verbindung'}
                    </span>
                    {link.base_url && (
                      <span className="block text-xs text-grey-500">{link.base_url}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  {selectedShareLink?.label || 'Wolke'}
                </span>
                {canSwitchShareLink && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedShareLinkId(null);
                      setSelectedFolderPath(undefined);
                    }}
                    className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400"
                  >
                    Andere Verbindung
                  </button>
                )}
              </div>

              <div className="max-h-[300px] overflow-y-auto rounded-lg border border-grey-200 p-2 dark:border-grey-700">
                <WolkeFolderBrowser
                  shareLinkId={effectiveShareLinkId}
                  shareLinkUrl={selectedShareLink?.share_link}
                  onFolderSelect={(path) => setSelectedFolderPath(path)}
                />
              </div>

              {selectedFolderPath && (
                <span className="text-xs text-grey-500">Ziel: /{selectedFolderPath}</span>
              )}
            </div>
          )}
        </div>

        {effectiveShareLinkId && (
          <>
            <FeatureToggle
              isActive={liveSync}
              onToggle={setLiveSync}
              icon={FiRefreshCw}
              label="Live mit Wolke synchronisieren"
              description="Änderungen werden beim Verlassen des Editors oder mit ⌘S/Strg+S erneut hochgeladen."
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Abbrechen
              </Button>
              <Button
                onClick={handleSave}
                disabled={isUploading}
                className="bg-primary-600 text-white hover:bg-primary-700"
              >
                {isUploading ? 'Speichert...' : 'Hier speichern'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default WolkeSaveModal;
