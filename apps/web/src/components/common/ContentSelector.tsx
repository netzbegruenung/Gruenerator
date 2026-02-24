import React, { useMemo, useRef } from 'react';
import { HiUpload, HiFolder } from 'react-icons/hi';
import { useShallow } from 'zustand/react/shallow';

import { useAuth } from '../../hooks/useAuth';
import { useGeneratorSelectionStore } from '../../stores/core/generatorSelectionStore';

import AttachedFilesList from './AttachedFilesList';

import type { JSX, ChangeEvent } from 'react';

export interface AttachedFile {
  name: string;
  size?: number;
  type?: string;
  [key: string]: unknown;
}

interface ContentSelectorProps {
  disabled?: boolean;
  onAttachmentClick?: (files: File[]) => void;
  onRemoveFile?: (index: number) => void;
  attachedFiles?: AttachedFile[];
  onDropdownClose?: () => void;
  onOpenSelector?: () => void;
}

const ContentSelector = ({
  disabled = false,
  onAttachmentClick,
  onRemoveFile,
  attachedFiles = [],
  onOpenSelector,
}: ContentSelectorProps): JSX.Element | null => {
  console.debug('[ContentSelector] render');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { availableTexts, availableDocuments, isLoadingTexts, isLoadingDocuments, uiConfig } =
    useGeneratorSelectionStore(
      useShallow((state) => ({
        availableTexts: state.availableTexts,
        availableDocuments: state.availableDocuments,
        isLoadingTexts: state.isLoadingTexts,
        isLoadingDocuments: state.isLoadingDocuments,
        uiConfig: state.uiConfig,
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

  const isLoading = isLoadingTexts || isLoadingDocuments;
  const hasContent = completedDocuments.length > 0 || (enableTexts && availableTexts.length > 0);

  const isLocalhost =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (!user && !isLocalhost) return null;

  return (
    <div className="flex flex-col">
      {onAttachmentClick && (
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-hover-alt"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
        >
          <HiUpload className="shrink-0" /> Hochladen
        </button>
      )}
      {hasContent && (
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-hover-alt"
          onClick={onOpenSelector}
          disabled={disabled || isLoading}
        >
          <HiFolder className="shrink-0" /> Auswählen
        </button>
      )}

      {onAttachmentClick && (
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          onChange={handleFileSelect}
          className="hidden"
        />
      )}

      {attachedFiles.length > 0 && (
        <AttachedFilesList files={attachedFiles} onRemoveFile={onRemoveFile} />
      )}
    </div>
  );
};

export default React.memo(ContentSelector);
