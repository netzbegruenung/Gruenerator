import { useShareStore, getShareUrl } from '@gruenerator/shared';
import { Button } from '@gruenerator/ui';
import React, { useState, useEffect, useCallback } from 'react';
import {
  FaImage,
  FaTrash,
  FaShareAlt,
  FaDownload,
  FaPlus,
  FaClock,
  FaEdit,
  FaSave,
} from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';

import { ShareMediaModal } from '../../../components/common/ShareMediaModal';
import apiClient from '../../../components/utils/apiClient';
import { cn } from '../../../utils/cn';
import { useTemplateClone } from '../hooks/useTemplateClone';
import { getSharepicRoute } from '../utils/sharepicRoutes';

import type { Share } from '@gruenerator/shared';

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
  is_template?: boolean;
  template_visibility?: string;
  template_creator_name?: string;
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
  onUseTemplate?: (shareToken: string) => void;
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

/** Shared shimmer gradient for skeleton loading */
const shimmerStyle = {
  background:
    'linear-gradient(90deg, var(--background-color-alt) 0%, var(--background-color) 50%, var(--background-color-alt) 100%)',
  backgroundSize: '200% 100%',
  animation: 'galleryShimmer 1.5s ease-in-out infinite',
} as const;

const SkeletonCard = () => (
  <div className="overflow-hidden rounded-[16px] border-[length:var(--border-subtle)] bg-background shadow-sm [border:var(--border-subtle)] dark:bg-background-alt">
    <div className="aspect-square motion-reduce:animate-none" style={shimmerStyle} />
    <div className="p-md">
      <div
        className="mb-sm h-5 w-[70%] rounded motion-reduce:animate-none"
        style={{ ...shimmerStyle, animationDelay: '0.1s' }}
      />
      <div
        className="h-4 w-1/2 rounded motion-reduce:animate-none"
        style={{ ...shimmerStyle, animationDelay: '0.2s' }}
      />
    </div>
  </div>
);

const ImageGalleryCard: React.FC<ImageGalleryCardProps> = ({
  image,
  onShare,
  onDelete,
  onDownload,
  onEdit,
  onClick,
  onUseTemplate,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Allow editing if we have sharepicType and either original image OR content data
  const isEditable =
    image.imageMetadata?.sharepicType &&
    (image.imageMetadata?.hasOriginalImage ||
      (image.imageMetadata?.content && Object.keys(image.imageMetadata.content).length > 0));

  const isTemplate = image.imageMetadata?.is_template === true;

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

  const handleUseTemplate = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (onUseTemplate && image.shareToken) {
      onUseTemplate(image.shareToken);
    }
  };

  const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';
  const thumbnailUrl = image.thumbnailPath
    ? `${baseURL}/share/${image.shareToken}/preview?w=400`
    : null;

  return (
    <div
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-[16px] bg-background shadow-sm transition-[transform,box-shadow] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)] [border:var(--border-subtle)] hover:-translate-y-1 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:bg-background-alt max-[768px]:rounded-[12px] motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        isDeleting &&
          '[&_.gallery-thumbnail]:blur-[2px] [&_.gallery-thumbnail]:opacity-40 [&_.gallery-info]:blur-[2px] [&_.gallery-info]:opacity-40'
      )}
      onClick={() => onClick(image)}
      tabIndex={0}
      onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && onClick(image)}
    >
      <div className="gallery-thumbnail relative aspect-square w-full overflow-hidden bg-background-alt after:pointer-events-none after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[60px] after:bg-gradient-to-t after:from-overlay-sm after:to-transparent after:opacity-0 after:transition-opacity after:duration-[250ms] after:ease-linear after:content-[''] group-hover:after:opacity-100">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={image.title || 'Gespeichertes Bild'}
            className={cn(
              'h-full w-full object-cover transition-[transform,opacity] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100',
              imageLoaded ? 'opacity-100' : 'opacity-0'
            )}
            loading="lazy"
            width={400}
            height={500}
            onLoad={() => setImageLoaded(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,var(--background-color-alt)_0%,var(--background-color)_100%)] text-disabled [&_svg]:text-[2.5rem] [&_svg]:opacity-50">
            <FaImage />
          </div>
        )}
        {image.imageType && (
          <span className="absolute bottom-sm left-sm z-[2] rounded-[8px] bg-overlay-md px-2 py-1 text-xs font-medium tracking-[0.02em] text-white backdrop-blur-[8px]">
            {image.imageType}
          </span>
        )}
        {image.status === 'draft' && (
          <span
            className="absolute bottom-sm left-sm z-[2] rounded-[8px] px-2 py-1 text-xs font-medium tracking-[0.02em] text-white backdrop-blur-[8px]"
            style={{ background: 'var(--grey-500)' }}
          >
            Entwurf
          </span>
        )}
        {isTemplate && (
          <span className="absolute bottom-sm left-sm z-[2] flex items-center gap-1 rounded-[8px] bg-overlay-md px-2 py-1 text-xs font-medium tracking-[0.02em] text-white backdrop-blur-[8px]">
            <FaSave /> Vorlage
          </span>
        )}
      </div>

      <div className="absolute right-sm top-sm z-[3] flex gap-xs">
        {isTemplate && (
          <button
            className="flex size-9 cursor-pointer items-center justify-center rounded-full border-none bg-overlay-md text-white opacity-0 -translate-y-1 backdrop-blur-[8px] transition-[opacity,transform,background-color] duration-200 ease-linear hover:bg-primary-600 group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white max-[768px]:size-8 max-[768px]:translate-y-0 max-[768px]:opacity-100 motion-reduce:transition-none [&_svg]:text-[0.9rem]"
            onClick={handleUseTemplate}
            title="Vorlage verwenden"
          >
            <FaSave />
          </button>
        )}
        {isEditable && (
          <button
            className="flex size-9 cursor-pointer items-center justify-center rounded-full border-none bg-overlay-md text-white opacity-0 -translate-y-1 backdrop-blur-[8px] transition-[opacity,transform,background-color] duration-200 ease-linear hover:bg-primary-600 group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white max-[768px]:size-8 max-[768px]:translate-y-0 max-[768px]:opacity-100 motion-reduce:transition-none [&_svg]:text-[0.9rem]"
            onClick={handleEdit}
            title="Bearbeiten"
          >
            <FaEdit />
          </button>
        )}
        <button
          className="flex size-9 cursor-pointer items-center justify-center rounded-full border-none bg-overlay-md text-white opacity-0 -translate-y-1 backdrop-blur-[8px] transition-[opacity,transform,background-color] duration-200 ease-linear hover:bg-secondary-600 group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white max-[768px]:size-8 max-[768px]:translate-y-0 max-[768px]:opacity-100 motion-reduce:transition-none [&_svg]:text-[0.9rem]"
          onClick={handleShare}
          title="Teilen"
        >
          <FaShareAlt />
        </button>
        <button
          className="flex size-9 cursor-pointer items-center justify-center rounded-full border-none bg-overlay-md text-white opacity-0 -translate-y-1 backdrop-blur-[8px] transition-[opacity,transform,background-color] duration-200 ease-linear hover:bg-secondary-600 group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white max-[768px]:size-8 max-[768px]:translate-y-0 max-[768px]:opacity-100 motion-reduce:transition-none [&_svg]:text-[0.9rem]"
          onClick={handleDownload}
          title="Herunterladen"
        >
          <FaDownload />
        </button>
        <button
          className="flex size-9 cursor-pointer items-center justify-center rounded-full border-none bg-overlay-md text-white opacity-0 -translate-y-1 backdrop-blur-[8px] transition-[opacity,transform,background-color] duration-200 ease-linear hover:bg-error group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white max-[768px]:size-8 max-[768px]:translate-y-0 max-[768px]:opacity-100 motion-reduce:transition-none [&_svg]:text-[0.9rem]"
          onClick={handleDelete}
          title="Löschen"
        >
          <FaTrash />
        </button>
      </div>

      <div className="gallery-info p-md max-[768px]:p-sm">
        <h3 className="m-0 mb-sm truncate pr-lg text-base font-semibold leading-[1.4] text-foreground-heading max-[768px]:text-sm">
          {image.title || 'Unbenanntes Bild'}
        </h3>
        <div className="flex items-center justify-between text-sm text-disabled max-[768px]:text-xs">
          <span className="flex items-center gap-xs [&_svg]:text-xs [&_svg]:opacity-80">
            <FaClock />
            {formatDate(image.createdAt)}
          </span>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="absolute inset-0 z-10 flex animate-[galleryFadeIn_0.2s_ease] flex-col items-center justify-center gap-md rounded-[16px] bg-[rgba(211,47,47,0.95)] max-[768px]:rounded-[12px]">
          <p className="m-0 text-base font-semibold text-white">Bild löschen?</p>
          <div className="flex gap-sm">
            <button
              className="cursor-pointer rounded-[20px] border-none bg-white px-5 py-2 text-sm font-medium text-error transition-[transform,box-shadow] duration-150 ease-linear hover:scale-[1.02]"
              onClick={confirmDelete}
            >
              Löschen
            </button>
            <button
              className="cursor-pointer rounded-[20px] border border-solid border-[rgba(255,255,255,0.3)] bg-[rgba(255,255,255,0.2)] px-5 py-2 text-sm font-medium text-white transition-[transform,box-shadow] duration-150 ease-linear hover:scale-[1.02]"
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
    clearError,
  } = useShareStore();

  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const { cloneTemplate } = useTemplateClone();

  useEffect(() => {
    fetchUserShares('image');
  }, [fetchUserShares]);

  const handleShare = useCallback((image: GalleryImage) => {
    setSelectedImage(image);
    setShowShareModal(true);
  }, []);

  const handleDelete = useCallback(
    async (shareToken: string) => {
      await deleteShare(shareToken);
    },
    [deleteShare]
  );

  const handleDownload = useCallback(async (image: GalleryImage) => {
    try {
      const response = await apiClient.get(`/share/${image.shareToken}/download`, {
        responseType: 'blob',
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

  const handleEdit = useCallback(
    (image: GalleryImage) => {
      const metadata = image.imageMetadata || {};
      const sharepicType = metadata.sharepicType;

      if (!sharepicType) {
        console.warn('Cannot edit: no sharepicType in metadata');
        return;
      }

      const route = getSharepicRoute(sharepicType);
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
          originalImageUrl: metadata.hasOriginalImage
            ? `${baseURL}/share/${image.shareToken}/original`
            : undefined,
          title: image.title,
        },
      });
    },
    [navigate]
  );

  const handleUseTemplate = useCallback(
    (shareToken: string) => {
      cloneTemplate(shareToken);
    },
    [cloneTemplate]
  );

  const handleNewImage = () => {
    navigate('/studio');
  };

  const imageShares = shares.filter((s) => s.mediaType === 'image') as GalleryImage[];

  if (isLoading && imageShares.length === 0) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-140px)] max-w-[var(--container-max-width)] flex-col p-lg min-[1400px]:max-w-[90vw] max-[768px]:min-h-[calc(100vh-100px)] max-[768px]:p-md">
        <div className="mb-lg flex items-center justify-between gap-md max-[768px]:mb-md max-[768px]:flex-col max-[768px]:items-stretch">
          <h1 className="m-0 text-2xl font-bold text-foreground-heading max-[768px]:text-xl">
            Meine Bilder
          </h1>
          <Button
            variant="brand"
            size="brand"
            className="flex items-center gap-sm whitespace-nowrap max-[768px]:justify-center"
            onClick={handleNewImage}
          >
            <FaPlus />
            Neues Bild
          </Button>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-lg max-[768px]:grid-cols-2 max-[768px]:gap-md max-[480px]:grid-cols-1">
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-140px)] max-w-[var(--container-max-width)] flex-col p-lg min-[1400px]:max-w-[90vw] max-[768px]:min-h-[calc(100vh-100px)] max-[768px]:p-md">
        <div className="mb-lg flex items-center justify-between gap-md max-[768px]:mb-md max-[768px]:flex-col max-[768px]:items-stretch">
          <h1 className="m-0 text-2xl font-bold text-foreground-heading max-[768px]:text-xl">
            Meine Bilder
          </h1>
        </div>
        <div className="mb-md rounded-[12px] border border-solid border-error bg-[rgba(211,47,47,0.1)] p-md text-error">
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
      <div className="mx-auto flex min-h-[calc(100vh-140px)] max-w-[var(--container-max-width)] flex-col p-lg min-[1400px]:max-w-[90vw] max-[768px]:min-h-[calc(100vh-100px)] max-[768px]:p-md">
        <div className="mb-lg flex items-center justify-between gap-md max-[768px]:mb-md max-[768px]:flex-col max-[768px]:items-stretch">
          <h1 className="m-0 text-2xl font-bold text-foreground-heading max-[768px]:text-xl">
            Meine Bilder
          </h1>
        </div>
        <div className="flex min-h-[300px] grow flex-col items-center justify-center px-lg py-2xl text-center">
          <div className="mb-lg text-[4rem] text-disabled opacity-40">
            <FaImage />
          </div>
          <h2 className="m-0 mb-sm text-2xl font-semibold text-foreground-heading">
            Noch keine Bilder
          </h2>
          <p className="m-0 mb-lg text-base text-disabled">
            Erstelle dein erstes Bild mit dem Image Studio.
          </p>
          <Button variant="brand" size="brand" onClick={handleNewImage}>
            <FaPlus />
            Bild erstellen
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-140px)] max-w-[var(--container-max-width)] flex-col p-lg min-[1400px]:max-w-[90vw] max-[768px]:min-h-[calc(100vh-100px)] max-[768px]:p-md">
      <div className="mb-lg flex items-center justify-between gap-md max-[768px]:mb-md max-[768px]:flex-col max-[768px]:items-stretch">
        <h1 className="m-0 text-2xl font-bold text-foreground-heading max-[768px]:text-xl">
          Meine Bilder
        </h1>
        <Button
          variant="brand"
          size="brand"
          className="flex items-center gap-sm whitespace-nowrap max-[768px]:justify-center"
          onClick={handleNewImage}
        >
          <FaPlus />
          Neues Bild
        </Button>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-lg max-[768px]:grid-cols-2 max-[768px]:gap-md max-[480px]:grid-cols-1">
        {imageShares.map((image) => (
          <ImageGalleryCard
            key={image.id || image.shareToken}
            image={image}
            onShare={handleShare}
            onDelete={handleDelete}
            onDownload={handleDownload}
            onEdit={handleEdit}
            onClick={handleImageClick}
            onUseTemplate={handleUseTemplate}
          />
        ))}
      </div>

      <div className="mt-auto pt-lg text-center text-[0.85rem] text-disabled opacity-70">
        <span>
          {imageShares.length} von {MAX_IMAGES} Bildern
        </span>
        {imageShares.length >= MAX_IMAGES - 5 && (
          <span className="font-medium text-error">
            {' '}
            - Ältere Bilder werden bald automatisch gelöscht
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
        imageData={
          selectedImage
            ? {
                image: selectedImage.thumbnailUrl,
                type: selectedImage.imageType,
                metadata: selectedImage.imageMetadata || {},
              }
            : undefined
        }
        defaultTitle={selectedImage?.title || ''}
      />
    </div>
  );
};

export default ImageGallery;
