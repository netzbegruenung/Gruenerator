import { useShareStore, type Share } from '@gruenerator/shared/share';
import { buttonVariants, Label, Tabs, TabsList, TabsTrigger, TabsContent } from '@gruenerator/ui';
import { motion, AnimatePresence } from 'motion/react';
import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { HiArrowLeft, HiArrowRight, HiX, HiPhotograph, HiSearch } from 'react-icons/hi';

import Button from '../../../components/common/SubmitButton';
import UnsplashAttribution from '../../../components/common/UnsplashAttribution';
import useDebounce from '../../../components/hooks/useDebounce';
import apiClient from '../../../components/utils/apiClient';
import useImageStudioStore from '../../../stores/imageStudioStore';
import { cn } from '../../../utils/cn';
import { slideVariants } from '../components/StepFlow';
import { useImageSourceStore } from '../hooks/useImageSourceStore';
import { useUnsplashSearch } from '../hooks/useUnsplashSearch';
import {
  fetchUnsplashImageAsFile,
  trackUnsplashDownloadLive,
  type StockImage,
} from '../services/imageSourceService';

import StockImagesGrid from './StockImagesGrid';

interface BackgroundRemovalProgress {
  phase: 'downloading' | 'processing' | 'compressing';
  progress: number;
  message: string;
}

export interface ImageUploadStepProps {
  onNext: () => void;
  onBack: () => void;
  direction: number;
  loading: boolean;
  bgRemovalProgress: BackgroundRemovalProgress | null;
}

const ImageUploadStep: React.FC<ImageUploadStepProps> = ({
  onNext,
  onBack,
  direction,
  loading,
  bgRemovalProgress,
}) => {
  const { uploadedImage, updateFormData } = useImageStudioStore();
  const {
    imageSourceTab,
    setImageSourceTab,
    selectedStockImage,
    stockImageAttribution,
    resetStockImageState,
  } = useImageSourceStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState<boolean>(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(() => {
    if (!uploadedImage) return null;
    if (typeof uploadedImage === 'string') return uploadedImage;
    return URL.createObjectURL(uploadedImage);
  });
  const isNewUploadRef = useRef<boolean>(false);

  useEffect(() => {
    if (uploadedImage) {
      if (typeof uploadedImage === 'string') {
        setPreviewUrl(uploadedImage);
        return;
      }
      const url = URL.createObjectURL(uploadedImage);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [uploadedImage]);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleFileSelect = useCallback(
    (file: File | undefined) => {
      if (!file) return;

      const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!validTypes.includes(file.type)) return;

      isNewUploadRef.current = true;
      updateFormData({ uploadedImage: file });
      setTimeout(() => onNext(), 50);
    },
    [updateFormData, onNext]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);

      const file = e.dataTransfer?.files?.[0];
      handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      handleFileSelect(file);
      e.target.value = '';
    },
    [handleFileSelect]
  );

  const handleRemoveImage = useCallback(() => {
    updateFormData({ uploadedImage: null });
    resetStockImageState();
  }, [updateFormData, resetStockImageState]);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleStockImageSelect = useCallback(() => {
    setTimeout(() => onNext(), 50);
  }, [onNext]);

  // Mediathek state
  const { shares, isLoading: isLoadingShares, fetchUserShares } = useShareStore();
  const [selectedMediathekImage, setSelectedMediathekImage] = useState<Share | null>(null);
  const [isLoadingMediathekImage, setIsLoadingMediathekImage] = useState(false);

  const mediathekImages = useMemo(() => {
    return shares.filter(
      (share) =>
        share.mediaType === 'image' &&
        (share.imageMetadata?.hasOriginalImage === true || share.imageType === 'pure-create')
    );
  }, [shares]);

  useEffect(() => {
    if (imageSourceTab === 'mediathek' && shares.length === 0) {
      fetchUserShares('image');
    }
  }, [imageSourceTab, shares.length, fetchUserShares]);

  // Unsplash search state
  const [unsplashQuery, setUnsplashQuery] = useState('');
  const debouncedUnsplashQuery = useDebounce(unsplashQuery, 500);
  const [isLoadingUnsplashSelect, setIsLoadingUnsplashSelect] = useState(false);
  const {
    searchResults: unsplashResults,
    totalResults: unsplashTotal,
    isLoadingSearch: isLoadingUnsplash,
    searchError: unsplashError,
    searchUnsplash,
    loadMoreResults: loadMoreUnsplash,
    clearSearch: clearUnsplash,
  } = useUnsplashSearch();

  useEffect(() => {
    if (imageSourceTab !== 'unsplash') return;
    if (debouncedUnsplashQuery.trim()) {
      searchUnsplash(debouncedUnsplashQuery);
    } else {
      clearUnsplash();
    }
  }, [debouncedUnsplashQuery, searchUnsplash, clearUnsplash, imageSourceTab]);

  const handleUnsplashImageSelect = useCallback(
    async (image: StockImage) => {
      setIsLoadingUnsplashSelect(true);
      try {
        const file = await fetchUnsplashImageAsFile(image);
        if (image.attribution?.downloadLocation) {
          await trackUnsplashDownloadLive(image.attribution.downloadLocation);
        }
        useImageSourceStore.setState({
          selectedStockImage: image,
          stockImageAttribution: image.attribution ?? null,
        });
        updateFormData({ uploadedImage: file });
        setTimeout(() => onNext(), 50);
      } catch (error) {
        console.error('Failed to select Unsplash image:', error);
      } finally {
        setIsLoadingUnsplashSelect(false);
      }
    },
    [updateFormData, onNext]
  );

  const handleMediathekImageSelect = useCallback(
    async (share: Share) => {
      setSelectedMediathekImage(share);
      setIsLoadingMediathekImage(true);

      try {
        const hasOriginal = share.imageMetadata?.hasOriginalImage === true;
        const imageUrl = hasOriginal
          ? `${apiClient.defaults.baseURL}/share/${share.shareToken}/original`
          : `${apiClient.defaults.baseURL}/share/${share.shareToken}`;

        const response = await fetch(imageUrl, {
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to fetch image');
        }

        const blob = await response.blob();
        const file = new File([blob], `mediathek-${share.shareToken}.jpg`, {
          type: blob.type || 'image/jpeg',
        });

        updateFormData({ uploadedImage: file });
        setTimeout(() => onNext(), 50);
      } catch (error) {
        console.error('Failed to load mediathek image:', error);
      } finally {
        setIsLoadingMediathekImage(false);
        setSelectedMediathekImage(null);
      }
    },
    [updateFormData, onNext]
  );

  const renderImagePreview = (altText: string, showAttribution = false) => (
    <div className="relative w-full max-w-[500px] mx-auto">
      <img
        src={previewUrl!}
        alt={altText}
        className="w-full rounded-lg object-contain max-h-[50vh] cursor-pointer"
        onClick={handleUploadClick}
      />
      <button
        type="button"
        className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white border-none cursor-pointer flex items-center justify-center hover:bg-black/80 transition-colors"
        onClick={handleRemoveImage}
        aria-label="Bild entfernen"
      >
        <HiX />
      </button>
      {showAttribution && stockImageAttribution && (
        <UnsplashAttribution
          photographer={stockImageAttribution.photographer}
          profileUrl={stockImageAttribution.profileUrl}
        />
      )}
    </div>
  );

  return (
    <motion.div
      key="image_upload"
      custom={direction}
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="flex flex-col gap-md w-full"
    >
      <Tabs
        value={imageSourceTab}
        onValueChange={(val) =>
          setImageSourceTab(val as 'upload' | 'stock' | 'unsplash' | 'mediathek')
        }
      >
        <TabsList className="w-full">
          <TabsTrigger value="upload">Hochladen</TabsTrigger>
          <TabsTrigger value="stock">Stock Bilder</TabsTrigger>
          <TabsTrigger value="unsplash">@unsplash</TabsTrigger>
          <TabsTrigger value="mediathek">Meine Bilder</TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
          <div
            className={cn(
              'w-full min-h-[200px] mt-md',
              isDragActive && 'ring-2 ring-[var(--interactive-accent-color)] rounded-lg'
            )}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <input
              type="file"
              id="image-upload-input"
              ref={fileInputRef}
              onChange={handleFileInputChange}
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label="Bild auswählen"
            />

            {!previewUrl ? (
              <Label
                htmlFor="image-upload-input"
                className={cn(
                  'flex flex-col items-center justify-center gap-md p-xl',
                  'border-2 border-dashed border-grey-300 dark:border-grey-600 rounded-lg',
                  'cursor-pointer transition-colors hover:border-[var(--interactive-accent-color)] hover:bg-background-alt',
                  isDragActive && 'border-[var(--interactive-accent-color)] bg-background-alt'
                )}
              >
                <HiPhotograph className="text-4xl text-grey-400" />
                <span className="text-sm text-grey-500 text-center">
                  Ziehe ein Bild hierher oder klicke zum Auswählen
                </span>
                <span className="text-xs text-grey-400">JPG, PNG, WebP</span>
              </Label>
            ) : (
              renderImagePreview('Vorschau', true)
            )}
          </div>
        </TabsContent>

        <TabsContent value="stock">
          <div className="mt-md">
            {previewUrl ? (
              renderImagePreview(selectedStockImage?.alt_text || 'Ausgewähltes Stock Bild', true)
            ) : (
              <StockImagesGrid onImageSelect={handleStockImageSelect} />
            )}
          </div>
        </TabsContent>

        <TabsContent value="unsplash">
          <div className="mt-md">
            {previewUrl ? (
              renderImagePreview(selectedStockImage?.alt_text || 'Ausgewähltes Unsplash Bild', true)
            ) : (
              <div className="stock-images-grid">
                <div className="flex items-center gap-2 py-2 px-3 bg-background border border-grey-300 dark:border-grey-600 rounded-lg">
                  <HiSearch size={18} className="text-grey-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Suchen... (z.B. Natur, Politik, Stadt)"
                    value={unsplashQuery}
                    onChange={(e) => setUnsplashQuery(e.target.value)}
                    className="flex-1 border-none outline-none bg-transparent text-foreground text-sm"
                  />
                  {unsplashQuery && (
                    <button
                      type="button"
                      onClick={() => setUnsplashQuery('')}
                      aria-label="Suche löschen"
                      className="bg-transparent border-none cursor-pointer p-0 flex items-center text-grey-400 hover:text-foreground"
                    >
                      <HiX size={18} />
                    </button>
                  )}
                </div>

                {isLoadingUnsplash && unsplashResults.length === 0 && (
                  <div className="stock-images-grid__loading">
                    <div className="stock-images-grid__spinner" />
                    <p>Suche läuft...</p>
                  </div>
                )}

                {unsplashError && (
                  <div className="stock-images-grid__empty">
                    <p>{unsplashError}</p>
                    <button
                      type="button"
                      onClick={() => searchUnsplash(debouncedUnsplashQuery)}
                      className="mt-2 py-2 px-4 bg-primary-600 text-white border-none rounded-md cursor-pointer text-sm"
                    >
                      Erneut versuchen
                    </button>
                  </div>
                )}

                {unsplashResults.length > 0 && (
                  <>
                    <div className="stock-images-grid__grid">
                      <AnimatePresence mode="popLayout">
                        {unsplashResults.map((image, index) => (
                          <motion.div
                            key={image.filename}
                            className="stock-images-grid__card"
                            onClick={() => handleUnsplashImageSelect(image)}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={{ duration: 0.2, delay: (index % 20) * 0.02 }}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            style={{ cursor: isLoadingUnsplashSelect ? 'wait' : 'pointer' }}
                          >
                            <img
                              src={image.url}
                              alt={image.alt_text || 'Unsplash Bild'}
                              loading="lazy"
                              className="stock-images-grid__image"
                            />
                            {image.attribution && (
                              <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-1">
                                <UnsplashAttribution
                                  photographer={image.attribution.photographer}
                                  profileUrl={image.attribution.profileUrl}
                                  compact={true}
                                />
                              </div>
                            )}
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>

                    {unsplashResults.length < unsplashTotal && (
                      <button
                        type="button"
                        onClick={loadMoreUnsplash}
                        disabled={isLoadingUnsplash}
                        className="w-full py-2.5 bg-primary-600 text-white border-none rounded-lg cursor-pointer text-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                      >
                        {isLoadingUnsplash
                          ? 'Lädt...'
                          : `Mehr laden (${unsplashResults.length} von ${unsplashTotal})`}
                      </button>
                    )}
                  </>
                )}

                {debouncedUnsplashQuery &&
                  unsplashResults.length === 0 &&
                  !isLoadingUnsplash &&
                  !unsplashError && (
                    <div className="stock-images-grid__empty">
                      <p>Keine Ergebnisse für „{debouncedUnsplashQuery}"</p>
                    </div>
                  )}

                {!debouncedUnsplashQuery && unsplashResults.length === 0 && !isLoadingUnsplash && (
                  <div className="stock-images-grid__empty">
                    <p>Suche nach Bildern auf Unsplash</p>
                    <p style={{ fontSize: '0.875rem', opacity: 0.7 }}>
                      Kostenlose, hochauflösende Fotos mit automatischer Fotografennennung.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="mediathek">
          <div className="mt-md">
            {previewUrl ? (
              renderImagePreview('Ausgewähltes Bild aus Mediathek')
            ) : (
              <div className="stock-images-grid">
                {isLoadingShares && mediathekImages.length === 0 ? (
                  <div className="stock-images-grid__loading">
                    <div className="stock-images-grid__spinner" />
                    <p>Mediathek wird geladen...</p>
                  </div>
                ) : mediathekImages.length === 0 ? (
                  <div className="stock-images-grid__empty">
                    <p>Noch keine Bilder in der Mediathek.</p>
                    <p style={{ fontSize: '0.875rem', opacity: 0.7 }}>
                      Erstelle Sharepics, um sie hier wiederzuverwenden.
                    </p>
                  </div>
                ) : (
                  <div className="stock-images-grid__grid">
                    <AnimatePresence mode="popLayout">
                      {mediathekImages.map((share, index) => {
                        const isSelected = selectedMediathekImage?.shareToken === share.shareToken;
                        const thumbnailUrl =
                          share.thumbnailUrl ||
                          `${apiClient.defaults.baseURL}/share/${share.shareToken}/thumbnail`;
                        const isOriginal = share.imageMetadata?.hasOriginalImage === true;

                        return (
                          <motion.div
                            key={share.shareToken}
                            className={`stock-images-grid__card ${isSelected ? 'selected' : ''}`}
                            onClick={() => handleMediathekImageSelect(share)}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={{ duration: 0.2, delay: index * 0.02 }}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            style={{ cursor: isLoadingMediathekImage ? 'wait' : 'pointer' }}
                          >
                            <img
                              src={thumbnailUrl}
                              alt={share.title || 'Mediathek Bild'}
                              loading="lazy"
                              className="stock-images-grid__image"
                            />

                            {isSelected && isLoadingMediathekImage && (
                              <div className="stock-images-grid__selected-overlay">
                                <div
                                  className="stock-images-grid__spinner"
                                  style={{ width: 16, height: 16 }}
                                />
                              </div>
                            )}

                            {!isSelected && (
                              <div
                                className="stock-images-grid__recommended-badge"
                                title={isOriginal ? 'Original Bild' : 'KI-generiert'}
                                style={{
                                  background: isOriginal ? 'var(--primary-500)' : 'var(--sonne)',
                                }}
                              >
                                {isOriginal ? <HiPhotograph style={{ fontSize: 12 }} /> : '✨'}
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {bgRemovalProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg p-lg flex flex-col items-center gap-md shadow-xl">
            <div className="w-8 h-8 border-3 border-grey-200 border-t-[var(--interactive-accent-color)] rounded-full animate-spin" />
            <p className="text-sm text-foreground m-0">{bgRemovalProgress.message}</p>
            <div className="w-[200px] h-1.5 bg-grey-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--interactive-accent-color)] rounded-full transition-all duration-300"
                style={{ width: `${Math.round(bgRemovalProgress.progress * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="template-input-step__actions">
        <Button
          onClick={onBack}
          text="Zurück"
          icon={<HiArrowLeft />}
          className={buttonVariants({ variant: 'brand-outline', size: 'brand' })}
          ariaLabel="Zurück"
          disabled={loading}
        />
        {previewUrl && (
          <Button
            onClick={onNext}
            text={loading ? 'Wird verarbeitet...' : 'Weiter'}
            icon={loading ? undefined : <HiArrowRight />}
            className={buttonVariants({ variant: 'brand', size: 'brand' })}
            ariaLabel="Weiter"
            loading={loading}
            disabled={loading}
          />
        )}
      </div>
    </motion.div>
  );
};

export default ImageUploadStep;
