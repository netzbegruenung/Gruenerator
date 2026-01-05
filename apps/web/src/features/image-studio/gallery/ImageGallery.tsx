import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaImage, FaTrash, FaShareAlt, FaDownload, FaPlus, FaClock, FaEdit } from 'react-icons/fa';
import { useShareStore, getShareUrl } from '@gruenerator/shared';
import type { Share } from '@gruenerator/shared';
import { ShareMediaModal } from '../../../components/common/ShareMediaModal';
import apiClient from '../../../components/utils/apiClient';
import './ImageGallery.css';

const MAX_IMAGES = 50;

/** Sharepic type identifiers for template routing */
type SharepicTypeKey = 'Dreizeilen' | 'Zitat' | 'Zitat_Pure' | 'Info' | 'Headline';

/** Extended image metadata including sharepic-specific fields */
interface GalleryImageMetadata {
  width?: number;
  height?: number;
  hasOriginalImage?: boolean;
  originalImageFilename?: string;
  generatedAt?: string;
  updatedAt?: string;
  sharepicType?: SharepicTypeKey;
  content?: Record<string, unknown>;
  styling?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Gallery image extending the base Share type with additional metadata */
interface GalleryImage extends Omit<Share, 'imageMetadata'> {
  id?: string;
  thumbnailPath?: string;
  imageMetadata?: GalleryImageMetadata;
}

/** Props for the ImageGalleryCard component */
interface ImageGalleryCardProps {
  image: GalleryImage;
  onShare: (image: GalleryImage) => void;
  onDelete: (shareToken: string) => Promise<void>;
  onDownload: (image: GalleryImage) => Promise<void>;
  onEdit: (image: GalleryImage) => void;
  onClick: (image: GalleryImage) => void;
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Heute';
  if (days === 1) return 'Gestern';
  if (days < 7) return `vor ${days} Tagen`;
  return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
};

const SkeletonCard = () => (
  <div className="image-gallery-skeleton-card">
    <div className="image-gallery-skeleton-thumbnail" />
    <div className="image-gallery-skeleton-info">
      <div className="image-gallery-skeleton-title" />
      <div className="image-gallery-skeleton-meta" />
    </div>
  </div>
);

const ImageGalleryCard: React.FC<ImageGalleryCardProps> = ({
  image,
  onShare,
  onDelete,
  onDownload,
  onEdit,
  onClick
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Allow editing if we have sharepicType and either original image OR content data
  const isEditable = image.imageMetadata?.sharepicType && (
    image.imageMetadata?.hasOriginalImage ||
    (image.imageMetadata?.content && Object.keys(image.imageMetadata.content).length > 0)
  );

  const handleDelete = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setIsDeleting(true);
    try {
      await onDelete(image.shareToken);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const cancelDelete = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setShowDeleteConfirm(false);
  };

  const handleShare = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onShare(image);
  };

  const handleDownload = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onDownload(image);
  };

  const handleEdit = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (isEditable) {
      onEdit(image);
    }
  };

  const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';
  const thumbnailUrl = image.thumbnailPath
    ? `${baseURL}/share/${image.shareToken}/preview`
    : null;

  return (
    <div
      className={`image-gallery-card ${isDeleting ? 'deleting' : ''}`}
      onClick={() => onClick(image)}
      tabIndex={0}
      onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && onClick(image)}
    >
      <div className="image-gallery-thumbnail">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={image.title || 'Gespeichertes Bild'}
            className={imageLoaded ? 'loaded' : 'loading'}
            onLoad={() => setImageLoaded(true)}
          />
        ) : (
          <div className="image-gallery-thumbnail-placeholder">
            <FaImage />
          </div>
        )}
        {image.imageType && (
          <span className="image-gallery-type-badge">{image.imageType}</span>
        )}
      </div>

      <div className="image-gallery-actions">
        {isEditable && (
          <button
            className="image-gallery-action-btn image-gallery-action-btn--edit"
            onClick={handleEdit}
            title="Bearbeiten"
          >
            <FaEdit />
          </button>
        )}
        <button
          className="image-gallery-action-btn image-gallery-action-btn--share"
          onClick={handleShare}
          title="Teilen"
        >
          <FaShareAlt />
        </button>
        <button
          className="image-gallery-action-btn image-gallery-action-btn--download"
          onClick={handleDownload}
          title="Herunterladen"
        >
          <FaDownload />
        </button>
        <button
          className="image-gallery-action-btn image-gallery-action-btn--delete"
          onClick={handleDelete}
          title="Löschen"
        >
          <FaTrash />
        </button>
      </div>

      <div className="image-gallery-info">
        <h3 className="image-gallery-item-title">
          {image.title || 'Unbenanntes Bild'}
        </h3>
        <div className="image-gallery-meta">
          <span className="image-gallery-date">
            <FaClock />
            {formatDate(image.createdAt)}
          </span>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="image-gallery-delete-confirm">
          <p>Bild löschen?</p>
          <div className="image-gallery-delete-actions">
            <button
              className="image-gallery-confirm-btn"
              onClick={confirmDelete}
            >
              Löschen
            </button>
            <button
              className="image-gallery-cancel-btn"
              onClick={cancelDelete}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const ImageGallery = () => {
  const navigate = useNavigate();
  const {
    shares,
    isLoading,
    error,
    count: totalCount,
    fetchUserShares,
    deleteShare,
    clearError
  } = useShareStore();

  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  useEffect(() => {
    fetchUserShares('image');
  }, [fetchUserShares]);

  const handleShare = useCallback((image: GalleryImage) => {
    setSelectedImage(image);
    setShowShareModal(true);
  }, []);

  const handleDelete = useCallback(async (shareToken: string) => {
    await deleteShare(shareToken);
  }, [deleteShare]);

  const handleDownload = useCallback(async (image: GalleryImage) => {
    try {
      const response = await apiClient.get(`/share/${image.shareToken}/download`, {
        responseType: 'blob'
      });
      const blob = response.data;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${image.title || 'bild'}_gruenerator.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  }, []);

  const handleImageClick = useCallback((image: GalleryImage) => {
    const shareUrl = getShareUrl(image.shareToken);
    window.open(shareUrl, '_blank');
  }, []);

  const handleEdit = useCallback((image: GalleryImage) => {
    const metadata = image.imageMetadata || {};
    const sharepicType = metadata.sharepicType;
    console.log('[ImageGallery] handleEdit called with:', { shareToken: image.shareToken, metadata, sharepicType });

    if (!sharepicType) {
      console.warn('Cannot edit: no sharepicType in metadata');
      return;
    }

    // Map sharepic types to Image Studio routes
    const typeRouteMap: Record<SharepicTypeKey, string> = {
      'Dreizeilen': '/image-studio/templates/dreizeilen',
      'Zitat': '/image-studio/templates/zitat',
      'Zitat_Pure': '/image-studio/templates/zitat-pure',
      'Info': '/image-studio/templates/info',
      'Headline': '/image-studio/templates/headline',
    };

    const route = typeRouteMap[sharepicType];
    if (!route) {
      console.warn('Unknown sharepic type:', sharepicType);
      return;
    }

    const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

    navigate(route, {
      state: {
        galleryEditMode: true,
        shareToken: image.shareToken,
        content: { ...metadata.content, sharepicType },
        styling: metadata.styling || {},
        originalImageUrl: `${baseURL}/share/${image.shareToken}/original`,
        title: image.title,
      }
    });
  }, [navigate]);

  const handleNewImage = () => {
    navigate('/image-studio');
  };

  const imageShares = shares.filter(s => s.mediaType === 'image') as GalleryImage[];

  if (isLoading && imageShares.length === 0) {
    return (
      <div className="image-gallery">
        <div className="image-gallery-header">
          <h1 className="image-gallery-title">Meine Bilder</h1>
          <button
            className="btn-primary image-gallery-new-btn"
            onClick={handleNewImage}
          >
            <FaPlus />
            Neues Bild
          </button>
        </div>
        <div className="image-gallery-skeleton-grid">
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="image-gallery">
        <div className="image-gallery-header">
          <h1 className="image-gallery-title">Meine Bilder</h1>
        </div>
        <div className="image-gallery-error">
          {error}
          <button onClick={clearError} style={{ marginLeft: 'var(--spacing-small)' }}>
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  if (imageShares.length === 0) {
    return (
      <div className="image-gallery">
        <div className="image-gallery-header">
          <h1 className="image-gallery-title">Meine Bilder</h1>
        </div>
        <div className="image-gallery-empty">
          <div className="image-gallery-empty-icon">
            <FaImage />
          </div>
          <h2 className="image-gallery-empty-title">Noch keine Bilder</h2>
          <p className="image-gallery-empty-text">
            Erstelle dein erstes Bild mit dem Image Studio.
          </p>
          <button
            className="btn-primary"
            onClick={handleNewImage}
          >
            <FaPlus />
            Bild erstellen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="image-gallery">
      <div className="image-gallery-header">
        <h1 className="image-gallery-title">Meine Bilder</h1>
        <button
          className="btn-primary image-gallery-new-btn"
          onClick={handleNewImage}
        >
          <FaPlus />
          Neues Bild
        </button>
      </div>

      <div className="image-gallery-grid">
        {imageShares.map((image) => (
          <ImageGalleryCard
            key={image.id || image.shareToken}
            image={image}
            onShare={handleShare}
            onDelete={handleDelete}
            onDownload={handleDownload}
            onEdit={handleEdit}
            onClick={handleImageClick}
          />
        ))}
      </div>

      <div className="image-gallery-limit-info">
        <span>{imageShares.length} von {MAX_IMAGES} Bildern</span>
        {imageShares.length >= MAX_IMAGES - 5 && (
          <span className="image-gallery-limit-warning">
            {' '} - Ältere Bilder werden bald automatisch gelöscht
          </span>
        )}
      </div>

      <ShareMediaModal
        isOpen={showShareModal}
        onClose={() => {
          setShowShareModal(false);
          setSelectedImage(null);
        }}
        mediaType="image"
        imageData={selectedImage ? {
          image: null,
          type: selectedImage.imageType,
          metadata: selectedImage.imageMetadata || {}
        } : undefined}
        defaultTitle={selectedImage?.title || ''}
      />
    </div>
  );
};

export default ImageGallery;
