import React from 'react';
import { FaDownload, FaEdit, FaShareAlt, FaSave, FaImages, FaInstagram } from 'react-icons/fa';
import { IoCopyOutline, IoCheckmarkOutline } from 'react-icons/io5';
import { HiSparkles } from 'react-icons/hi';
import Spinner from '../../../components/common/Spinner';
import type { TemplateResultActionButtonsProps } from '../types/templateResultTypes';
import '../../../assets/styles/components/ui/button.css';

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
  onDownload,
  onShare,
  onGalleryUpdate,
  onNavigateToGallery,
  onOpenEditPanel,
  onTextButtonClick,
  onShareToInstagram
}) => {
  if (!generatedImageSrc) return null;

  return (
    <div className="action-buttons">
      <button
        className="btn-icon btn-primary"
        onClick={onDownload}
        disabled={loading}
        title="Herunterladen"
      >
        <FaDownload />
      </button>

      {galleryEditMode ? (
        <button
          className={`btn-icon btn-primary ${updateSuccess ? 'btn-success' : ''}`}
          onClick={onGalleryUpdate}
          disabled={loading || isUpdating}
          title={updateSuccess ? 'Gespeichert!' : 'Änderungen speichern'}
        >
          {isUpdating ? <Spinner size="small" /> : updateSuccess ? <IoCheckmarkOutline /> : <FaSave />}
        </button>
      ) : (
        <button
          className="btn-icon btn-primary"
          onClick={onShare}
          disabled={loading}
          title="Teilen"
        >
          <FaShareAlt />
        </button>
      )}

      {!galleryEditMode && autoSaveStatus === 'saved' && (
        <button
          className="btn-icon btn-primary"
          onClick={onNavigateToGallery}
          title="In Galerie anzeigen"
        >
          <FaImages />
        </button>
      )}

      <button
        className="btn-icon btn-primary"
        onClick={onOpenEditPanel}
        disabled={loading}
        title="Bearbeiten"
      >
        <FaEdit />
      </button>

      <button
        className={`btn-icon btn-primary ${copied ? 'btn-success' : ''}`}
        onClick={onTextButtonClick}
        disabled={loading || socialLoading || isAltTextLoading}
        title={hasGeneratedText ? (copied ? 'Kopiert!' : 'Text kopieren') : 'Texte generieren'}
      >
        {(socialLoading || isAltTextLoading) ? (
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
          className="btn-icon btn-primary"
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
