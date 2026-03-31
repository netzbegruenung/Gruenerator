import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  HiDocumentText,
  HiCheckCircle,
  HiClock,
  HiExclamationCircle,
  HiX,
  HiSearch,
  HiDocumentDuplicate,
  HiUpload,
} from 'react-icons/hi';

import Spinner from '../../../components/common/Spinner';
import { ProfileIconButton } from '../../../components/profile/actions/ProfileActionButton';
import { useAuthStore } from '../../../stores/authStore';
import { useDocumentsStore, type Document } from '../../../stores/documentsStore';

import { cn } from '@/utils/cn';

const chipToggleClasses =
  'bg-transparent border border-dashed border-primary-600 text-primary-600 py-0.5 px-sm rounded-2xl text-xs font-medium cursor-pointer transition-colors duration-200 hover:bg-primary-600/10';

interface DocumentSelectorProps {
  selectedDocuments?: Document[];
  onDocumentsChange: (documents: Document[]) => void;
  compact?: boolean;
  onRemoveDocument?: ((id: string, title: string) => void) | null;
  disabled?: boolean;
}

const statusIconColorMap: Record<string, string> = {
  success: 'text-[var(--success-color)]',
  warning: 'text-[var(--warning-color)]',
  error: 'text-[var(--error-color)]',
  muted: 'text-grey-400',
};

const DocumentSelector: React.FC<DocumentSelectorProps> = memo(
  ({
    selectedDocuments = [],
    onDocumentsChange,
    compact = false,
    onRemoveDocument = null,
    disabled = false,
  }) => {
    const user = useAuthStore((s) => s.user);
    const { documents, isLoading, error, fetchDocuments, clearError } = useDocumentsStore();

    const [searchQuery, setSearchQuery] = useState('');
    const [showAllChips, setShowAllChips] = useState(false);

    useEffect(() => {
      if (user) {
        void fetchDocuments();
      }
    }, [user, fetchDocuments]);

    const availableDocuments = useMemo(
      () => documents.filter((doc) => doc.status === 'completed'),
      [documents]
    );

    const filteredDocuments = useMemo(() => {
      if (!searchQuery.trim()) return availableDocuments;
      const query = searchQuery.toLowerCase();
      return availableDocuments.filter(
        (doc) =>
          doc.title?.toLowerCase().includes(query) || doc.filename?.toLowerCase().includes(query)
      );
    }, [availableDocuments, searchQuery]);

    const selectedDocumentIds = useMemo(
      () => selectedDocuments.map((doc) => doc.id),
      [selectedDocuments]
    );

    const handleDocumentToggle = useCallback(
      (document: Document) => {
        if (disabled) return;

        const isSelected = selectedDocumentIds.includes(document.id);

        if (isSelected) {
          if (compact && onRemoveDocument) {
            onRemoveDocument(document.id, document.title);
          } else {
            const newSelected = selectedDocuments.filter((doc) => doc.id !== document.id);
            onDocumentsChange(newSelected);
          }
        } else {
          const newSelected = [...selectedDocuments, document];
          onDocumentsChange(newSelected);
        }
      },
      [
        disabled,
        selectedDocumentIds,
        compact,
        onRemoveDocument,
        selectedDocuments,
        onDocumentsChange,
      ]
    );

    const handleRemoveFromChip = useCallback(
      (e: React.MouseEvent, document: Document) => {
        e.stopPropagation();
        if (disabled) return;

        if (compact && onRemoveDocument) {
          onRemoveDocument(document.id, document.title);
        } else {
          const newSelected = selectedDocuments.filter((doc) => doc.id !== document.id);
          onDocumentsChange(newSelected);
        }
      },
      [disabled, compact, onRemoveDocument, selectedDocuments, onDocumentsChange]
    );

    const getFileExtension = useCallback((filename: string) => {
      const ext = filename?.split('.').pop()?.toUpperCase() || 'DOC';
      return ext.length > 4 ? 'DOC' : ext;
    }, []);

    const getStatusInfo = useCallback((status: string) => {
      switch (status) {
        case 'completed':
          return { icon: HiCheckCircle, color: 'success', label: 'Bereit' };
        case 'processing':
        case 'pending':
          return { icon: HiClock, color: 'warning', label: 'Verarbeitung' };
        case 'failed':
          return { icon: HiExclamationCircle, color: 'error', label: 'Fehler' };
        default:
          return { icon: HiDocumentText, color: 'muted', label: 'Unbekannt' };
      }
    }, []);

    const visibleChips = showAllChips ? selectedDocuments : selectedDocuments.slice(0, 3);
    const hiddenChipsCount = selectedDocuments.length - 3;

    if (isLoading) {
      return (
        <div className="w-full my-md flex items-center justify-center gap-sm p-xl text-grey-400 bg-background-alt rounded-lg">
          <Spinner size="small" />
          <span>Dokumente laden...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="w-full my-md flex items-center gap-sm p-md bg-[rgba(220,38,38,0.1)] border border-[var(--error-color)] rounded-lg text-[var(--error-color)]">
          <HiExclamationCircle className="text-xl shrink-0" />
          <span>{error}</span>
          <button
            onClick={clearError}
            className="ml-auto bg-transparent border-none text-[var(--error-color)] cursor-pointer p-xs rounded-sm transition-colors duration-200 hover:bg-[rgba(220,38,38,0.15)]"
            aria-label="Fehler schließen"
          >
            <HiX />
          </button>
        </div>
      );
    }

    if (compact) {
      return (
        <div className="w-full my-md bg-transparent">
          {selectedDocuments.length > 0 ? (
            <div className="flex flex-col gap-xs">
              {selectedDocuments.map((document) => (
                <div
                  key={document.id}
                  className="flex items-center gap-sm p-sm bg-background-alt border border-grey-200 dark:border-grey-700 rounded-lg"
                >
                  <HiDocumentText className="text-primary-600 text-lg shrink-0" />
                  <span className="flex-1 text-sm text-foreground whitespace-nowrap overflow-hidden text-ellipsis">
                    {document.title || document.filename}
                  </span>
                  {onRemoveDocument && !disabled && (
                    <ProfileIconButton
                      action="delete"
                      variant="delete"
                      onClick={() => onRemoveDocument(document.id, document.title)}
                      title="Dokument entfernen"
                      ariaLabel={`Dokument ${document.title} entfernen`}
                      size="s"
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-grey-400 text-sm italic m-0 p-sm">
              Keine Dokumente zugewiesen. Dokumente können über die Bearbeitungsfunktion hinzugefügt
              werden.
            </p>
          )}
        </div>
      );
    }

    return (
      <div className="w-full my-md bg-background border border-grey-200 dark:border-grey-700 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between gap-md p-md px-lg bg-background-alt border-b border-grey-200 dark:border-grey-700 max-md:flex-col max-md:items-stretch max-md:gap-sm max-md:px-md">
          <div className="flex items-center gap-sm font-semibold text-lg text-foreground max-md:justify-center">
            <HiDocumentDuplicate className="text-xl text-primary-600" />
            <span>Dokumente auswählen</span>
            {selectedDocuments.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-xs bg-primary-600 text-white text-xs font-semibold rounded-full">
                {selectedDocuments.length}
              </span>
            )}
          </div>

          {availableDocuments.length > 3 && (
            <div className="relative flex items-center flex-[0_1_280px] max-md:flex-[1_1_100%]">
              <HiSearch className="absolute left-sm text-grey-400 text-base pointer-events-none" />
              <input
                type="text"
                placeholder="Dokumente suchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full py-xs px-md pl-[calc(var(--spacing-sm)+1.5rem)] pr-[calc(var(--spacing-sm)+1.5rem)] border border-grey-200 dark:border-grey-700 rounded-full bg-background text-foreground text-sm transition-all duration-200 focus:outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-600/10 placeholder:text-grey-400"
                disabled={disabled}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-xs bg-transparent border-none text-grey-400 cursor-pointer p-0.5 rounded-full flex items-center justify-center transition-colors duration-200 hover:text-foreground hover:bg-background-alt"
                  aria-label="Suche löschen"
                >
                  <HiX />
                </button>
              )}
            </div>
          )}
        </div>

        {selectedDocuments.length > 0 && (
          <div className="flex items-center gap-sm p-sm px-lg bg-primary-600/5 border-b border-grey-200 dark:border-grey-700 flex-wrap max-md:px-md">
            <span className="text-grey-400 text-[0.85rem] font-medium">Ausgewählt:</span>
            <div className="flex items-center gap-xs flex-wrap">
              {visibleChips.map((document) => (
                <div
                  key={document.id}
                  className="inline-flex items-center gap-0.5 py-0.5 px-sm bg-primary-600 text-white rounded-2xl text-xs font-medium max-w-[180px] max-[480px]:max-w-[140px]"
                >
                  <HiDocumentText className="text-sm shrink-0" />
                  <span className="whitespace-nowrap overflow-hidden text-ellipsis">
                    {document.title || document.filename}
                  </span>
                  {!disabled && (
                    <button
                      onClick={(e) => handleRemoveFromChip(e, document)}
                      className="bg-transparent border-none text-white/70 cursor-pointer p-0.5 rounded-full flex items-center justify-center transition-colors duration-200 shrink-0 hover:text-white hover:bg-white/20"
                      aria-label={`${document.title} entfernen`}
                    >
                      <HiX />
                    </button>
                  )}
                </div>
              ))}
              {hiddenChipsCount > 0 && !showAllChips && (
                <button className={chipToggleClasses} onClick={() => setShowAllChips(true)}>
                  +{hiddenChipsCount} weitere
                </button>
              )}
              {showAllChips && selectedDocuments.length > 3 && (
                <button className={chipToggleClasses} onClick={() => setShowAllChips(false)}>
                  weniger
                </button>
              )}
            </div>
          </div>
        )}

        {availableDocuments.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-md p-lg max-md:grid-cols-[repeat(auto-fill,minmax(140px,1fr))] max-md:gap-sm max-md:p-md max-[480px]:grid-cols-2 min-[1280px]:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] min-[1920px]:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
            {filteredDocuments.length > 0 ? (
              filteredDocuments.map((document) => {
                const isSelected = selectedDocumentIds.includes(document.id);
                const statusInfo = getStatusInfo(document.status);
                const StatusIcon = statusInfo.icon;
                const fileExt = getFileExtension(document.filename || '');

                return (
                  <button
                    key={document.id}
                    type="button"
                    className={cn(
                      'relative flex flex-col items-center p-md pt-lg bg-background border-2 border-grey-200 dark:border-grey-700 rounded-xl cursor-pointer transition-all duration-200 text-center min-h-[180px] max-md:min-h-[160px] max-md:p-sm max-md:pt-md',
                      'focus:outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-600/15',
                      !disabled &&
                        'hover:border-primary-400 hover:translate-y-[-2px] hover:shadow-md',
                      isSelected && 'border-primary-600 bg-primary-600/5',
                      disabled && 'opacity-60 cursor-not-allowed'
                    )}
                    onClick={() => handleDocumentToggle(document)}
                    disabled={disabled}
                    aria-pressed={isSelected}
                    aria-label={`${document.title} ${isSelected ? 'ausgewählt' : 'auswählen'}`}
                  >
                    <div
                      className={cn(
                        'absolute top-sm right-sm text-primary-600 text-2xl opacity-0 scale-50 transition-all duration-200',
                        isSelected && 'opacity-100 scale-100'
                      )}
                    >
                      <HiCheckCircle />
                    </div>

                    <div className="absolute top-sm left-sm py-0.5 px-1.5 bg-secondary-100/50 text-secondary-700 text-[0.65rem] font-bold tracking-wide rounded uppercase">
                      {fileExt}
                    </div>

                    <div
                      className={cn(
                        'flex items-center justify-center w-14 h-14 mb-sm rounded-xl text-primary-600 text-3xl transition-colors duration-200 max-md:w-12 max-md:h-12 max-md:text-2xl',
                        isSelected ? 'bg-primary-600/20' : 'bg-primary-600/10'
                      )}
                    >
                      <HiDocumentText />
                    </div>

                    <div className="flex-1 flex flex-col items-center w-full min-w-0">
                      <h4 className="text-sm font-semibold text-foreground m-0 mb-xs leading-tight line-clamp-2 break-words max-md:text-xs">
                        {document.title || document.filename}
                      </h4>
                      <div className="flex items-center gap-xs mb-0.5">
                        <span className="text-xs text-grey-400">{document.page_count} Seiten</span>
                        <span>
                          <StatusIcon
                            className={cn('text-sm', statusIconColorMap[statusInfo.color])}
                          />
                        </span>
                      </div>
                      <span className="text-[0.7rem] text-grey-400 whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
                        {document.filename}
                      </span>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="col-span-full flex flex-col items-center justify-center p-xl text-center">
                <HiSearch className="text-3xl text-grey-400 mb-sm" />
                <p className="text-grey-400 m-0 mb-md">
                  Keine Dokumente gefunden für &bdquo;{searchQuery}&ldquo;
                </p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="px-3 py-1.5 text-sm bg-transparent border border-grey-200 dark:border-grey-700 text-foreground rounded-lg cursor-pointer hover:bg-background-alt transition-colors duration-200"
                >
                  Suche zurücksetzen
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-2xl px-lg text-center max-md:p-xl max-md:px-md">
            <div className="flex items-center justify-center w-20 h-20 mb-lg bg-primary-600/10 rounded-full">
              <HiUpload className="text-[2.5rem] text-primary-600" />
            </div>
            <h4 className="m-0 mb-sm text-lg font-semibold text-foreground">
              Noch keine Dokumente vorhanden
            </h4>
            <p className="m-0 mb-lg text-grey-400 text-[0.95rem] max-w-[360px] leading-relaxed">
              Laden Sie PDF-Dokumente in Ihrem Profil hoch, um sie als Wissensquelle für Ihre
              Grüneratoren zu nutzen.
            </p>
            <a
              href="/profil?tab=content"
              className="inline-block px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors duration-200 no-underline"
            >
              Dokumente hochladen
            </a>
          </div>
        )}

        {availableDocuments.length > 0 && (
          <div className="flex items-start gap-sm p-md px-lg bg-background-alt border-t border-grey-200 dark:border-grey-700 max-md:px-md">
            <span className="text-base shrink-0">💡</span>
            <p className="m-0 text-grey-400 text-[0.85rem] leading-snug">
              Ausgewählte Dokumente werden als Wissensquelle verwendet. Claude kann während der
              Texterstellung auf diese Inhalte zugreifen und sie zitieren.
            </p>
          </div>
        )}
      </div>
    );
  }
);

DocumentSelector.displayName = 'DocumentSelector';

export default DocumentSelector;
