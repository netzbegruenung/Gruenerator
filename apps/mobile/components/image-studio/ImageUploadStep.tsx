import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, useColorScheme, Alert, ScrollView } from 'react-native';

import {
  pickImageFromGallery,
  takePhoto,
  type ImagePickerResult,
} from '../../services/imageStudio';
import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../theme';
import { Button } from '../common';

import { ImageSourceTabs } from './ImageSourceTabs';
import { MediathekSelector } from './MediathekSelector';
import { StockImagesGrid } from './StockImagesGrid';
import { UnsplashAttribution } from './UnsplashAttribution';
import { UnsplashSearchTab } from './UnsplashSearchTab';

import type { ImageSourceTab, StockImageAttribution } from '@gruenerator/shared/image-studio';

interface ImageUploadStepProps {
  uploadedImageUri: string | null;
  onImageSelected: (uri: string, base64: string) => void;
  onClearImage: () => void;
  onNext: () => void;
  onBack: () => void;
  disabled?: boolean;
}

export function ImageUploadStep({
  uploadedImageUri,
  onImageSelected,
  onClearImage,
  onNext,
  onBack,
  disabled = false,
}: ImageUploadStepProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const isDark = colorScheme === 'dark';

  const [activeTab, setActiveTab] = useState<ImageSourceTab>('device');
  const [loading, setLoading] = useState(false);
  const [showMediathek, setShowMediathek] = useState(false);
  const [imageAttribution, setImageAttribution] = useState<StockImageAttribution | null>(null);

  const handleImageResult = (result: ImagePickerResult | null) => {
    if (result) {
      setImageAttribution(null);
      onImageSelected(result.uri, result.base64);
    }
    setLoading(false);
  };

  const handlePickImage = async () => {
    setLoading(true);
    const result = await pickImageFromGallery();
    handleImageResult(result);
  };

  const handleTakePhoto = async () => {
    setLoading(true);
    const result = await takePhoto();
    handleImageResult(result);
  };

  const handleStockOrUnsplashSelect = (uri: string, base64: string) => {
    onImageSelected(uri, base64);
  };

  const handleMediathekSelect = (uri: string, base64: string) => {
    setImageAttribution(null);
    onImageSelected(uri, base64);
    setShowMediathek(false);
  };

  const handleTabChange = (tab: ImageSourceTab) => {
    if (tab === 'mediathek') {
      setShowMediathek(true);
    } else {
      setActiveTab(tab);
    }
  };

  const handleClearImage = () => {
    setImageAttribution(null);
    onClearImage();
  };

  const handleNext = () => {
    if (!uploadedImageUri) {
      Alert.alert('Bild erforderlich', 'Bitte w\u00e4hle zuerst ein Bild aus.');
      return;
    }
    onNext();
  };

  const renderPreview = () => (
    <View style={styles.previewContainer}>
      <Image source={{ uri: uploadedImageUri! }} style={styles.preview} contentFit="cover" />
      <Pressable
        onPress={handleClearImage}
        style={[styles.removeButton, { backgroundColor: isDark ? colors.grey[800] : colors.white }]}
      >
        <Ionicons name="close" size={20} color={theme.text} />
      </Pressable>
      {imageAttribution && <UnsplashAttribution attribution={imageAttribution} />}
    </View>
  );

  const renderDeviceTab = () => (
    <View style={styles.deviceTabContent}>
      <Pressable
        onPress={handleTakePhoto}
        disabled={loading}
        style={[
          styles.deviceOption,
          {
            backgroundColor: isDark ? colors.grey[900] : colors.grey[50],
            borderColor: isDark ? colors.grey[700] : colors.grey[300],
          },
        ]}
      >
        <View
          style={[
            styles.deviceOptionIcon,
            { backgroundColor: isDark ? colors.primary[900] : colors.primary[50] },
          ]}
        >
          <Ionicons name="camera-outline" size={28} color={colors.primary[600]} />
        </View>
        <Text style={[styles.deviceOptionText, { color: theme.text }]}>Foto aufnehmen</Text>
      </Pressable>

      <Pressable
        onPress={handlePickImage}
        disabled={loading}
        style={[
          styles.deviceOption,
          {
            backgroundColor: isDark ? colors.grey[900] : colors.grey[50],
            borderColor: isDark ? colors.grey[700] : colors.grey[300],
          },
        ]}
      >
        <View
          style={[
            styles.deviceOptionIcon,
            { backgroundColor: isDark ? colors.primary[900] : colors.primary[50] },
          ]}
        >
          <Ionicons name="image-outline" size={28} color={colors.primary[600]} />
        </View>
        <Text style={[styles.deviceOptionText, { color: theme.text }]}>
          Aus Galerie w\u00e4hlen
        </Text>
      </Pressable>
    </View>
  );

  const renderTabContent = () => {
    if (uploadedImageUri) {
      return renderPreview();
    }

    switch (activeTab) {
      case 'device':
        return renderDeviceTab();
      case 'stock':
        return <StockImagesGrid onImageSelected={handleStockOrUnsplashSelect} />;
      case 'unsplash':
        return <UnsplashSearchTab onImageSelected={handleStockOrUnsplashSelect} />;
      default:
        return renderDeviceTab();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerSection}>
        <Text style={[styles.title, { color: theme.text }]}>Hintergrundbild</Text>
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          W\u00e4hle ein Bild f\u00fcr dein Sharepic
        </Text>
        <ImageSourceTabs activeTab={activeTab} onTabChange={handleTabChange} />
      </View>

      <View style={styles.content}>{renderTabContent()}</View>

      <View style={styles.buttonContainer}>
        <Button onPress={handleNext} variant="primary" disabled={!uploadedImageUri || disabled}>
          Weiter
        </Button>
      </View>

      <MediathekSelector
        visible={showMediathek}
        onClose={() => setShowMediathek(false)}
        onImageSelect={handleMediathekSelect}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.medium,
  },
  headerSection: {
    marginBottom: spacing.xsmall,
  },
  title: {
    ...typography.h3,
    marginBottom: spacing.xxsmall,
  },
  description: {
    ...typography.body,
  },
  content: {
    flex: 1,
  },
  buttonContainer: {
    marginTop: spacing.medium,
  },
  previewContainer: {
    aspectRatio: 1,
    borderRadius: borderRadius.large,
    overflow: 'hidden',
    position: 'relative',
  },
  preview: {
    width: '100%',
    height: '100%',
  },
  removeButton: {
    position: 'absolute',
    top: spacing.small,
    right: spacing.small,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  deviceTabContent: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.medium,
  },
  deviceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.medium,
    padding: spacing.medium,
    borderRadius: borderRadius.large,
    borderWidth: 1,
  },
  deviceOptionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceOptionText: {
    ...typography.label,
    fontWeight: '600',
  },
});
