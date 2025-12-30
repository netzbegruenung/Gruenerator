/**
 * ImageUploadStep Component
 * Image upload with camera/gallery options
 */

import { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  useColorScheme,
  ActionSheetIOS,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../common';
import { pickImageFromGallery, takePhoto, type ImagePickerResult } from '../../services/imageStudio';
import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../theme';

interface ImageUploadStepProps {
  uploadedImageUri: string | null;
  onImageSelected: (uri: string, base64: string) => void;
  onClearImage: () => void;
  onNext: () => void;
  onBack: () => void;
}

export function ImageUploadStep({
  uploadedImageUri,
  onImageSelected,
  onClearImage,
  onNext,
  onBack,
}: ImageUploadStepProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const isDark = colorScheme === 'dark';

  const [loading, setLoading] = useState(false);

  const handleImageResult = (result: ImagePickerResult | null) => {
    if (result) {
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

  const showImageOptions = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Abbrechen', 'Foto aufnehmen', 'Aus Galerie wählen'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            handleTakePhoto();
          } else if (buttonIndex === 2) {
            handlePickImage();
          }
        }
      );
    } else {
      Alert.alert(
        'Bild auswählen',
        'Wie möchtest du ein Bild hinzufügen?',
        [
          { text: 'Abbrechen', style: 'cancel' },
          { text: 'Foto aufnehmen', onPress: handleTakePhoto },
          { text: 'Aus Galerie', onPress: handlePickImage },
        ]
      );
    }
  };

  const handleNext = () => {
    if (!uploadedImageUri) {
      Alert.alert('Bild erforderlich', 'Bitte wähle zuerst ein Bild aus.');
      return;
    }
    onNext();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Hintergrundbild</Text>
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          Wähle ein Bild für dein Sharepic
        </Text>
      </View>

      <View style={styles.content}>
        {uploadedImageUri ? (
          <View style={styles.previewContainer}>
            <Image source={{ uri: uploadedImageUri }} style={styles.preview} resizeMode="cover" />
            <Pressable
              onPress={onClearImage}
              style={[
                styles.removeButton,
                { backgroundColor: isDark ? colors.grey[800] : colors.white },
              ]}
            >
              <Ionicons name="close" size={20} color={theme.text} />
            </Pressable>
            <Pressable
              onPress={showImageOptions}
              style={[
                styles.changeButton,
                { backgroundColor: isDark ? colors.grey[800] : colors.white },
              ]}
            >
              <Ionicons name="camera-outline" size={20} color={theme.text} />
              <Text style={[styles.changeButtonText, { color: theme.text }]}>Ändern</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={showImageOptions}
            disabled={loading}
            style={[
              styles.uploadArea,
              {
                backgroundColor: isDark ? colors.grey[900] : colors.grey[50],
                borderColor: isDark ? colors.grey[700] : colors.grey[300],
              },
            ]}
          >
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: isDark ? colors.primary[900] : colors.primary[50] },
              ]}
            >
              <Ionicons
                name={loading ? 'hourglass-outline' : 'image-outline'}
                size={32}
                color={colors.primary[600]}
              />
            </View>
            <Text style={[styles.uploadText, { color: theme.text }]}>
              {loading ? 'Wird geladen...' : 'Tippen, um Bild auszuwählen'}
            </Text>
            <Text style={[styles.uploadHint, { color: theme.textSecondary }]}>
              Kamera oder Galerie
            </Text>
          </Pressable>
        )}
      </View>

      <View style={styles.buttonContainer}>
        <Button
          onPress={handleNext}
          variant="primary"
          disabled={!uploadedImageUri}
        >
          Weiter
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.medium,
  },
  header: {
    marginBottom: spacing.medium,
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
    justifyContent: 'center',
  },
  buttonContainer: {
    marginTop: spacing.large,
  },
  uploadArea: {
    aspectRatio: 1,
    borderRadius: borderRadius.large,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.medium,
  },
  uploadText: {
    ...typography.label,
    marginBottom: spacing.xsmall,
  },
  uploadHint: {
    ...typography.caption,
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
  changeButton: {
    position: 'absolute',
    bottom: spacing.small,
    right: spacing.small,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingVertical: spacing.xsmall,
    paddingHorizontal: spacing.small,
    borderRadius: borderRadius.full,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  changeButtonText: {
    ...typography.caption,
    fontWeight: '600',
  },
});
