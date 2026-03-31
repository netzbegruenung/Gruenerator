import { useDocsAdapter } from '@gruenerator/docs';
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@gruenerator/ui';
import {
  type WolkeFileItem,
  getFileIcon,
  sortFoldersFirst,
  useShareLinks,
  useWolkeBrowse,
} from '@gruenerator/wolke';
import { useCallback, useRef, useState } from 'react';
import { FiAlertCircle, FiArrowLeft, FiChevronRight, FiFile, FiFolder } from 'react-icons/fi';

interface WolkeImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const IMPORTABLE_EXTENSIONS = new Set(['.pdf', '.docx', '.doc', '.odt', '.pptx']);

export default function WolkeImportModal({ open, onOpenChange }: WolkeImportModalProps) {
  const adapter = useDocsAdapter();
  const { data: shareLinks = [], isLoading: isLoadingLinks } = useShareLinks(undefined, undefined, {
    enabled: open,
  });

  const [selectedShareLinkId, setSelectedShareLinkId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeShareLinks = shareLinks.filter((l) => l.is_active);
  const selectedShareLink = activeShareLinks.find((l) => l.id === selectedShareLinkId);

  const handleFileSelect = useCallback(
    async (file: WolkeFileItem) => {
      if (!selectedShareLinkId) return;
      setIsImporting(true);
      setError(null);

      try {
        const response = await adapter.fetch(`${adapter.getApiBaseUrl()}/docs/from-wolke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shareLinkId: selectedShareLinkId,
            filePath: file.path,
            fileName: file.name,
          }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: 'Import fehlgeschlagen' }));
          throw new Error(err.error || `HTTP ${response.status}`);
        }

        const { documentId } = (await response.json()) as { documentId: string };
        onOpenChange(false);
        adapter.navigateToDocument(documentId);
      } catch (err) {
        setError((err as Error).message);
        setIsImporting(false);
      }
    },
    [adapter, selectedShareLinkId, onOpenChange]
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setSelectedShareLinkId(null);
        setError(null);
      }
      onOpenChange(next);
    },
    [onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={isImporting ? undefined : handleOpenChange}>
      <DialogContent className="sm:max-w-[36rem] bg-background-pure">
        <DialogHeader>
          <DialogTitle>Aus Wolke importieren</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 rounded-md px-3 py-2 text-sm bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400">
            <FiAlertCircle className="shrink-0" />
            {error}
          </div>
        )}

        <div className="flex flex-col gap-4">
          {isLoadingLinks ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-grey-300 border-t-primary-600" />
              <span className="ml-2 text-sm text-grey-500">Wolke-Verbindungen werden geladen…</span>
            </div>
          ) : activeShareLinks.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <span className="text-sm text-grey-500">Keine Wolke-Verbindungen vorhanden.</span>
              <span className="text-xs text-grey-400">
                Richte eine Verbindung in den Einstellungen ein.
              </span>
            </div>
          ) : !selectedShareLinkId ? (
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
                <button
                  type="button"
                  onClick={() => {
                    setSelectedShareLinkId(null);
                    setError(null);
                  }}
                  className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400"
                >
                  Andere Verbindung
                </button>
              </div>

              <div className="max-h-[360px] overflow-y-auto rounded-lg border border-grey-200 p-2 dark:border-grey-700">
                <WolkeFileBrowser
                  shareLinkId={selectedShareLinkId}
                  onFileSelect={handleFileSelect}
                  disabled={isImporting}
                />
              </div>

              {isImporting && (
                <p className="text-center text-xs text-grey-400">
                  Die Datei wird per OCR verarbeitet — das kann einige Sekunden dauern…
                </p>
              )}
            </div>
          )}
        </div>

        {selectedShareLinkId && (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isImporting}
            >
              Abbrechen
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function WolkeFileBrowser({
  shareLinkId,
  onFileSelect,
  disabled,
}: {
  shareLinkId: string;
  onFileSelect: (file: WolkeFileItem) => void;
  disabled: boolean;
}) {
  const [currentPath, setCurrentPath] = useState('');
  const { data: items, isLoading, isError, isFetching } = useWolkeBrowse(shareLinkId, currentPath);

  const pathSegments = currentPath ? currentPath.split('/').filter(Boolean) : [];

  const navigateTo = (path: string) => setCurrentPath(path);

  const navigateUp = () => {
    setCurrentPath(pathSegments.length <= 1 ? '' : pathSegments.slice(0, -1).join('/'));
  };

  const navigateToBreadcrumb = (index: number) => {
    setCurrentPath(index < 0 ? '' : pathSegments.slice(0, index + 1).join('/'));
  };

  const sorted = sortFoldersFirst(items ?? []);

  if (isLoading && !items) {
    return (
      <div className="flex flex-col gap-1 py-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded-lg bg-black/5 dark:bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <p className="text-sm text-grey-400 py-4">Ordnerinhalt konnte nicht geladen werden.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          {pathSegments.length > 0 ? (
            <div className="flex items-center gap-1 text-xs text-grey-400 flex-wrap min-w-0">
              <button
                type="button"
                onClick={() => navigateToBreadcrumb(-1)}
                className="hover:text-foreground transition-colors shrink-0"
              >
                Stammverzeichnis
              </button>
              {pathSegments.map((segment, i) => (
                <span key={i} className="flex items-center gap-1 min-w-0">
                  <FiChevronRight className="w-3 h-3 shrink-0" />
                  <button
                    type="button"
                    onClick={() => navigateToBreadcrumb(i)}
                    className={cn(
                      'hover:text-foreground transition-colors truncate max-w-[160px]',
                      i === pathSegments.length - 1 && 'text-foreground font-medium'
                    )}
                  >
                    {segment}
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-grey-400">Stammverzeichnis</span>
          )}
        </div>
        {isFetching && (
          <div className="w-3 h-3 rounded-full border-2 border-primary-500 border-t-transparent animate-spin shrink-0" />
        )}
      </div>

      {pathSegments.length > 0 && (
        <button
          type="button"
          onClick={navigateUp}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-grey-500 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        >
          <FiArrowLeft className="w-4 h-4" />
          Zurück
        </button>
      )}

      <div className="flex flex-col gap-0.5">
        {sorted.length === 0 && (
          <p className="text-sm text-grey-400 text-center py-6">Leerer Ordner</p>
        )}

        {sorted.map((item) => {
          const isDir = item.isDirectory;
          const relativePath = currentPath ? `${currentPath}/${item.name}` : item.name;
          const ext = '.' + item.name.split('.').pop()?.toLowerCase();
          const isImportable = !isDir && IMPORTABLE_EXTENSIONS.has(ext);
          const { Icon, color } = getFileIcon(item);

          if (isDir) {
            return (
              <button
                key={item.name}
                type="button"
                onClick={() => navigateTo(relativePath)}
                className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                <FiFolder className="w-4 h-4 text-primary-500 shrink-0" />
                <span className="truncate text-foreground">{item.name}</span>
              </button>
            );
          }

          return (
            <button
              key={item.name}
              type="button"
              onClick={
                isImportable && !disabled
                  ? () => onFileSelect({ ...item, path: relativePath })
                  : undefined
              }
              disabled={!isImportable || disabled}
              className={cn(
                'flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-left transition-colors',
                isImportable && !disabled
                  ? 'hover:bg-primary-50 dark:hover:bg-primary-900/20 cursor-pointer'
                  : 'opacity-40 cursor-not-allowed'
              )}
            >
              <Icon className={cn('w-4 h-4 shrink-0', color)} />
              <span className="truncate flex-1 text-foreground">{item.name}</span>
              {item.sizeFormatted && (
                <span className="text-xs text-grey-400 shrink-0">{item.sizeFormatted}</span>
              )}
              {isImportable && !disabled && (
                <span className="text-xs text-primary-600 dark:text-primary-400 shrink-0">
                  Importieren
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
