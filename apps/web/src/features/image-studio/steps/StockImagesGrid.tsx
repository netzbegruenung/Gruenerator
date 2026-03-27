import { Button } from '@gruenerator/ui';
import { motion, AnimatePresence } from 'motion/react';
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { HiCheck, HiRefresh, HiStar } from 'react-icons/hi';

import UnsplashAttribution from '../../../components/common/UnsplashAttribution';
import apiClient from '../../../components/utils/apiClient';
import useImageStudioStore from '../../../stores/imageStudioStore';
import { cn } from '../../../utils/cn';
import { useImageSourceStore } from '../hooks/useImageSourceStore';
import { usePreloadStore } from '../hooks/usePreloadStore';
import { type StockImage } from '../services/imageSourceService';

const CATEGORY_LABELS: Record<string, string> = {
  empfohlen: 'Empfohlen',
  all: 'Alle',
  environment: 'Umwelt',
  transport: 'Mobilität',
  social: 'Gesellschaft',
  nature: 'Natur',
  politics: 'Politik',
  education: 'Bildung',
};

interface StockImagesGridProps {
  onImageSelect?: (image: StockImage) => void;
}

const StockImagesGrid: React.FC<StockImagesGridProps> = ({ onImageSelect }) => {
  const { thema, line1, setUploadedImage, setFile } = useImageStudioStore();
  const { preloadedImageResult } = usePreloadStore();
  const {
    stockImages,
    stockImageCategories,
    isLoadingStockImages,
    stockImagesError,
    selectedStockImage,
    fetchStockImages,
    selectStockImage,
    setStockImageCategory,
  } = useImageSourceStore();

  const [isAiSuggesting, setIsAiSuggesting] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<{ selectedImage: StockImage } | null>(null);
  const [recommendedImage, setRecommendedImage] = useState<StockImage | null>(null);
  const [recommendedCategory, setRecommendedCategory] = useState<string | null>(null);
  const hasAutoSuggested = useRef(false);

  useEffect(() => {
    if (stockImages.length === 0 && !isLoadingStockImages) {
      fetchStockImages();
    }
  }, [stockImages.length, isLoadingStockImages, fetchStockImages]);

  const [localCategory, setLocalCategory] = useState('all');

  const handleCategoryChange = useCallback(
    (category: string) => {
      setLocalCategory(category);
      // Only call store for real categories (not 'empfohlen' which is local-only)
      if (category !== 'empfohlen') {
        setStockImageCategory(category === 'all' ? null : category);
      }
    },
    [setStockImageCategory]
  );

  const handleImageClick = useCallback(
    async (image: StockImage) => {
      try {
        const file = await selectStockImage(image);
        if (file) {
          setUploadedImage(file);
          setFile(file);
        }
        if (onImageSelect) {
          onImageSelect(image);
        }
      } catch (error) {
        console.error('Failed to select stock image:', error);
      }
    },
    [selectStockImage, onImageSelect, setUploadedImage, setFile]
  );

  const handleAiSuggest = useCallback(async () => {
    const textForSuggestion = thema || line1 || '';
    if (!textForSuggestion.trim()) return;

    setIsAiSuggesting(true);

    try {
      const response = await apiClient.post('/image-picker/select', {
        text: textForSuggestion,
        type: 'sharepic',
      });

      if (response.data.success) {
        const suggestion = response.data;
        setAiSuggestion(suggestion);
        setRecommendedCategory(suggestion.selectedImage.category);

        const matchingImage = stockImages.find(
          (img) => img.filename === suggestion.selectedImage.filename
        );

        if (matchingImage) {
          setRecommendedImage(matchingImage);
        }
      }
    } catch (error) {
      console.error('AI suggestion failed:', error);
    } finally {
      setIsAiSuggesting(false);
    }
  }, [thema, line1, stockImages]);

  // Use preloaded data if available (from parallel preload)
  useEffect(() => {
    if (preloadedImageResult && !recommendedImage && stockImages.length > 0) {
      const matchingImage = stockImages.find(
        (img) => img.filename === preloadedImageResult.image?.filename
      );
      if (matchingImage) {
        setRecommendedImage(matchingImage);
        setRecommendedCategory(preloadedImageResult.category || null);
        hasAutoSuggested.current = true;
      }
    }
  }, [preloadedImageResult, recommendedImage, stockImages]);

  // Auto-trigger AI suggestion in background when thema is available (fallback if no preload)
  useEffect(() => {
    if (thema && stockImages.length > 0 && !hasAutoSuggested.current && !preloadedImageResult) {
      hasAutoSuggested.current = true;
      handleAiSuggest();
    }
  }, [thema, stockImages.length, handleAiSuggest, preloadedImageResult]);

  // Categories: add "Empfohlen" after "Alle" when recommendation exists
  const categories = useMemo(() => {
    const others = stockImageCategories || [];
    if (recommendedImage && thema) {
      return ['all', 'empfohlen', ...others];
    }
    return ['all', ...others];
  }, [stockImageCategories, recommendedImage, thema]);

  const currentCategory = localCategory;

  // Filter images: show only recommended when "Empfohlen" selected
  // In "Alle", show recommended image first, then category, then others
  const filteredImages = useMemo(() => {
    if (currentCategory === 'empfohlen' && recommendedImage) {
      return [recommendedImage];
    }
    if (currentCategory === 'all') {
      if (recommendedCategory) {
        const categoryImages = stockImages.filter(
          (img) =>
            img.category === recommendedCategory && img.filename !== recommendedImage?.filename
        );
        const otherImages = stockImages.filter((img) => img.category !== recommendedCategory);
        return [...(recommendedImage ? [recommendedImage] : []), ...categoryImages, ...otherImages];
      }
      return stockImages;
    }
    return stockImages.filter((img) => img.category === currentCategory);
  }, [currentCategory, stockImages, recommendedImage, recommendedCategory]);

  if (isLoadingStockImages && stockImages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-md p-xl text-center text-foreground opacity-70">
        <div className="w-8 h-8 border-3 border-grey-300 border-t-primary-500 rounded-full animate-spin" />
        <p>Stock Bilder werden geladen...</p>
      </div>
    );
  }

  if (stockImagesError) {
    return (
      <div className="flex flex-col items-center justify-center gap-md p-xl text-center text-foreground opacity-70">
        <p>{stockImagesError}</p>
        <Button variant="brand-outline" size="brand" onClick={() => fetchStockImages()}>
          <HiRefresh /> Erneut versuchen
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-md w-full">
      <div className="flex gap-xs flex-wrap pb-sm border-b border-grey-200 dark:border-grey-700">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            className={cn(
              'py-xxs px-sm border rounded-full text-[0.8125rem] cursor-pointer transition-all duration-200',
              currentCategory === category
                ? 'bg-primary-500 text-white border-primary-500'
                : 'bg-background-alt text-foreground border-grey-200 dark:border-grey-700 hover:bg-grey-100 dark:hover:bg-grey-800'
            )}
            onClick={() => handleCategoryChange(category)}
          >
            {CATEGORY_LABELS[category] || category}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-lg p-xs max-[768px]:grid-cols-[repeat(auto-fill,minmax(120px,1fr))] max-[768px]:gap-md">
        <AnimatePresence>
          {filteredImages.map((image, index) => {
            const isSelected = selectedStockImage?.filename === image.filename;
            const imgSrc = `${apiClient.defaults.baseURL}/image-picker/stock-image/${image.filename}?size=thumb`;

            return (
              <motion.div
                key={image.filename}
                className={cn(
                  'relative aspect-square rounded-md overflow-hidden cursor-pointer bg-background-alt transition-all duration-200',
                  isSelected && 'outline-3 outline-primary-500 outline-offset-2'
                )}
                onClick={() => handleImageClick(image)}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2, delay: index * 0.02 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <img
                  src={imgSrc}
                  alt={image.alt_text}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />

                {isSelected && (
                  <div className="absolute top-xs right-xs w-6 h-6 bg-primary-500 text-white rounded-full flex items-center justify-center text-sm">
                    <HiCheck />
                  </div>
                )}

                {recommendedImage?.filename === image.filename && !isSelected && (
                  <div className="absolute top-xs right-xs w-6 h-6 bg-[var(--sonne)] text-white rounded-full flex items-center justify-center text-sm">
                    <HiStar />
                  </div>
                )}

                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent pt-md px-xs pb-xxs">
                  <UnsplashAttribution
                    photographer={image.attribution?.photographer || ''}
                    profileUrl={image.attribution?.profileUrl || ''}
                    compact
                  />
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {filteredImages.length === 0 && !isLoadingStockImages && (
        <div className="flex flex-col items-center justify-center gap-md p-xl text-center text-foreground opacity-70">
          <p>Keine Bilder in dieser Kategorie gefunden.</p>
        </div>
      )}
    </div>
  );
};

export default StockImagesGrid;
