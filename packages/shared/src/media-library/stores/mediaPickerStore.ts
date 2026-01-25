/**
 * Media Picker Store
 * Zustand store for managing media picker modal/sheet state
 */

import { create } from 'zustand';
import type {
  MediaItem,
  MediaType,
  MediaPickerState,
  MediaPickerActions,
  OpenPickerOptions,
} from '../types.js';

const initialState: MediaPickerState = {
  isOpen: false,
  selectedItems: [],
  allowMultiple: false,
  mediaTypeFilter: 'all',
  onSelect: null,
};

export const useMediaPickerStore = create<MediaPickerState & MediaPickerActions>((set, get) => ({
  ...initialState,

  openPicker: (options: OpenPickerOptions) => {
    set({
      isOpen: true,
      selectedItems: [],
      allowMultiple: options.allowMultiple ?? false,
      mediaTypeFilter: options.mediaTypeFilter ?? 'all',
      onSelect: options.onSelect,
    });
  },

  closePicker: () => {
    set(initialState);
  },

  selectItem: (item: MediaItem) => {
    const { allowMultiple, selectedItems } = get();

    if (allowMultiple) {
      const isSelected = selectedItems.some((i) => i.id === item.id);
      if (isSelected) {
        set({ selectedItems: selectedItems.filter((i) => i.id !== item.id) });
      } else {
        set({ selectedItems: [...selectedItems, item] });
      }
    } else {
      set({ selectedItems: [item] });
    }
  },

  deselectItem: (item: MediaItem) => {
    set((state) => ({
      selectedItems: state.selectedItems.filter((i) => i.id !== item.id),
    }));
  },

  confirmSelection: () => {
    const { onSelect, selectedItems } = get();
    if (onSelect && selectedItems.length > 0) {
      onSelect(selectedItems);
    }
    set(initialState);
  },

  clearSelection: () => {
    set({ selectedItems: [] });
  },
}));

/**
 * Helper hook for using the picker
 */
export function useMediaPicker() {
  const store = useMediaPickerStore();

  const openPicker = (options: OpenPickerOptions) => {
    store.openPicker(options);
  };

  const openImagePicker = (onSelect: (items: MediaItem[]) => void, allowMultiple = false) => {
    store.openPicker({
      onSelect,
      allowMultiple,
      mediaTypeFilter: 'image',
    });
  };

  const openVideoPicker = (onSelect: (items: MediaItem[]) => void, allowMultiple = false) => {
    store.openPicker({
      onSelect,
      allowMultiple,
      mediaTypeFilter: 'video',
    });
  };

  return {
    isOpen: store.isOpen,
    selectedItems: store.selectedItems,
    allowMultiple: store.allowMultiple,
    mediaTypeFilter: store.mediaTypeFilter,
    openPicker,
    openImagePicker,
    openVideoPicker,
    closePicker: store.closePicker,
    selectItem: store.selectItem,
    deselectItem: store.deselectItem,
    confirmSelection: store.confirmSelection,
    clearSelection: store.clearSelection,
  };
}
