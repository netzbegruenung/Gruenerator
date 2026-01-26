import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  Pressable,
  useColorScheme,
  Alert,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import { File, Paths } from 'expo-file-system';
import { shareFile } from '../../services/share';
import { Button } from '../common';
import type { SharepicResult as SharepicResultType } from '@gruenerator/shared/sharepic';
import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../theme';

interface SharepicResultProps {
  sharepics: SharepicResultType[];
  onNewGeneration?: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_WIDTH = SCREEN_WIDTH - spacing.medium * 2;

export function SharepicResult({ sharepics, onNewGeneration }: SharepicResultProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const isDark = colorScheme === 'dark';

  const [currentIndex, setCurrentIndex] = useState(0);
  const [savedIndices, setSavedIndices] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const currentSharepic = sharepics[currentIndex];
  const hasMultiple = sharepics.length > 1;

  const saveToGallery = useCallback(async () => {
    if (!currentSharepic?.image) return;

    setSaving(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Berechtigung erforderlich', 'Bitte erlaube den Zugriff auf die Galerie.');
        return;
      }

      const base64Data = currentSharepic.image.replace(/^data:image\/\w+;base64,/, '');
      const file = new File(Paths.cache, `sharepic_${Date.now()}.png`);

      // Convert base64 to Uint8Array and write
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      file.write(bytes);

      await MediaLibrary.saveToLibraryAsync(file.uri);

      setSavedIndices((prev) => new Set(prev).add(currentIndex));
      Alert.alert('Gespeichert', 'Sharepic wurde in der Galerie gespeichert.');

      file.delete();
    } catch (error) {
      console.error('[SharepicResult] Save error:', error);
      Alert.alert('Fehler', 'Das Sharepic konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }, [currentSharepic, currentIndex]);

  const handleShare = useCallback(async () => {
    if (!currentSharepic?.image) return;

    try {
      const base64Data = currentSharepic.image.replace(/^data:image\/\w+;base64,/, '');
      const file = new File(Paths.cache, `sharepic_share_${Date.now()}.png`);

      // Convert base64 to Uint8Array and write
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      file.write(bytes);

      await shareFile(file.uri, { mimeType: 'image/png', dialogTitle: 'Sharepic teilen' });

      file.delete();
    } catch (error) {
      console.error('[SharepicResult] Share error:', error);
      Alert.alert('Fehler', 'Das Sharepic konnte nicht geteilt werden.');
    }
  }, [currentSharepic]);

  const isSaved = savedIndices.has(currentIndex);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {hasMultiple && (
        <View style={styles.pagination}>
          {sharepics.map((_, index) => (
            <Pressable
              key={index}
              onPress={() => setCurrentIndex(index)}
              style={[
                styles.paginationDot,
                {
                  backgroundColor:
                    index === currentIndex
                      ? colors.primary[600]
                      : isDark
                        ? colors.grey[700]
                        : colors.grey[300],
                },
              ]}
            />
          ))}
        </View>
      )}

      {hasMultiple && (
        <Text style={[styles.counter, { color: theme.textSecondary }]}>
          {currentIndex + 1} / {sharepics.length}
        </Text>
      )}

      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const newIndex = Math.round(e.nativeEvent.contentOffset.x / IMAGE_WIDTH);
          if (newIndex >= 0 && newIndex < sharepics.length) {
            setCurrentIndex(newIndex);
          }
        }}
        contentContainerStyle={styles.scrollContent}
      >
        {sharepics.map((sharepic, index) => (
          <View key={sharepic.id || index} style={styles.imageContainer}>
            <Image source={{ uri: sharepic.image }} style={styles.image} resizeMode="contain" />
            {savedIndices.has(index) && (
              <View style={styles.savedBadge}>
                <Ionicons name="checkmark-circle" size={16} color={colors.white} />
                <Text style={styles.savedText}>Gespeichert</Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {currentSharepic?.text && (
        <View
          style={[
            styles.textContainer,
            { backgroundColor: isDark ? colors.grey[900] : colors.grey[50] },
          ]}
        >
          <Text style={[styles.text, { color: theme.text }]} numberOfLines={3}>
            {currentSharepic.text}
          </Text>
        </View>
      )}

      <View style={styles.actions}>
        <Button
          onPress={saveToGallery}
          variant={isSaved ? 'secondary' : 'primary'}
          loading={saving}
          style={styles.actionButton}
        >
          <View style={styles.buttonContent}>
            <Ionicons
              name={isSaved ? 'checkmark-circle' : 'download-outline'}
              size={18}
              color={isSaved ? colors.primary[600] : colors.white}
            />
            <Text
              style={[styles.buttonText, { color: isSaved ? colors.primary[600] : colors.white }]}
            >
              {isSaved ? 'Gespeichert' : 'Speichern'}
            </Text>
          </View>
        </Button>

        <Button onPress={handleShare} variant="secondary" style={styles.actionButton}>
          <View style={styles.buttonContent}>
            <Ionicons name="share-outline" size={18} color={colors.primary[600]} />
            <Text style={[styles.buttonText, { color: colors.primary[600] }]}>Teilen</Text>
          </View>
        </Button>
      </View>

      {onNewGeneration && (
        <Pressable onPress={onNewGeneration} style={styles.newButton}>
          <Text style={[styles.newButtonText, { color: theme.textSecondary }]}>
            Neues Sharepic erstellen
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.medium,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xsmall,
    marginBottom: spacing.small,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  counter: {
    ...typography.caption,
    textAlign: 'center',
    marginBottom: spacing.small,
  },
  scrollContent: {
    gap: spacing.medium,
  },
  imageContainer: {
    width: IMAGE_WIDTH,
    aspectRatio: 1,
    borderRadius: borderRadius.large,
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  savedBadge: {
    position: 'absolute',
    bottom: spacing.small,
    right: spacing.small,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: spacing.xxsmall,
    paddingHorizontal: spacing.small,
    borderRadius: borderRadius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  savedText: {
    ...typography.caption,
    color: colors.white,
  },
  textContainer: {
    marginTop: spacing.medium,
    padding: spacing.medium,
    borderRadius: borderRadius.medium,
  },
  text: {
    ...typography.body,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.medium,
    marginTop: spacing.large,
  },
  actionButton: {
    flex: 1,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xsmall,
  },
  buttonText: {
    ...typography.button,
  },
  newButton: {
    marginTop: spacing.large,
    alignItems: 'center',
  },
  newButtonText: {
    ...typography.body,
  },
});
