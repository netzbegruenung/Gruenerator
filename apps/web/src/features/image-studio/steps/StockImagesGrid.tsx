import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HiCheck, HiRefresh, HiStar } from 'react-icons/hi';
import useImageStudioStore from '../../../stores/imageStudioStore';
import { usePreloadStore } from '../hooks/usePreloadStore';
import { useImageSourceStore } from '../hooks/useImageSourceStore';
import { StockImage } from '../services/imageSourceService';
import UnsplashAttribution from '../../../components/common/UnsplashAttribution';
import apiClient from '../../../components/utils/apiClient';
import './StockImagesGrid.css';

const CATEGORY_LABELS: Record<string, string> = {
  empfohlen: 'Empfohlen',
  all: 'Alle',
  environment: 'Umwelt',
  transport: 'Mobilität',
  social: 'Gesellschaft',
  nature: 'Natur',
  politics: 'Politik',
  education: 'Bildung'
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
    setStockImageCategory
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

  const handleCategoryChange = useCallback((category: string) => {
    setLocalCategory(category);
    // Only call store for real categories (not 'empfohlen' which is local-only)
    if (category !== 'empfohlen') {
      setStockImageCategory(category === 'all' ? null : category);
    }
  }, [setStockImageCategory]);

  const handleImageClick = useCallback(async (image: StockImage) => {
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
  }, [selectStockImage, onImageSelect, setUploadedImage, setFile]);

  const handleAiSuggest = useCallback(async () => {
    const textForSuggestion = thema || line1 || '';
    if (!textForSuggestion.trim()) return;

    setIsAiSuggesting(true);

    try {
      const response = await apiClient.post('/image-picker/select', {
        text: textForSuggestion,
        type: 'sharepic'
      });

      if (response.data.success) {
        const suggestion = response.data;
        setAiSuggestion(suggestion);
        setRecommendedCategory(suggestion.selectedImage.category);

        const matchingImage = stockImages.find(
          img => img.filename === suggestion.selectedImage.filename
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
        img => img.filename === preloadedImageResult.image?.filename
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
          img => img.category === recommendedCategory && img.filename !== recommendedImage?.filename
        );
        const otherImages = stockImages.filter(
          img => img.category !== recommendedCategory
        );
        return [
          ...(recommendedImage ? [recommendedImage] : []),
          ...categoryImages,
          ...otherImages
        ];
      }
      return stockImages;
    }
    return stockImages.filter(img => img.category === currentCategory);
  }, [currentCategory, stockImages, recommendedImage, recommendedCategory]);

  if (isLoadingStockImages && stockImages.length === 0) {
    return (
      <div className="stock-images-grid__loading">
        <div className="stock-images-grid__spinner" />
        <p>Stock Bilder werden geladen...</p>
      </div>
    );
  }

  if (stockImagesError) {
    return (
      <div className="stock-images-grid__error">
        <p>{stockImagesError}</p>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => fetchStockImages()}
        >
          <HiRefresh /> Erneut versuchen
        </button>
      </div>
    );
  }

  return (
    <div className="stock-images-grid">
      <div className="stock-images-grid__filters">
        {categories.map(category => (
          <button
            key={category}
            type="button"
            className={`stock-images-grid__filter-pill ${currentCategory === category ? 'active' : ''}`}
            onClick={() => handleCategoryChange(category)}
          >
            {CATEGORY_LABELS[category] || category}
          </button>
        ))}
      </div>

      <div className="stock-images-grid__grid">
        <AnimatePresence>
          {filteredImages.map((image, index) => {
            const isSelected = selectedStockImage?.filename === image.filename;
            const imgSrc = `${apiClient.defaults.baseURL}/image-picker/stock-image/${image.filename}?size=thumb`;

            return (
              <motion.div
                key={image.filename}
                className={`stock-images-grid__card ${isSelected ? 'selected' : ''}`}
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
                  className="stock-images-grid__image"
                />

                {isSelected && (
                  <div className="stock-images-grid__selected-overlay">
                    <HiCheck />
                  </div>
                )}

                {recommendedImage?.filename === image.filename && !isSelected && (
                  <div className="stock-images-grid__recommended-badge">
                    <HiStar />
                  </div>
                )}

                <div className="stock-images-grid__attribution">
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
        <div className="stock-images-grid__empty">
          <p>Keine Bilder in dieser Kategorie gefunden.</p>
        </div>
      )}
    </div>
  );
};

export default StockImagesGrid;
