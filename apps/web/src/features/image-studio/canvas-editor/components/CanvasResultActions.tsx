import React from 'react';
import { FaDownload, FaShareAlt, FaImages } from 'react-icons/fa';
import { IoCheckmarkOutline } from 'react-icons/io5';

import Spinner from '../../../../components/common/Spinner';
import '../../../../assets/styles/components/ui/button.css';

interface CanvasResultActionsProps {
  generatedImage: string;
  autoSaveStatus: 'idle' | 'saving' | 'saved' | 'error';
  shareToken: string | null;
  loading: boolean;
  onDownload: () => void;
  onShare: () => void;
  onNavigateToGallery: () => void;
}

export const CanvasResultActions: React.FC<CanvasResultActionsProps> = ({
  generatedImage,
  autoSaveStatus,
  shareToken,
  loading,
  onDownload,
  onShare,
  onNavigateToGallery,
}) => {
  if (!generatedImage) return null;

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

      <button className="btn-icon btn-primary" onClick={onShare} disabled={loading} title="Teilen">
        <FaShareAlt />
      </button>

      {autoSaveStatus === 'saved' && shareToken && (
        <button
          className="btn-icon btn-primary"
          onClick={onNavigateToGallery}
          title="In Galerie anzeigen"
        >
          <FaImages />
        </button>
      )}

      {autoSaveStatus === 'saving' && (
        <div className="action-status">
          <Spinner size="small" />
          <span>Wird synchronisiert...</span>
        </div>
      )}

      {autoSaveStatus === 'saved' && (
        <div className="action-status">
          <IoCheckmarkOutline />
          <span>In Galerie gesichert</span>
        </div>
      )}
    </div>
  );
};

export default CanvasResultActions;
