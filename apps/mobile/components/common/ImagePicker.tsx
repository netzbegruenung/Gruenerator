import { View, Text, StyleSheet, Image, Pressable, ActivityIndicator } from 'react-native';
import { useState, useCallback } from 'react';
import * as ExpoImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../../theme';

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
  const [loading, setLoading] = useState(false);

  const pickImage = useCallback(async () => {
    setLoading(true);

    try {
      const permissionResult = await ExpoImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        onError('Zugriff auf die Galerie wurde verweigert');
        setLoading(false);
        return;
      }

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
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={styles.loadingText}>Bild wird geladen...</Text>
        </View>
      </View>
    );
  }

  if (selectedImage) {
    return (
      <View style={styles.container}>
        <View style={styles.previewContainer}>
          <Image source={{ uri: selectedImage.uri }} style={styles.preview} resizeMode="cover" />
          <Pressable style={styles.clearButton} onPress={onClear}>
            <Ionicons name="close-circle" size={28} color={colors.white} />
          </Pressable>
        </View>
        <Text style={styles.fileName} numberOfLines={1}>
          {selectedImage.fileName}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons name="image-outline" size={48} color={colors.primary[600]} />
      </View>

      <Text style={styles.title}>Bild auswählen</Text>
      <Text style={styles.subtitle}>Wähle ein Bild aus deiner Galerie oder nimm ein Foto auf</Text>

      <View style={styles.buttonContainer}>
        <Pressable style={styles.optionButton} onPress={pickImage}>
          <Ionicons name="images-outline" size={28} color={colors.primary[600]} />
          <Text style={styles.optionText}>Galerie</Text>
        </Pressable>

        <Pressable style={styles.optionButton} onPress={takePhoto}>
          <Ionicons name="camera-outline" size={28} color={colors.primary[600]} />
          <Text style={styles.optionText}>Kamera</Text>
        </Pressable>
      </View>

      <Text style={styles.hint}>Max. {maxSizeMB}MB, JPG/PNG/WebP</Text>
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
    color: colors.grey[600],
  },
  iconContainer: {
    marginBottom: spacing.medium,
  },
  title: {
    ...typography.h3,
    color: colors.grey[800],
    textAlign: 'center',
    marginBottom: spacing.xsmall,
  },
  subtitle: {
    ...typography.body,
    color: colors.grey[600],
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
    backgroundColor: colors.primary[50],
    paddingVertical: spacing.medium,
    paddingHorizontal: spacing.large,
    borderRadius: borderRadius.large,
    alignItems: 'center',
    gap: spacing.xsmall,
    borderWidth: 1,
    borderColor: colors.primary[200],
    minWidth: 100,
  },
  optionText: {
    ...typography.button,
    color: colors.primary[600],
    fontSize: 13,
  },
  hint: {
    ...typography.caption,
    color: colors.grey[500],
  },
  previewContainer: {
    width: '100%',
    aspectRatio: 4 / 3,
    maxHeight: 300,
    borderRadius: borderRadius.large,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: colors.grey[100],
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
    color: colors.grey[600],
    marginTop: spacing.small,
  },
});
