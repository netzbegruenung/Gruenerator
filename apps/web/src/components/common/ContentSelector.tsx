import React, { useState, useMemo, useRef } from 'react';
import {
  HiDocument,
  HiClipboardList,
  HiLightningBolt,
  HiUpload,
  HiX,
  HiCheck,
  HiFolder,
} from 'react-icons/hi';
import { useShallow } from 'zustand/react/shallow';

import { useAuth } from '../../hooks/useAuth';
import { useGeneratorSelectionStore } from '../../stores/core/generatorSelectionStore';

import AttachedFilesList from './AttachedFilesList';

import type { JSX, ChangeEvent } from 'react';
import '../../assets/styles/components/ui/ContentSelector.css';

export interface AttachedFile {
  name: string;
  size?: number;
  type?: string;
  [key: string]: unknown;
}

/**
 * ContentSelector - Simple file and text selector with popup
 */
interface ContentSelectorProps {
  disabled?: boolean;
  onAttachmentClick?: (files: File[]) => void;
  onRemoveFile?: (index: number) => void;
  attachedFiles?: AttachedFile[];
  onDropdownClose?: () => void;
}

const ContentSelector = ({
  disabled = false,
  onAttachmentClick,
  onRemoveFile,
  attachedFiles = [],
  onDropdownClose,
}: ContentSelectorProps): JSX.Element | null => {
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    availableTexts,
    selectedTextIds,
    toggleTextSelection,
    availableDocuments,
    selectedDocumentIds,
    toggleDocumentSelection,
    isLoadingTexts,
    isLoadingDocuments,
    uiConfig,
    useAutomaticSearch,
    toggleAutomaticSearch,
  } = useGeneratorSelectionStore(
    useShallow((state) => ({
      availableTexts: state.availableTexts,
      selectedTextIds: state.selectedTextIds,
      toggleTextSelection: state.toggleTextSelection,
      availableDocuments: state.availableDocuments,
      selectedDocumentIds: state.selectedDocumentIds,
      toggleDocumentSelection: state.toggleDocumentSelection,
      isLoadingTexts: state.isLoadingTexts,
      isLoadingDocuments: state.isLoadingDocuments,
      uiConfig: state.uiConfig,
      useAutomaticSearch: state.useAutomaticSearch,
      toggleAutomaticSearch: state.toggleAutomaticSearch,
    }))
  );

  const { user } = useAuth();
  const { enableDocuments = false, enableTexts = false } = uiConfig;

  const completedDocuments = useMemo(
    () => (enableDocuments ? availableDocuments.filter((doc) => doc.status === 'completed') : []),
    [enableDocuments, availableDocuments]
  );

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    if (files.length > 0 && onAttachmentClick) {
      onAttachmentClick(files);
    }
    event.target.value = '';
  };

  const handleAutoToggle = () => {
    toggleAutomaticSearch();
    setIsPopupOpen(false);
    if (onDropdownClose) onDropdownClose();
  };

  const isLoading = isLoadingTexts || isLoadingDocuments;
  const hasContent = completedDocuments.length > 0 || (enableTexts && availableTexts.length > 0);

  // Allow on localhost for debugging even without user
  const isLocalhost =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (!user && !isLocalhost) return null;

  return (
    <div className="content-selector">
      {/* Menu Items - rendered directly in parent dropdown */}
      {onAttachmentClick && (
        <button
          type="button"
          className="menu-dropdown-item"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
        >
          <HiUpload /> Hochladen
        </button>
      )}
      {hasContent && (
        <button
          type="button"
          className="menu-dropdown-item"
          onClick={() => setIsPopupOpen(true)}
          disabled={disabled || isLoading}
        >
          <HiFolder /> Auswählen
        </button>
      )}

      {/* Hidden file input */}
      {onAttachmentClick && (
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
      )}

      {/* Attached Files List */}
      {attachedFiles.length > 0 && (
        <AttachedFilesList files={attachedFiles} onRemoveFile={onRemoveFile} />
      )}

      {/* Selection Popup */}
      {isPopupOpen && (
        <div className="content-selector__popup-overlay" onClick={() => setIsPopupOpen(false)}>
          <div
            className="content-selector__popup"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <div className="content-selector__popup-header">
              <h3>Inhalte auswählen</h3>
              <button
                type="button"
                className="content-selector__popup-close"
                onClick={() => setIsPopupOpen(false)}
              >
                <HiX />
              </button>
            </div>

            <div className="content-selector__popup-body">
              {/* Auto Mode Option */}
              <div className="content-selector__popup-section">
                <button
                  type="button"
                  className={`content-selector__popup-item ${useAutomaticSearch ? 'content-selector__popup-item--selected' : ''}`}
                  onClick={handleAutoToggle}
                >
                  <HiLightningBolt className="content-selector__popup-icon content-selector__popup-icon--auto" />
                  <div className="content-selector__popup-item-content">
                    <span className="content-selector__popup-item-title">Automatische Suche</span>
                    <span className="content-selector__popup-item-desc">
                      KI wählt relevante Inhalte
                    </span>
                  </div>
                  {useAutomaticSearch && <HiCheck className="content-selector__popup-check" />}
                </button>
              </div>

              {/* Documents */}
              {completedDocuments.length > 0 && (
                <div className="content-selector__popup-section">
                  <div className="content-selector__popup-section-title">Dokumente</div>
                  {completedDocuments.map((doc) => (
                    <button
                      key={doc.id}
                      type="button"
                      className={`content-selector__popup-item ${selectedDocumentIds.includes(doc.id) ? 'content-selector__popup-item--selected' : ''}`}
                      onClick={() => toggleDocumentSelection(doc.id)}
                    >
                      <HiDocument className="content-selector__popup-icon" />
                      <div className="content-selector__popup-item-content">
                        <span className="content-selector__popup-item-title">{doc.title}</span>
                        {doc.filename && (
                          <span className="content-selector__popup-item-desc">{doc.filename}</span>
                        )}
                      </div>
                      {selectedDocumentIds.includes(doc.id) && (
                        <HiCheck className="content-selector__popup-check" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Texts */}
              {enableTexts && availableTexts.length > 0 && (
                <div className="content-selector__popup-section">
                  <div className="content-selector__popup-section-title">Texte</div>
                  {availableTexts.map((text) => (
                    <button
                      key={text.id}
                      type="button"
                      className={`content-selector__popup-item ${selectedTextIds.includes(text.id) ? 'content-selector__popup-item--selected' : ''}`}
                      onClick={() => toggleTextSelection(text.id)}
                    >
                      <HiClipboardList className="content-selector__popup-icon" />
                      <div className="content-selector__popup-item-content">
                        <span className="content-selector__popup-item-title">{text.title}</span>
                        {text.type && (
                          <span className="content-selector__popup-item-desc">{text.type}</span>
                        )}
                      </div>
                      {selectedTextIds.includes(text.id) && (
                        <HiCheck className="content-selector__popup-check" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {isLoading && <div className="content-selector__popup-loading">Lade...</div>}
            </div>

            <div className="content-selector__popup-footer">
              <button
                type="button"
                className="content-selector__popup-done"
                onClick={() => setIsPopupOpen(false)}
              >
                Fertig
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(ContentSelector);
