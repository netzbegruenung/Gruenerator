import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import * as ExpoImagePicker from 'expo-image-picker';
import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, useColorScheme } from 'react-native';

import { colors, spacing, borderRadius, typography, lightTheme, darkTheme } from '../../theme';

interface ImagePickerProps {
  onImageSelected: (base64: string, fileName: string) => void;
  onError: (error: string) => void;
  selectedImage: { uri: string; fileName: string } | null;
  onClear: () => void;
  maxSizeMB?: number;
}

const DEFAULT_MAX_SIZE_MB = 10;

export function ImagePicker({
  onImageSelected,
  onError,
  selectedImage,
  onClear,
  maxSizeMB = DEFAULT_MAX_SIZE_MB,
}: ImagePickerProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? darkTheme : lightTheme;
  const [loading, setLoading] = useState(false);

  const pickImage = useCallback(async () => {
    setLoading(true);

    try {
      // No permission request: launchImageLibraryAsync uses the Android Photo
      // Picker, which needs no runtime permission (Google Play media policy).
      const result = await ExpoImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];

        if (asset.fileSize && asset.fileSize > maxSizeMB * 1024 * 1024) {
          onError(`Bild ist zu groß. Maximal ${maxSizeMB}MB erlaubt.`);
          setLoading(false);
          return;
        }

        if (!asset.base64) {
          onError('Bild konnte nicht gelesen werden');
          setLoading(false);
          return;
        }

        const fileName = asset.fileName || `image_${Date.now()}.jpg`;
        onImageSelected(asset.base64, fileName);
      }
    } catch (err) {
      onError('Fehler beim Laden des Bildes');
    } finally {
      setLoading(false);
    }
  }, [onImageSelected, onError, maxSizeMB]);

  const takePhoto = useCallback(async () => {
    setLoading(true);

    try {
      const permissionResult = await ExpoImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        onError('Kamerazugriff wurde verweigert');
        setLoading(false);
        return;
      }

      const result = await ExpoImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];

        if (!asset.base64) {
          onError('Foto konnte nicht verarbeitet werden');
          setLoading(false);
          return;
        }

        const fileName = `photo_${Date.now()}.jpg`;
        onImageSelected(asset.base64, fileName);
      }
    } catch (err) {
      onError('Fehler beim Aufnehmen des Fotos');
    } finally {
      setLoading(false);
    }
  }, [onImageSelected, onError]);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.textGreen} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Bild wird geladen...
          </Text>
        </View>
      </View>
    );
  }

  if (selectedImage) {
    return (
      <View style={styles.container}>
        <View style={[styles.previewContainer, { backgroundColor: theme.surface }]}>
          <Image source={{ uri: selectedImage.uri }} style={styles.preview} contentFit="cover" />
          <Pressable
            style={styles.clearButton}
            onPress={onClear}
            accessibilityLabel="Bild entfernen"
            accessibilityRole="button"
          >
            <Ionicons name="close-circle" size={28} color={colors.white} />
          </Pressable>
        </View>
        <Text style={[styles.fileName, { color: theme.textSecondary }]} numberOfLines={1}>
          {selectedImage.fileName}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons name="image-outline" size={48} color={theme.textGreen} />
      </View>

      <Text style={[styles.title, { color: theme.text }]}>Bild auswählen</Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        Wähle ein Bild aus deiner Galerie oder nimm ein Foto auf
      </Text>

      <View style={styles.buttonContainer}>
        <Pressable
          style={[
            styles.optionButton,
            {
              backgroundColor: isDark ? colors.primary[950] : colors.primary[50],
              borderColor: isDark ? colors.primary[800] : colors.primary[200],
            },
          ]}
          onPress={pickImage}
        >
          <Ionicons name="images-outline" size={28} color={theme.textGreen} />
          <Text style={[styles.optionText, { color: theme.textGreen }]}>Galerie</Text>
        </Pressable>

        <Pressable
          style={[
            styles.optionButton,
            {
              backgroundColor: isDark ? colors.primary[950] : colors.primary[50],
              borderColor: isDark ? colors.primary[800] : colors.primary[200],
            },
          ]}
          onPress={takePhoto}
        >
          <Ionicons name="camera-outline" size={28} color={theme.textGreen} />
          <Text style={[styles.optionText, { color: theme.textGreen }]}>Kamera</Text>
        </Pressable>
      </View>

      <Text style={[styles.hint, { color: theme.textSecondary }]}>
        Max. {maxSizeMB}MB, JPG/PNG/WebP
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.medium,
    alignItems: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    gap: spacing.medium,
    paddingVertical: spacing.xlarge,
  },
  loadingText: {
    ...typography.body,
  },
  iconContainer: {
    marginBottom: spacing.medium,
  },
  title: {
    ...typography.h3,
    textAlign: 'center',
    marginBottom: spacing.xsmall,
  },
  subtitle: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.large,
    paddingHorizontal: spacing.medium,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: spacing.medium,
    marginBottom: spacing.medium,
  },
  optionButton: {
    paddingVertical: spacing.medium,
    paddingHorizontal: spacing.large,
    borderRadius: borderRadius.large,
    alignItems: 'center',
    gap: spacing.xsmall,
    borderWidth: 1,
    minWidth: 100,
  },
  optionText: {
    ...typography.button,
    fontSize: 13,
  },
  hint: {
    ...typography.caption,
  },
  previewContainer: {
    width: '100%',
    aspectRatio: 4 / 3,
    maxHeight: 300,
    borderRadius: borderRadius.large,
    overflow: 'hidden',
    position: 'relative',
  },
  preview: {
    width: '100%',
    height: '100%',
  },
  clearButton: {
    position: 'absolute',
    top: spacing.small,
    right: spacing.small,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: borderRadius.full,
    padding: spacing.xxsmall,
  },
  fileName: {
    ...typography.caption,
    marginTop: spacing.small,
  },
});
