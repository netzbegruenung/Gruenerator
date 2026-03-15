import {
  useShareLinks,
  useWolkeFiles,
  type ShareLink,
  type WolkeFileItem,
} from '@gruenerator/wolke';
import React, { useState, useEffect, useMemo } from 'react';
import { HiOutlineCloud, HiOutlineDocument, HiSearch, HiX, HiCheck } from 'react-icons/hi';

import Spinner from '../Spinner';

interface SelectedFile extends WolkeFileItem {
  shareLinkId: string;
}

interface WolkeFilePickerProps {
  onFilesSelected: (files: SelectedFile[]) => void;
  onCancel: () => void;
  selectedFiles?: WolkeFileItem[];
  inline?: boolean;
}

const WolkeFilePicker: React.FC<WolkeFilePickerProps> = ({
  onFilesSelected,
  onCancel,
  selectedFiles = [],
  inline = false,
}) => {
  const {
    data: shareLinks = [],
    isLoading: shareLinksLoading,
    error: shareLinksError,
    refetch: refetchShareLinks,
  } = useShareLinks();

  const [selectedShareLink, setSelectedShareLink] = useState<ShareLink | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());

  const activeShareLink =
    selectedShareLink || (shareLinks.length === 1 && !shareLinksLoading ? shareLinks[0] : null);

  const {
    data: files = [],
    isLoading: filesLoading,
    error: filesError,
    refetch: refetchFiles,
  } = useWolkeFiles(activeShareLink?.id ?? null);

  const showFolderSelection = !activeShareLink && shareLinks.length > 1 && !shareLinksLoading;

  const backButtonLabel = shareLinks.length === 1 ? '← Schließen' : '← Zurück';
  const backButtonHandler = () => {
    if (shareLinks.length === 1) {
      onCancel();
    } else {
      setSelectedShareLink(null);
      setSelectedFileIds(new Set());
      setSearchTerm('');
    }
  };

  useEffect(() => {
    if (selectedFiles.length > 0) {
      const fileIds = new Set(selectedFiles.map((f) => f.path));
      setSelectedFileIds(fileIds);
    }
  }, [selectedFiles]);

  const filteredFiles = useMemo(() => {
    if (!searchTerm.trim()) return files;
    const term = searchTerm.toLowerCase();
    return files.filter(
      (file) =>
        file.name.toLowerCase().includes(term) || file.fileExtension?.toLowerCase().includes(term)
    );
  }, [files, searchTerm]);

  const supportedFiles = useMemo(() => {
    return filteredFiles.filter((file) => file.isSupported);
  }, [filteredFiles]);

  const handleFileToggle = (file: WolkeFileItem): void => {
    const newSelected = new Set(selectedFileIds);

    if (newSelected.has(file.path)) {
      newSelected.delete(file.path);
    } else {
      newSelected.add(file.path);
    }

    setSelectedFileIds(newSelected);

    const selectedFileObjects: SelectedFile[] = files
      .filter((f) => newSelected.has(f.path))
      .map((f) => ({
        ...f,
        shareLinkId: activeShareLink!.id,
      }));
    onFilesSelected(selectedFileObjects);
  };

  const handleSelectAll = (): void => {
    let newSelected: Set<string>;
    let selectedFileObjects: SelectedFile[];

    if (selectedFileIds.size === supportedFiles.length) {
      newSelected = new Set();
      selectedFileObjects = [];
    } else {
      newSelected = new Set(supportedFiles.map((f) => f.path));
      selectedFileObjects = supportedFiles.map((f) => ({
        ...f,
        shareLinkId: activeShareLink!.id,
      }));
    }

    setSelectedFileIds(newSelected);
    onFilesSelected(selectedFileObjects);
  };

  const getFileIcon = (file: WolkeFileItem): string => {
    const ext = file.fileExtension?.toLowerCase() ?? '';
    if (['.pdf'].includes(ext)) return '📄';
    if (['.docx', '.doc'].includes(ext)) return '📝';
    if (['.pptx', '.ppt'].includes(ext)) return '📊';
    if (['.png', '.jpg', '.jpeg', '.avif'].includes(ext)) return '🖼️';
    if (['.txt', '.md'].includes(ext)) return '📄';
    return '📁';
  };

  const formatLastModified = (dateString: string): string => {
    if (!dateString || dateString === 'Unknown') return 'Unbekannt';
    try {
      return new Date(dateString).toLocaleDateString('de-DE');
    } catch {
      return 'Unbekannt';
    }
  };

  if (shareLinksLoading) {
    return (
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]"
        onClick={(e: React.MouseEvent) => {
          if (e.target === e.currentTarget) onCancel();
        }}
      >
        <div
          className="bg-background rounded-lg shadow-xl max-w-[600px] w-full mx-md p-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-md">
            <h3 className="text-lg font-semibold m-0">Aus Wolke wählen</h3>
            <button
              onClick={onCancel}
              className="text-grey-400 hover:text-foreground"
              aria-label="Schließen"
            >
              <HiX size={20} />
            </button>
          </div>
          <div className="flex flex-col items-center gap-sm py-xl">
            <Spinner size="medium" />
            <p className="text-sm text-grey-400">Lade Wolke-Verbindungen...</p>
          </div>
        </div>
      </div>
    );
  }

  if (shareLinksError) {
    return (
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]"
        onClick={(e: React.MouseEvent) => {
          if (e.target === e.currentTarget) onCancel();
        }}
      >
        <div
          className="bg-background rounded-lg shadow-xl max-w-[600px] w-full mx-md p-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-md">
            <h3 className="text-lg font-semibold m-0">Aus Wolke wählen</h3>
            <button
              onClick={onCancel}
              className="text-grey-400 hover:text-foreground"
              aria-label="Schließen"
            >
              <HiX size={20} />
            </button>
          </div>
          <div className="flex flex-col items-center gap-sm py-md">
            <p className="text-sm text-red-500">Fehler beim Laden der Wolke-Verbindungen</p>
            <button
              className="text-sm text-primary-600 hover:underline"
              onClick={() => void refetchShareLinks()}
            >
              Erneut versuchen
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (shareLinks.length === 0) {
    return (
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]"
        onClick={(e: React.MouseEvent) => {
          if (e.target === e.currentTarget) onCancel();
        }}
      >
        <div
          className="bg-background rounded-lg shadow-xl max-w-[600px] w-full mx-md p-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-md">
            <h3 className="text-lg font-semibold m-0">Aus Wolke wählen</h3>
            <button
              onClick={onCancel}
              className="text-grey-400 hover:text-foreground"
              aria-label="Schließen"
            >
              <HiX size={20} />
            </button>
          </div>
          <div className="flex flex-col items-center gap-md py-lg text-grey-400">
            <HiOutlineCloud size={48} />
            <h4 className="text-base font-medium m-0">Keine Wolke-Verbindungen gefunden</h4>
            <p className="text-sm text-center">
              Richten Sie zuerst Ihre Wolke-Verbindungen in den Profileinstellungen ein.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const renderContent = () => (
    <>
      {!inline && (
        <div className="flex items-center justify-between mb-md">
          <h3 className="text-lg font-semibold m-0">Aus Wolke wählen</h3>
          <button
            onClick={onCancel}
            className="text-grey-400 hover:text-foreground"
            aria-label="Schließen"
          >
            <HiX size={20} />
          </button>
        </div>
      )}

      {showFolderSelection && (
        <div className="mb-md">
          <h4 className="text-sm font-medium mb-sm">Wolke-Ordner auswählen</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-xs">
            {shareLinks.map((shareLink) => (
              <button
                key={shareLink.id}
                className="flex items-center gap-sm p-sm rounded-md border border-grey-200 dark:border-grey-700 hover:border-primary-500 hover:bg-grey-50 dark:hover:bg-grey-800 transition-colors text-left"
                onClick={() => setSelectedShareLink(shareLink)}
              >
                <HiOutlineCloud size={24} className="text-primary-500 shrink-0" />
                <div className="min-w-0">
                  <span className="block text-sm font-medium truncate">
                    {shareLink.label || 'Unbenannter Ordner'}
                  </span>
                  <span className="block text-xs text-grey-400 truncate">
                    {shareLink.base_url ||
                      (shareLink.share_link ? new URL(shareLink.share_link).hostname : 'Wolke')}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {activeShareLink && (
        <div>
          <div className="flex items-center gap-xs flex-wrap mb-sm">
            {!inline && (
              <button
                className="text-xs text-primary-600 hover:underline shrink-0"
                onClick={backButtonHandler}
              >
                {backButtonLabel}
              </button>
            )}

            {shareLinks.length > 1 && !inline && (
              <div className="flex items-center gap-xxs text-xs text-grey-400">
                <HiOutlineCloud size={14} />
                <span>{activeShareLink.label || 'Ordner'}</span>
              </div>
            )}

            <div className="flex-1 min-w-[150px] relative">
              <HiSearch
                size={14}
                className="absolute left-xs top-1/2 -translate-y-1/2 text-grey-400"
              />
              <input
                type="text"
                placeholder="Dateien durchsuchen..."
                value={searchTerm}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                className="w-full pl-lg pr-sm py-xxs text-sm rounded-md border border-grey-200 dark:border-grey-700 bg-background focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>

            {supportedFiles.length > 0 && (
              <div className="flex items-center gap-xxs">
                <button
                  className="p-xxs rounded hover:bg-grey-100 dark:hover:bg-grey-800"
                  onClick={handleSelectAll}
                  title={
                    selectedFileIds.size === supportedFiles.length
                      ? 'Alle abwählen'
                      : 'Alle auswählen'
                  }
                >
                  <HiCheck size={14} />
                </button>
                <span className="text-xs text-grey-400">
                  {selectedFileIds.size}/{supportedFiles.length}
                </span>
              </div>
            )}
          </div>

          {filesLoading && (
            <div className="flex flex-col items-center gap-sm py-lg">
              <Spinner size="medium" />
              <p className="text-sm text-grey-400">Lade Dateien...</p>
            </div>
          )}

          {filesError && (
            <div className="flex flex-col items-center gap-sm py-md">
              <p className="text-sm text-red-500">Fehler beim Laden der Dateien</p>
              <button
                className="text-sm text-primary-600 hover:underline"
                onClick={() => void refetchFiles()}
              >
                Erneut versuchen
              </button>
            </div>
          )}

          {!filesLoading && !filesError && files.length > 0 && (
            <>
              {supportedFiles.length > 0 ? (
                <div className="flex flex-col gap-xxs max-h-[400px] overflow-y-auto">
                  {supportedFiles.map((file) => (
                    <div
                      key={file.path}
                      className={`flex items-center gap-sm p-xs rounded-md cursor-pointer transition-colors ${
                        selectedFileIds.has(file.path)
                          ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800'
                          : 'hover:bg-grey-50 dark:hover:bg-grey-800 border border-transparent'
                      }`}
                      onClick={() => handleFileToggle(file)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedFileIds.has(file.path)}
                        onChange={() => handleFileToggle(file)}
                        className="shrink-0"
                      />
                      <span className="text-base shrink-0">{getFileIcon(file)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{file.name}</div>
                        <div className="text-xs text-grey-400 flex gap-xs">
                          <span>{file.sizeFormatted}</span>
                          <span>{formatLastModified(file.lastModified ?? '')}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-sm py-lg text-grey-400">
                  <HiOutlineDocument size={48} />
                  <p className="text-sm">Keine unterstützten Dateien gefunden</p>
                  {filteredFiles.length !== files.length && (
                    <p className="text-xs">Versuchen Sie einen anderen Suchbegriff</p>
                  )}
                </div>
              )}
            </>
          )}

          {!filesLoading && !filesError && files.length === 0 && (
            <div className="flex flex-col items-center gap-sm py-lg text-grey-400">
              <HiOutlineDocument size={48} />
              <p className="text-sm">Keine Dateien in diesem Ordner gefunden</p>
            </div>
          )}
        </div>
      )}
    </>
  );

  if (inline) {
    return <div>{renderContent()}</div>;
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]"
      onClick={(e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="bg-background rounded-lg shadow-xl max-w-[600px] w-full mx-md p-lg max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {renderContent()}
      </div>
    </div>
  );
};

export default WolkeFilePicker;
