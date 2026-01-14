import React, { useState, useEffect, useMemo } from 'react';
import { HiOutlineCloud, HiOutlineDocument, HiSearch, HiX, HiCheck } from 'react-icons/hi';
import { useWolkeStore } from '../../../stores/wolkeStore';
import type { ShareLink, WolkeFileItem } from '../../../stores/wolkeStore';
import Spinner from '../Spinner';

import './WolkeFilePicker.css';

interface EnrichedWolkeFile extends WolkeFileItem {
  fileExtension: string;
  isSupported: boolean;
  sizeFormatted: string;
  lastModifiedFormatted?: string;
}

interface SelectedFile extends EnrichedWolkeFile {
  shareLinkId: string;
}

interface WolkeFilePickerProps {
  onFilesSelected: (files: SelectedFile[]) => void;
  onCancel: () => void;
  selectedFiles?: EnrichedWolkeFile[];
  inline?: boolean;
}

/**
 * WolkeFilePicker - Component for selecting files from Wolke folders
 * Used in DocumentUpload when users want to import documents from their Wolke shares
 */
const WolkeFilePicker: React.FC<WolkeFilePickerProps> = ({
    onFilesSelected,
    onCancel,
    selectedFiles = [],
    inline = false
}) => {
    const {
        shareLinks,
        fetchShareLinks,
        isLoading: shareLinksLoading,
        error: shareLinksError,
        getCachedFiles,
        areFilesCached,
        preloadFiles
    } = useWolkeStore();

    const [selectedShareLink, setSelectedShareLink] = useState<ShareLink | null>(null);
    const [files, setFiles] = useState<EnrichedWolkeFile[]>([]);
    const [filesLoading, setFilesLoading] = useState(false);
    const [filesError, setFilesError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());

    // Derive the active share link - auto-select if only one exists
    const activeShareLink = selectedShareLink ||
        (shareLinks.length === 1 && !shareLinksLoading ? shareLinks[0] : null);

    // Determine what to show
    const showFolderSelection = !activeShareLink && shareLinks.length > 1 && !shareLinksLoading;

    // Back button logic for modal mode only
    const backButtonLabel = shareLinks.length === 1 ? '← Schließen' : '← Zurück';
    const backButtonHandler = () => {
        if (shareLinks.length === 1) {
            onCancel();
        } else {
            setSelectedShareLink(null);
            setFiles([]);
            setSelectedFileIds(new Set());
            setSearchTerm('');
        }
    };

    // Load share links on component mount
    useEffect(() => {
        if (shareLinks.length === 0 && !shareLinksLoading) {
            fetchShareLinks();
        }
    }, [shareLinks.length, shareLinksLoading, fetchShareLinks]);

    // Immediately show cached files if available
    useEffect(() => {
        if (activeShareLink) {
            const cachedData = getCachedFiles(activeShareLink.id);
            if (cachedData.isCached && cachedData.files.length > 0) {
                console.log(`[WolkeFilePicker] Immediately showing cached files for ${activeShareLink.id}`);
                setFiles(cachedData.files as EnrichedWolkeFile[]);
                setFilesLoading(cachedData.loading);
            }
        }
    }, [activeShareLink, getCachedFiles]);

    // Load files when there's an active share link
    useEffect(() => {
        if (activeShareLink) {
            loadFiles(activeShareLink.id);
        }
    }, [activeShareLink]);

    // Initialize selected files from props
    useEffect(() => {
        if (selectedFiles.length > 0) {
            const fileIds = new Set(selectedFiles.map(f => f.path));
            setSelectedFileIds(fileIds);
        }
    }, [selectedFiles]);

    const loadFiles = async (shareLinkId: string): Promise<void> => {
        try {
            setFilesError(null);

            // First, check if we have fresh cached data
            const cachedData = getCachedFiles(shareLinkId);
            if (cachedData.isCached && cachedData.files.length > 0) {
                console.log(`[WolkeFilePicker] Using cached files for ${shareLinkId}:`, cachedData.files.length);
                setFiles(cachedData.files as EnrichedWolkeFile[]);
                setFilesLoading(cachedData.loading);

                // If cache is fresh (less than 3 minutes), use it without refetching
                const FRESH_CACHE_DURATION = 3 * 60 * 1000; // 3 minutes
                if (areFilesCached(shareLinkId, FRESH_CACHE_DURATION)) {
                    console.log(`[WolkeFilePicker] Cache is fresh for ${shareLinkId}, not refetching`);
                    return;
                }
            }

            // If no cache or cache is stale, set loading state
            if (!cachedData.isCached || cachedData.files.length === 0) {
                setFilesLoading(true);
                setFiles([]);
            }

            // Use preloadFiles method which handles caching and deduplication
            const loadedFiles = await preloadFiles(shareLinkId);
            setFiles(loadedFiles as EnrichedWolkeFile[]);

        } catch (error) {
            console.error('[WolkeFilePicker] Error loading files:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to load files';
            setFilesError(errorMessage);
        } finally {
            setFilesLoading(false);
        }
    };

    // Filter files based on search term
    const filteredFiles = useMemo(() => {
        if (!searchTerm.trim()) return files;

        const term = searchTerm.toLowerCase();
        return files.filter(file =>
            file.name.toLowerCase().includes(term) ||
            file.fileExtension.toLowerCase().includes(term)
        );
    }, [files, searchTerm]);

    // Only show supported files
    const supportedFiles = useMemo(() => {
        return filteredFiles.filter(file => file.isSupported);
    }, [filteredFiles]);

    const handleFileToggle = (file: EnrichedWolkeFile): void => {
        const newSelected = new Set(selectedFileIds);

        if (newSelected.has(file.path)) {
            newSelected.delete(file.path);
        } else {
            newSelected.add(file.path);
        }

        setSelectedFileIds(newSelected);

        // Immediately propagate selection changes to parent
        const selectedFileObjects: SelectedFile[] = files.filter(f =>
            f.path !== file.path ? newSelected.has(f.path) : newSelected.has(file.path)
        ).map(f => ({
            ...f,
            shareLinkId: activeShareLink!.id
        }));
        onFilesSelected(selectedFileObjects);
    };

    const handleSelectAll = (): void => {
        let newSelected: Set<string>;
        let selectedFileObjects: SelectedFile[];

        if (selectedFileIds.size === supportedFiles.length) {
            // Deselect all
            newSelected = new Set();
            selectedFileObjects = [];
        } else {
            // Select all supported files
            newSelected = new Set(supportedFiles.map(f => f.path));
            selectedFileObjects = supportedFiles.map(f => ({
                ...f,
                shareLinkId: activeShareLink!.id
            }));
        }

        setSelectedFileIds(newSelected);

        // Immediately propagate selection changes to parent
        onFilesSelected(selectedFileObjects);
    };

    const getFileIcon = (file: EnrichedWolkeFile): string => {
        const ext = file.fileExtension.toLowerCase();
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
            const date = new Date(dateString);
            return date.toLocaleDateString('de-DE');
        } catch {
            return 'Unbekannt';
        }
    };

    if (shareLinksLoading) {
        return (
            <div className="wolke-file-picker-overlay" onClick={(e: React.MouseEvent) => {
                if (e.target === e.currentTarget) onCancel();
            }}>
                <div className="wolke-file-picker" onClick={e => e.stopPropagation()}>
                    <div className="picker-header">
                        <h3>Aus Wolke wählen</h3>
                        <button onClick={onCancel} className="close-button">
                            <HiX />
                        </button>
                    </div>
                    <div className="picker-loading">
                        <Spinner size="medium" />
                        <p>Lade Wolke-Verbindungen...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (shareLinksError) {
        return (
            <div className="wolke-file-picker-overlay" onClick={(e: React.MouseEvent) => {
                if (e.target === e.currentTarget) onCancel();
            }}>
                <div className="wolke-file-picker" onClick={e => e.stopPropagation()}>
                    <div className="picker-header">
                        <h3>Aus Wolke wählen</h3>
                        <button onClick={onCancel} className="close-button">
                            <HiX />
                        </button>
                    </div>
                    <div className="picker-error">
                        <p>Fehler beim Laden der Wolke-Verbindungen: {shareLinksError}</p>
                        <button className="btn-primary size-s" onClick={() => fetchShareLinks()}>Erneut versuchen</button>
                    </div>
                </div>
            </div>
        );
    }

    if (shareLinks.length === 0) {
        return (
            <div className="wolke-file-picker-overlay" onClick={(e: React.MouseEvent) => {
                if (e.target === e.currentTarget) onCancel();
            }}>
                <div className="wolke-file-picker" onClick={e => e.stopPropagation()}>
                    <div className="picker-header">
                        <h3>Aus Wolke wählen</h3>
                        <button onClick={onCancel} className="close-button">
                            <HiX />
                        </button>
                    </div>
                    <div className="picker-empty">
                        <HiOutlineCloud size={48} />
                        <h4>Keine Wolke-Verbindungen gefunden</h4>
                        <p>Richten Sie zuerst Ihre Wolke-Verbindungen in den Profileinstellungen ein.</p>
                    </div>
                </div>
            </div>
        );
    }

    // Render inline or modal based on prop
    const renderContent = () => (
        <>
            {!inline && (
                <div className="picker-header">
                    <h3>Aus Wolke wählen</h3>
                    <button onClick={onCancel} className="close-button">
                        <HiX />
                    </button>
                </div>
            )}

            {/* Share Link Selection */}
            {showFolderSelection && (
                <div className="share-link-selection">
                    <h4>Wolke-Ordner auswählen</h4>
                    <div className="share-links-grid">
                        {shareLinks.map(shareLink => (
                            <button
                                key={shareLink.id}
                                className="share-link-card"
                                onClick={() => setSelectedShareLink(shareLink)}
                            >
                                <HiOutlineCloud size={24} />
                                <div className="share-link-info">
                                    <span className="share-link-label">
                                        {shareLink.label || 'Unbenannter Ordner'}
                                    </span>
                                    <span className="share-link-url">
                                        {shareLink.base_url || (shareLink.share_link ? new URL(shareLink.share_link).hostname : 'Wolke')}
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* File Browser */}
            {activeShareLink && (
                <div className="file-browser">
                    {/* Compact Toolbar */}
                    <div className="compact-toolbar">
                        {!inline && (
                            <button
                                className="btn-primary size-s"
                                onClick={backButtonHandler}
                                title={shareLinks.length === 1 ? 'Picker schließen' : 'Zur Ordnerauswahl'}
                            >
                                {backButtonLabel}
                            </button>
                        )}

                        {shareLinks.length > 1 && !inline && (
                            <div className="toolbar-folder">
                                <HiOutlineCloud size={16} />
                                <span>{activeShareLink.label || 'Ordner'}</span>
                            </div>
                        )}

                        <div className="toolbar-search">
                            <HiSearch size={16} />
                            <input
                                type="text"
                                placeholder="Dateien durchsuchen..."
                                value={searchTerm}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        {supportedFiles.length > 0 && (
                            <div className="toolbar-selection">
                                <button
                                    className="select-all-compact"
                                    onClick={handleSelectAll}
                                    title={selectedFileIds.size === supportedFiles.length ? 'Alle abwählen' : 'Alle auswählen'}
                                >
                                    <HiCheck size={14} />
                                </button>
                                <span className="selection-count-compact">
                                    {selectedFileIds.size}/{supportedFiles.length}
                                </span>
                            </div>
                        )}
                    </div>

                    {filesLoading && (
                        <div className="files-loading">
                            <Spinner size="medium" />
                            <p>Lade Dateien...</p>
                        </div>
                    )}

                    {filesError && (
                        <div className="files-error">
                            <p>Fehler beim Laden der Dateien: {filesError}</p>
                            <button className="btn-primary size-s" onClick={() => loadFiles(activeShareLink.id)}>
                                Erneut versuchen
                            </button>
                        </div>
                    )}

                    {!filesLoading && !filesError && files.length > 0 && (
                        <>

                            {/* Files Grid */}
                            {supportedFiles.length > 0 ? (
                                <div className="files-grid">
                                    {supportedFiles.map(file => (
                                        <div
                                            key={file.path}
                                            className={`wolke-file-card ${selectedFileIds.has(file.path) ? 'selected' : ''}`}
                                            onClick={() => handleFileToggle(file)}
                                        >
                                            <div className="wolke-file-card-checkbox">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedFileIds.has(file.path)}
                                                    onChange={() => handleFileToggle(file)}
                                                />
                                            </div>

                                            <div className="wolke-file-card-icon">
                                                {getFileIcon(file)}
                                            </div>

                                            <div className="wolke-file-card-content">
                                                <div className="wolke-file-card-name">{file.name}</div>
                                                <div className="wolke-file-card-meta">
                                                    <span className="wolke-file-card-size">{file.sizeFormatted}</span>
                                                    <span className="wolke-file-card-modified">
                                                        {formatLastModified(file.lastModified ?? '')}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="no-supported-files">
                                    <HiOutlineDocument size={48} />
                                    <p>Keine unterstützten Dateien gefunden</p>
                                    {filteredFiles.length !== files.length && (
                                        <p>Versuchen Sie einen anderen Suchbegriff</p>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {!filesLoading && !filesError && files.length === 0 && (
                        <div className="no-files">
                            <HiOutlineDocument size={48} />
                            <p>Keine Dateien in diesem Ordner gefunden</p>
                        </div>
                    )}

                </div>
            )}
        </>
    );

    if (inline) {
        return (
            <div className="wolke-file-picker-inline">
                {renderContent()}
            </div>
        );
    }

    return (
        <div className="wolke-file-picker-overlay" onClick={(e: React.MouseEvent) => {
            if (e.target === e.currentTarget) onCancel();
        }}>
            <div className="wolke-file-picker" onClick={e => e.stopPropagation()}>
                {renderContent()}
            </div>
        </div>
    );
};

export default WolkeFilePicker;
