import { create } from 'zustand';

import {
  fetchStockImages as fetchStockImagesApi,
  fetchStockImageAsFile,
  openUnsplashSearch,
  type StockImage,
  type StockImageAttribution,
} from '../services/imageSourceService';

type ImageSourceTab = 'upload' | 'stock' | 'unsplash' | 'mediathek';

interface ImageSourceState {
  imageSourceTab: ImageSourceTab;
  stockImages: StockImage[];
  stockImageCategories: string[];
  isLoadingStockImages: boolean;
  stockImagesError: string | null;
  selectedStockImage: StockImage | null;
  stockImageAttribution: StockImageAttribution | null;
  stockImageCategory: string | null;
  unsplashImages: unknown[];
  isLoadingUnsplashImages: boolean;
  unsplashError: string | null;
}

interface ImageSourceActions {
  setImageSourceTab: (tab: ImageSourceTab) => void;
  fetchStockImages: (category?: string | null) => Promise<StockImage[]>;
  setStockImageCategory: (category: string | null) => void;
  selectStockImage: (image: StockImage | null) => Promise<File | undefined>;
  resetStockImageState: () => void;
  handleUnsplashSearch: (query: string) => void;
  setUnsplashImages: (images: unknown[]) => void;
  setLoadingUnsplashImages: (loading: boolean) => void;
  setUnsplashError: (error: string | null) => void;
  resetUnsplashState: () => void;
  resetImageSourceState: () => void;
}

export type ImageSourceStore = ImageSourceState & ImageSourceActions;

const initialState: ImageSourceState = {
  imageSourceTab: 'upload',
  stockImages: [],
  stockImageCategories: [],
  isLoadingStockImages: false,
  stockImagesError: null,
  selectedStockImage: null,
  stockImageAttribution: null,
  stockImageCategory: null,
  unsplashImages: [],
  isLoadingUnsplashImages: false,
  unsplashError: null,
};

export const useImageSourceStore = create<ImageSourceStore>((set, get) => ({
  ...initialState,

  setImageSourceTab: (tab) => set({ imageSourceTab: tab }),

  fetchStockImages: async (category = null) => {
    set({ isLoadingStockImages: true, stockImagesError: null });

    try {
      const data = await fetchStockImagesApi(category);
      set({
        stockImages: data.images,
        stockImageCategories: data.categories,
        isLoadingStockImages: false,
        stockImageCategory: category,
      });
      return data.images;
    } catch (error) {
      const errorMessage = (error as Error).message || 'Failed to fetch stock images';
      set({ isLoadingStockImages: false, stockImagesError: errorMessage });
      throw new Error(errorMessage);
    }
  },

  setStockImageCategory: (category) => {
    set({ stockImageCategory: category });
    get().fetchStockImages(category);
  },

  selectStockImage: async (image) => {
    if (!image) {
      set({ selectedStockImage: null, stockImageAttribution: null });
      return;
    }

    set({
      selectedStockImage: image,
      stockImageAttribution: image.attribution ?? null,
    });

    try {
      return await fetchStockImageAsFile(image);
    } catch (error) {
      console.error('[ImageSourceStore] Failed to load stock image:', error);
      throw error;
    }
  },

  resetStockImageState: () =>
    set({
      imageSourceTab: 'upload',
      stockImages: [],
      stockImageCategories: [],
      isLoadingStockImages: false,
      stockImagesError: null,
      selectedStockImage: null,
      stockImageAttribution: null,
      stockImageCategory: null,
    }),

  handleUnsplashSearch: (query) => openUnsplashSearch(query),

  setUnsplashImages: (images) =>
    set({
      unsplashImages: images,
      isLoadingUnsplashImages: false,
    }),

  setLoadingUnsplashImages: (loading) => set({ isLoadingUnsplashImages: loading }),

  setUnsplashError: (error) => set({ unsplashError: error }),

  resetUnsplashState: () =>
    set({
      unsplashImages: [],
      isLoadingUnsplashImages: false,
      unsplashError: null,
    }),

  resetImageSourceState: () => set(initialState),
}));

export default useImageSourceStore;
