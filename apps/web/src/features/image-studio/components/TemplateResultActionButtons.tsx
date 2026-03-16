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
import { actionButtons, btnIcon } from '../../../utils/buttonStyles';
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
    <div className={actionButtons}>
      <button
        className={btnIcon.primary}
        onClick={onDownload}
        disabled={loading}
        title="Herunterladen"
      >
        <FaDownload />
      </button>

      {galleryEditMode ? (
        <button
          className={cn(btnIcon.primary, updateSuccess && 'bg-[#22c55e]')}
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
        </button>
      ) : (
        <button className={btnIcon.primary} onClick={onShare} disabled={loading} title="Teilen">
          <FaShareAlt />
        </button>
      )}

      {!galleryEditMode && autoSaveStatus === 'saved' && (
        <button
          className={btnIcon.primary}
          onClick={onNavigateToGallery}
          title="In Galerie anzeigen"
        >
          <FaImages />
        </button>
      )}

      {isAiType ? (
        <button
          className={btnIcon.primary}
          onClick={onRecreate}
          disabled={loading}
          title="Neu erstellen"
        >
          <FaRedo />
        </button>
      ) : (
        <button
          className={btnIcon.primary}
          onClick={onOpenEditPanel}
          disabled={loading}
          title="Bearbeiten"
        >
          <FaEdit />
        </button>
      )}

      {isAiEditor && onUndo && onRedo && (
        <>
          <button
            className={btnIcon.primary}
            onClick={onUndo}
            disabled={!canUndo || loading}
            title="Rückgängig (Strg+Z)"
          >
            <FaUndo />
          </button>
          <button
            className={btnIcon.primary}
            onClick={onRedo}
            disabled={!canRedo || loading}
            title="Wiederherstellen (Strg+Shift+Z)"
          >
            <FaRedo />
          </button>
        </>
      )}

      <button
        className={cn(btnIcon.primary, copied && 'bg-[#22c55e]')}
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
      </button>

      {canNativeShare && (
        <button
          className={btnIcon.primary}
          onClick={onShareToInstagram}
          disabled={loading || isSharing}
          title="Auf Instagram posten"
        >
          {isSharing ? <Spinner size="small" /> : <FaInstagram />}
        </button>
      )}
    </div>
  );
};

export default TemplateResultActionButtons;
