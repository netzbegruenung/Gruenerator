/**
 * Fullscreen Image Studio Editor
 * True fullscreen editing experience for sharepics
 * Uses imageStudioStore for state management
 *
 * Note: Controls handle their own state via Zustand selectors.
 * This editor subscribes to modifications and auto-regenerates on changes.
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import {
  View,
  Image,
  Pressable,
  StyleSheet,
  useColorScheme,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EditCategoryBar } from '../../components/image-studio/EditCategoryBar';
import {
  EditCategoryModal,
  type EditCategoryModalRef,
} from '../../components/image-studio/EditCategoryModal';
import {
  InlineEditBar,
  type InlineEditCategory,
} from '../../components/image-studio/InlineEditBar';
import { useImageStudioStore } from '../../stores/imageStudioStore';
import { useEditRegeneration } from '../../hooks/useEditRegeneration';
import {
  supportsEditing,
  getAvailableCategories,
  type EditCategory,
} from '../../config/editSheetConfig';
import { getImageDataUri } from '../../services/imageStudio';
import { lightTheme, darkTheme, colors, spacing, borderRadius } from '../../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function FullscreenImageStudioEditor() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const insets = useSafeAreaInsets();
  const categoryModalRef = useRef<EditCategoryModalRef>(null);

  const [selectedCategory, setSelectedCategory] = useState<EditCategory | null>(null);
  const [inlineCategory, setInlineCategory] = useState<InlineEditCategory | null>(null);

  const type = useImageStudioStore((s) => s.type);
  const generatedImage = useImageStudioStore((s) => s.generatedImage);
  const modifications = useImageStudioStore((s) => s.modifications);
  const formData = useImageStudioStore((s) => s.formData);
  const initModifications = useImageStudioStore((s) => s.initModifications);

  const { debouncedRegenerate, isRegenerating } = useEditRegeneration();

  // Track if we've completed initialization
  const isInitialized = useRef(false);
  const prevModifications = useRef(modifications);
  const prevFormData = useRef(formData);

  // Initialize modifications on mount
  useEffect(() => {
    if (type && supportsEditing(type)) {
      initModifications();
      // Mark as initialized after a tick to allow state to settle
      setTimeout(() => {
        isInitialized.current = true;
        prevModifications.current = useImageStudioStore.getState().modifications;
        prevFormData.current = useImageStudioStore.getState().formData;
      }, 0);
    }
  }, [type, initModifications]);

  // Auto-regenerate only when user makes actual changes (not on init)
  useEffect(() => {
    if (!isInitialized.current) return;

    // Check if values actually changed (not just reference)
    const modsChanged = JSON.stringify(modifications) !== JSON.stringify(prevModifications.current);
    const formChanged = JSON.stringify(formData) !== JSON.stringify(prevFormData.current);

    if (modsChanged || formChanged) {
      prevModifications.current = modifications;
      prevFormData.current = formData;
      debouncedRegenerate();
    }
  }, [modifications, formData, debouncedRegenerate]);

  if (!type || !generatedImage || !supportsEditing(type)) {
    router.back();
    return null;
  }

  const categories = getAvailableCategories(type);
  const imageUri = getImageDataUri(generatedImage);

  const handleClose = useCallback(() => {
    router.back();
  }, []);

  const handleSelectCategory = useCallback((category: EditCategory) => {
    // Route inline categories to InlineEditBar
    if (category === 'fontSize' || category === 'colorScheme' || category === 'credit') {
      setInlineCategory(category);
    } else {
      setSelectedCategory(category);
      categoryModalRef.current?.open();
    }
  }, []);

  const handleCloseCategoryModal = useCallback(() => {
    setSelectedCategory(null);
  }, []);

  const handleCloseInlineEdit = useCallback(() => {
    setInlineCategory(null);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.imageContainer}>
        <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" />
        {isRegenerating && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.white} />
          </View>
        )}
      </View>

      <Pressable
        style={[styles.closeButton, { top: insets.top + 8 }]}
        onPress={handleClose}
        hitSlop={12}
      >
        <Ionicons name="close" size={28} color={colors.white} />
      </Pressable>

      {inlineCategory ? (
        <InlineEditBar
          category={inlineCategory}
          onClose={handleCloseInlineEdit}
          disabled={isRegenerating}
        />
      ) : (
        <EditCategoryBar categories={categories} onSelectCategory={handleSelectCategory} />
      )}

      <EditCategoryModal
        ref={categoryModalRef}
        category={selectedCategory}
        onClose={handleCloseCategoryModal}
        disabled={isRegenerating}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 120,
  },
  image: {
    width: SCREEN_WIDTH - spacing.medium * 2,
    aspectRatio: 1,
    maxWidth: SCREEN_WIDTH - spacing.medium * 2,
    borderRadius: borderRadius.large,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
});
