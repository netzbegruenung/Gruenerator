import { Button } from '@gruenerator/ui';
import React from 'react';
import {
  FaDownload,
  FaEdit,
  FaShareAlt,
  FaSave,
  FaImages,
  FaInstagram,
  FaRedo,
  FaUndo,
} from 'react-icons/fa';
import { HiSparkles } from 'react-icons/hi';
import { IoCopyOutline, IoCheckmarkOutline } from 'react-icons/io5';

import Spinner from '../../../components/common/Spinner';
import { cn } from '../../../utils/cn';

import type { TemplateResultActionButtonsProps } from '../types/templateResultTypes';

export const TemplateResultActionButtons: React.FC<TemplateResultActionButtonsProps> = ({
  generatedImageSrc,
  loading,
  galleryEditMode,
  autoSaveStatus,
  hasGeneratedText,
  copied,
  updateSuccess,
  isSharing,
  socialLoading,
  isAltTextLoading,
  canNativeShare,
  isUpdating,
  isAiType = false,
  isAiEditor = false,
  canUndo = false,
  canRedo = false,
  onDownload,
  onShare,
  onGalleryUpdate,
  onNavigateToGallery,
  onOpenEditPanel,
  onRecreate,
  onTextButtonClick,
  onShareToInstagram,
  onUndo,
  onRedo,
}) => {
  if (!generatedImageSrc) return null;

  return (
    <div className="flex gap-md w-full mb-md">
      <Button
        variant="brand"
        size="brand-icon"
        onClick={onDownload}
        disabled={loading}
        title="Herunterladen"
      >
        <FaDownload />
      </Button>

      {galleryEditMode ? (
        <Button
          variant="brand"
          size="brand-icon"
          className={cn(updateSuccess && 'bg-[#22c55e]')}
          onClick={onGalleryUpdate}
          disabled={loading || isUpdating}
          title={updateSuccess ? 'Gespeichert!' : 'Änderungen speichern'}
        >
          {isUpdating ? (
            <Spinner size="small" />
          ) : updateSuccess ? (
            <IoCheckmarkOutline />
          ) : (
            <FaSave />
          )}
        </Button>
      ) : (
        <Button
          variant="brand"
          size="brand-icon"
          onClick={onShare}
          disabled={loading}
          title="Teilen"
        >
          <FaShareAlt />
        </Button>
      )}

      {!galleryEditMode && autoSaveStatus === 'saved' && (
        <Button
          variant="brand"
          size="brand-icon"
          onClick={onNavigateToGallery}
          title="In Galerie anzeigen"
        >
          <FaImages />
        </Button>
      )}

      {isAiType ? (
        <Button
          variant="brand"
          size="brand-icon"
          onClick={onRecreate}
          disabled={loading}
          title="Neu erstellen"
        >
          <FaRedo />
        </Button>
      ) : (
        <Button
          variant="brand"
          size="brand-icon"
          onClick={onOpenEditPanel}
          disabled={loading}
          title="Bearbeiten"
        >
          <FaEdit />
        </Button>
      )}

      {isAiEditor && onUndo && onRedo && (
        <>
          <Button
            variant="brand"
            size="brand-icon"
            onClick={onUndo}
            disabled={!canUndo || loading}
            title="Rückgängig (Strg+Z)"
          >
            <FaUndo />
          </Button>
          <Button
            variant="brand"
            size="brand-icon"
            onClick={onRedo}
            disabled={!canRedo || loading}
            title="Wiederherstellen (Strg+Shift+Z)"
          >
            <FaRedo />
          </Button>
        </>
      )}

      <Button
        variant="brand"
        size="brand-icon"
        className={cn(copied && 'bg-[#22c55e]')}
        onClick={onTextButtonClick}
        disabled={loading || socialLoading || isAltTextLoading}
        title={hasGeneratedText ? (copied ? 'Kopiert!' : 'Text kopieren') : 'Texte generieren'}
      >
        {socialLoading || isAltTextLoading ? (
          <Spinner size="small" />
        ) : copied ? (
          <IoCheckmarkOutline />
        ) : hasGeneratedText ? (
          <IoCopyOutline />
        ) : (
          <HiSparkles />
        )}
      </Button>

      {canNativeShare && (
        <Button
          variant="brand"
          size="brand-icon"
          onClick={onShareToInstagram}
          disabled={loading || isSharing}
          title="Auf Instagram posten"
        >
          {isSharing ? <Spinner size="small" /> : <FaInstagram />}
        </Button>
      )}
    </div>
  );
};

export default TemplateResultActionButtons;
